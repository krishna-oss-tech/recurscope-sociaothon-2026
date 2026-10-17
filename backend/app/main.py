from __future__ import annotations

import json
import os
import uuid
from contextlib import asynccontextmanager
from datetime import timedelta
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from .database import Base, engine, get_db, SessionLocal
from .models import User, Hotspot, Report, Task, HotspotEvent, Intervention, FollowUp, Handoff, AuditLog, AppSetting
from .schemas import (LoginRequest, TaskCreate, TaskUpdate, FollowUpCreate, InterventionCreate,
                      InterventionUpdate, HandoffCreate, HandoffUpdate, RecurrenceConfirm, AssociateReport,
                      PilotConfigUpdate)
from .security import verify_password, create_access_token, get_current_user, allow_roles
from .logic import utcnow, as_naive_utc, distance_m, add_event, score_hotspot
from .seed import seed_demo, bootstrap_admin

APP_VERSION = "0.5.0"
EVIDENCE_DIR = Path(os.getenv("EVIDENCE_DIR", "./storage/evidence")).resolve()
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_MB", "5")) * 1024 * 1024
HOTSPOT_RADIUS_METERS = float(os.getenv("HOTSPOT_RADIUS_METERS", "100"))
ALLOWED_STREAMS = {"WET", "DRY", "SANITARY", "SPECIAL_CARE", "MIXED_UNKNOWN"}
ALLOWED_ISSUES = {"DUMPING", "MISSED_PICKUP", "MIXED_WASTE", "DRY_RECYCLABLES", "SANITARY", "SPECIAL_CARE", "SHARP_OR_HAZARDOUS", "BURNING", "OTHER"}
TASK_STATES = {"ASSIGNED", "IN_PROGRESS", "AWAITING_VERIFICATION", "VERIFIED_RESOLVED", "REJECTED"}

DEFAULT_PILOT_CONFIG = {
    "name": os.getenv("PILOT_NAME", "Nagpur Central Pilot"),
    "latitude": float(os.getenv("PILOT_LAT", "21.1458")),
    "longitude": float(os.getenv("PILOT_LNG", "79.0882")),
    "radius_km": float(os.getenv("PILOT_RADIUS_KM", "15.0")),
    "default_ward": os.getenv("PILOT_DEFAULT_WARD", "Ward 01"),
}


def _get_pilot_config(db: Session) -> dict:
    config = dict(DEFAULT_PILOT_CONFIG)
    keys = ["pilot_name", "pilot_lat", "pilot_lng", "pilot_radius_km", "pilot_default_ward"]
    settings = {s.key: s.value for s in db.query(AppSetting).filter(AppSetting.key.in_(keys)).all()}
    if "pilot_name" in settings:
        config["name"] = settings["pilot_name"]
    if "pilot_lat" in settings:
        try: config["latitude"] = float(settings["pilot_lat"])
        except ValueError: pass
    if "pilot_lng" in settings:
        try: config["longitude"] = float(settings["pilot_lng"])
        except ValueError: pass
    if "pilot_radius_km" in settings:
        try: config["radius_km"] = float(settings["pilot_radius_km"])
        except ValueError: pass
    if "pilot_default_ward" in settings:
        config["default_ward"] = settings["pilot_default_ward"]
    return config


@asynccontextmanager
async def app_lifespan(_app: FastAPI):
    env = os.getenv("ENVIRONMENT", "development").lower()
    if env == "production":
        if not os.getenv("EVIDENCE_DIR") and os.getenv("ALLOW_EPHEMERAL_STORAGE", "false").lower() not in {"true", "1", "yes"}:
            raise RuntimeError("CRITICAL: Production requires an explicit EVIDENCE_DIR pointing to durable mounted storage (e.g. /app/storage/evidence).")

    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    test_file = EVIDENCE_DIR / ".write_test"
    try:
        test_file.write_text("ok")
        test_file.unlink()
    except Exception as exc:
        raise RuntimeError(f"CRITICAL: Evidence storage directory {EVIDENCE_DIR} is not writable: {exc}")

    Base.metadata.create_all(bind=engine)
    if engine.dialect.name == "sqlite":
        with engine.begin() as conn:
            try:
                res = conn.exec_driver_sql("PRAGMA table_info(hotspots)").fetchall()
                col_names = [r[1] for r in res]
                if "is_demo" not in col_names and col_names:
                    conn.exec_driver_sql("ALTER TABLE hotspots ADD COLUMN is_demo BOOLEAN DEFAULT 0")
            except Exception:
                pass
    elif engine.dialect.name == "postgresql":
        try:
            with engine.begin() as connection:
                connection.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
        except Exception:
            # Managed databases may pre-provision extensions or deny extension changes.
            pass

    seed_demo_flag = os.getenv("SEED_DEMO")
    should_seed = (
        seed_demo_flag.lower() in {"true", "1", "yes"}
        if seed_demo_flag is not None
        else (env != "production")
    )

    db = SessionLocal()
    try:
        if should_seed:
            seed_demo(db)
        else:
            bootstrap_admin(db)
    finally:
        db.close()
    yield


app = FastAPI(title="RecurScope API", version=APP_VERSION, lifespan=app_lifespan,
              description="Evidence-led recurring waste hotspot workflow. Demo records are synthetic.")

cors_origins_env = os.getenv("CORS_ORIGINS", "http://localhost:5188,http://127.0.0.1:5188")
origins = [x.strip() for x in cors_origins_env.split(",") if x.strip()]
cors_origin_regex = os.getenv("CORS_ORIGIN_REGEX")

if "*" in origins:
    # Starlette disallows allow_credentials=True when allow_origins=["*"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_origin_regex=cors_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


def _audit(db: Session, actor_id: int | None, action: str, target_type: str, target_id: int | str, changed_fields: str = ""):
    db.add(AuditLog(actor_id=actor_id, action=action, target_type=target_type, target_id=str(target_id),
                    changed_fields=changed_fields, created_at=utcnow()))


def _save_image(file: UploadFile) -> str:
    if not file:
        raise HTTPException(400, "An image is required")
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(415, "Upload a JPG, PNG or WebP image")
    from PIL import Image, UnidentifiedImageError
    raw = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"Image exceeds {MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit")
    try:
        import io
        im = Image.open(io.BytesIO(raw))
        im.verify()
        im = Image.open(io.BytesIO(raw))
        im = im.convert("RGB")
        im.thumbnail((1800, 1800))
        key = f"{uuid.uuid4().hex}.jpg"
        im.save(EVIDENCE_DIR / key, format="JPEG", quality=86, optimize=True)
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(415, "The uploaded file is not a valid image") from exc
    return key


def _user_dict(user: User) -> dict:
    return {"id": user.id, "username": user.username, "display_name": user.display_name, "role": user.role}


def _hotspot_dict(db: Session, h: Hotspot) -> dict:
    reports = db.query(Report).filter(Report.hotspot_id == h.id).order_by(Report.created_at.desc()).all()
    tasks = db.query(Task).filter(Task.hotspot_id == h.id).order_by(Task.created_at.desc()).all()
    score = score_hotspot(db, h)
    latest_report = reports[0] if reports else None
    overdue = any(t.status in {"ASSIGNED", "IN_PROGRESS", "AWAITING_VERIFICATION"} and t.due_at < utcnow() for t in tasks)
    return {
        "id": h.id, "code": h.code, "label": h.label, "ward": h.ward,
        "latitude": h.latitude, "longitude": h.longitude, "status": h.status,
        "first_seen_at": h.first_seen_at.isoformat() if h.first_seen_at else None,
        "last_seen_at": h.last_seen_at.isoformat() if h.last_seen_at else None,
        "recurrence_count": h.recurrence_count, "last_verified_cleanup_at": h.last_verified_cleanup_at.isoformat() if h.last_verified_cleanup_at else None,
        "report_count": len(reports), "open_task_count": sum(1 for t in tasks if t.status not in {"VERIFIED_RESOLVED"}),
        "overdue": overdue, "latest_issue": latest_report.issue_type if latest_report else None,
        "priority": score, "is_demo": getattr(h, "is_demo", False),
    }


def _report_dict(r: Report, hotspot: Hotspot | None = None) -> dict:
    return {"id": r.id, "hotspot_id": r.hotspot_id, "hotspot_code": hotspot.code if hotspot else None,
            "ward": hotspot.ward if hotspot else None,
            "issue_type": r.issue_type, "description": r.description, "latitude": r.latitude, "longitude": r.longitude,
            "gps_accuracy_m": r.gps_accuracy_m, "location_precision": r.location_precision,
            "outside_pilot_area": "outside_pilot" in (r.location_precision or ""),
            "photo_key": r.photo_key, "verification_state": r.verification_state, "is_demo": r.is_demo,
            "created_at": r.created_at.isoformat() if r.created_at else None}


def _task_dict(db: Session, t: Task) -> dict:
    h = db.get(Hotspot, t.hotspot_id)
    worker = db.get(User, t.assigned_worker_id) if t.assigned_worker_id else None
    creator = db.get(User, t.created_by_id)
    reviewer = db.get(User, t.reviewer_id) if t.reviewer_id else None
    return {"id": t.id, "code": t.code, "hotspot_id": t.hotspot_id, "hotspot_code": h.code if h else None,
            "hotspot_label": h.label if h else None, "ward": h.ward if h else None,
            "assigned_worker_id": t.assigned_worker_id, "assigned_worker": worker.display_name if worker else "Unassigned",
            "created_by": creator.display_name if creator else "", "due_at": t.due_at.isoformat(), "status": t.status,
            "stream": t.stream, "before_key": t.before_key, "after_key": t.after_key,
            "before_latitude": t.before_latitude, "before_longitude": t.before_longitude,
            "after_latitude": t.after_latitude, "after_longitude": t.after_longitude,
            "after_uploaded_at": t.after_uploaded_at.isoformat() if t.after_uploaded_at else None,
            "reviewer": reviewer.display_name if reviewer else None,
            "verified_at": t.verified_at.isoformat() if t.verified_at else None,
            "notes": t.notes, "is_demo": t.is_demo, "created_at": t.created_at.isoformat()}


def _event_dict(e: HotspotEvent, actor: User | None = None) -> dict:
    return {"id": e.id, "event_type": e.event_type, "notes": e.notes, "actor": actor.display_name if actor else "System",
            "report_id": e.report_id, "task_id": e.task_id, "evidence_key": e.evidence_key,
            "latitude": e.latitude, "longitude": e.longitude, "is_demo": e.is_demo, "created_at": e.created_at.isoformat()}


def _intervention_dict(i: Intervention) -> dict:
    return {"id": i.id, "hotspot_id": i.hotspot_id, "hypothesis_code": i.hypothesis_code, "rationale": i.rationale,
            "action_type": i.action_type, "owner": i.owner, "due_at": i.due_at.isoformat(), "status": i.status,
            "completed_at": i.completed_at.isoformat() if i.completed_at else None, "follow_up_dates": [int(x) for x in i.follow_up_dates.split(",") if x],
            "outcome_notes": i.outcome_notes, "is_demo": i.is_demo, "created_at": i.created_at.isoformat()}


def _followup_dict(f: FollowUp) -> dict:
    return {"id": f.id, "hotspot_id": f.hotspot_id, "intervention_id": f.intervention_id,
            "scheduled_at": f.scheduled_at.isoformat(), "window_days": f.window_days, "observed_state": f.observed_state,
            "evidence_key": f.evidence_key, "notes": f.notes, "observed_at": f.observed_at.isoformat() if f.observed_at else None,
            "is_demo": f.is_demo}


def _upsert_followup_observation(db: Session, hotspot: Hotspot, user: User, window_days: int, state: str,
                                 notes: str, evidence_key: str | None, intervention_id: int | None = None) -> FollowUp:
    """Update the scheduled intervention window instead of creating duplicate outcome rows."""
    intervention = None
    if intervention_id is not None:
        intervention = db.get(Intervention, intervention_id)
        if not intervention:
            raise HTTPException(404, "Preventive intervention not found")
        if intervention.hotspot_id != hotspot.id:
            raise HTTPException(422, "The selected intervention belongs to a different hotspot")
        supported_windows = {int(x) for x in intervention.follow_up_dates.split(",") if x}
        if window_days not in supported_windows:
            raise HTTPException(422, f"This intervention has no scheduled {window_days}-day follow-up window")

    followup = None
    if intervention is not None:
        followup = db.query(FollowUp).filter(
            FollowUp.hotspot_id == hotspot.id,
            FollowUp.intervention_id == intervention.id,
            FollowUp.window_days == window_days,
            FollowUp.observed_state == "NOT_OBSERVED",
        ).order_by(FollowUp.scheduled_at.asc()).first()
    else:
        followup = db.query(FollowUp).filter(
            FollowUp.hotspot_id == hotspot.id,
            FollowUp.intervention_id.is_(None),
            FollowUp.window_days == window_days,
            FollowUp.observed_state == "NOT_OBSERVED",
        ).order_by(FollowUp.scheduled_at.asc()).first()

    if followup is None:
        followup = FollowUp(hotspot_id=hotspot.id, intervention_id=intervention_id,
                            scheduled_at=utcnow(), window_days=window_days, is_demo=hotspot.is_demo)
        db.add(followup)
    followup.observed_state = state
    followup.evidence_key = evidence_key
    followup.reviewer_id = user.id
    followup.notes = notes.strip()
    followup.observed_at = utcnow()
    followup.is_demo = hotspot.is_demo
    db.flush()
    return followup


def _handoff_dict(db: Session, h: Handoff) -> dict:
    task = db.get(Task, h.task_id)
    hotspot = db.get(Hotspot, task.hotspot_id) if task else None
    return {"id": h.id, "task_id": h.task_id, "task_code": task.code if task else None,
            "hotspot_code": hotspot.code if hotspot else None, "stream": h.stream, "receiver_name": h.receiver_name,
            "quantity": h.quantity, "unit": h.unit, "status": h.status, "evidence_key": h.evidence_key,
            "notes": h.notes, "received_at": h.received_at.isoformat() if h.received_at else None,
            "is_demo": h.is_demo, "created_at": h.created_at.isoformat()}


@app.get("/health")
def health(db: Session = Depends(get_db)):
    db_ok = True
    db_status = "connected"
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:
        db_ok = False
        db_status = f"unhealthy: {exc}"
    return {
        "ok": db_ok,
        "service": "recurscope-api",
        "version": APP_VERSION,
        "database": db_status,
        "environment": os.getenv("ENVIRONMENT", "development"),
    }


@app.post("/api/auth/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == payload.username).first()
    if not user or not user.active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Incorrect username or password")
    return {"access_token": create_access_token(user), "token_type": "bearer", "user": _user_dict(user)}


@app.get("/api/auth/me")
def me(user: User = Depends(get_current_user)):
    return _user_dict(user)


@app.get("/api/users")
def list_users(role: str | None = None, db: Session = Depends(get_db), user: User = Depends(allow_roles("admin"))):
    query = db.query(User).filter(User.active.is_(True))
    if role:
        query = query.filter(User.role == role)
    return [_user_dict(x) for x in query.order_by(User.display_name).all()]


@app.get("/api/summary")
def summary(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    hotspots = db.query(Hotspot).all()
    tasks = db.query(Task).all()
    reports = db.query(Report).all()
    active_tasks = [t for t in tasks if t.status in {"ASSIGNED", "IN_PROGRESS", "AWAITING_VERIFICATION"}]
    overdue = [t for t in active_tasks if t.due_at < utcnow()]
    recurrences = sum(1 for h in hotspots if h.recurrence_count > 0)
    confirmed = [f for f in db.query(FollowUp).all() if f.observed_state in {"NO_RETURN", "CONFIRMED_RETURN"}]
    returned_hotspots = {f.hotspot_id for f in confirmed if f.observed_state == "CONFIRMED_RETURN"}
    eligible_hotspots = {f.hotspot_id for f in confirmed}
    recurrence_rate = (len(returned_hotspots) / len(eligible_hotspots) * 100) if eligible_hotspots else None
    verified_tasks = [t for t in tasks if t.verified_at]
    clearance_hours = []
    for t in verified_tasks:
        first_report = db.query(func.min(Report.created_at)).filter(Report.hotspot_id == t.hotspot_id).scalar()
        if first_report and t.verified_at >= first_report:
            clearance_hours.append((t.verified_at-first_report).total_seconds()/3600)
    clearance_hours.sort()
    median_clearance = None
    if clearance_hours:
        n = len(clearance_hours)
        median_clearance = clearance_hours[n//2] if n % 2 else (clearance_hours[n//2-1] + clearance_hours[n//2])/2
    handoffs = db.query(Handoff).all()
    completed_handoffs = sum(1 for h in handoffs if h.status == "RECEIVED" and h.receiver_name.strip())
    is_synthetic = all(getattr(h, "is_demo", False) for h in hotspots) if hotspots else (os.getenv("ENVIRONMENT", "development").lower() != "production")
    note = "Metrics use simulated demo records and recorded observations; missing follow-up is not counted as no recurrence." if is_synthetic else "Operational metrics computed from verified records and recorded observation windows."
    return {"synthetic_data": is_synthetic, "hotspots": len(hotspots), "reports": len(reports), "active_tasks": len(active_tasks),
            "overdue_tasks": len(overdue), "confirmed_recurrence_hotspots": recurrences,
            "recurrence_rate_percent": round(recurrence_rate, 1) if recurrence_rate is not None else None,
            "recurrence_numerator": len(returned_hotspots), "recurrence_denominator": len(eligible_hotspots),
            "median_clearance_hours": round(median_clearance, 1) if median_clearance is not None else None,
            "verified_task_count": len(verified_tasks), "task_count": len(tasks), "handoff_completed": completed_handoffs,
            "handoff_total": len(handoffs), "note": note}


@app.get("/api/config/pilot")
def get_pilot_config(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _get_pilot_config(db)


@app.patch("/api/config/pilot")
def update_pilot_config(payload: PilotConfigUpdate, db: Session = Depends(get_db), user: User = Depends(allow_roles("admin"))):
    data = payload.model_dump(exclude_unset=True)
    if "name" in data:
        val = (data["name"] or "").strip()[:100]
        if not val:
            raise HTTPException(422, "Pilot area name cannot be empty")
        setting = db.get(AppSetting, "pilot_name") or AppSetting(key="pilot_name", value=val)
        setting.value = val; db.add(setting)
    if "latitude" in data:
        lat = data["latitude"]
        if lat is None or not (-90 <= lat <= 90):
            raise HTTPException(422, "Invalid latitude")
        setting = db.get(AppSetting, "pilot_lat") or AppSetting(key="pilot_lat", value=str(lat))
        setting.value = str(lat); db.add(setting)
    if "longitude" in data:
        lng = data["longitude"]
        if lng is None or not (-180 <= lng <= 180):
            raise HTTPException(422, "Invalid longitude")
        setting = db.get(AppSetting, "pilot_lng") or AppSetting(key="pilot_lng", value=str(lng))
        setting.value = str(lng); db.add(setting)
    if "radius_km" in data:
        rad = data["radius_km"]
        if rad is None or rad <= 0 or rad > 200:
            raise HTTPException(422, "Radius must be between 0.1 and 200 km")
        setting = db.get(AppSetting, "pilot_radius_km") or AppSetting(key="pilot_radius_km", value=str(rad))
        setting.value = str(rad); db.add(setting)
    if "default_ward" in data:
        val = (data["default_ward"] or "").strip()[:80]
        if not val:
            raise HTTPException(422, "Default ward cannot be empty")
        setting = db.get(AppSetting, "pilot_default_ward") or AppSetting(key="pilot_default_ward", value=val)
        setting.value = val; db.add(setting)
    _audit(db, user.id, "PILOT_CONFIG_UPDATED", "config", "pilot", json.dumps(data))
    db.commit()
    return _get_pilot_config(db)



@app.get("/api/hotspots/candidates")
def hotspot_candidates(lat: float, lng: float, radius_m: float = Query(default=HOTSPOT_RADIUS_METERS, ge=10, le=1000),
                       db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    results = []
    if engine.dialect.name == "postgresql":
        try:
            rows = db.execute(text("""
                SELECT id, ST_Distance(
                    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography,
                    ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
                ) AS distance_m
                FROM hotspots
                WHERE ST_DWithin(
                    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography,
                    ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, :radius
                )
                ORDER BY distance_m ASC
            """), {"lat": lat, "lng": lng, "radius": radius_m}).all()
            for row in rows:
                h = db.get(Hotspot, row.id)
                if h:
                    results.append({"id": h.id, "code": h.code, "label": h.label, "ward": h.ward,
                                    "distance_m": round(float(row.distance_m), 1), "status": h.status})
            return results
        except Exception:
            # Spatial extension may be unavailable in a third-party Postgres instance.
            db.rollback()
    for h in db.query(Hotspot).all():
        d = distance_m(lat, lng, h.latitude, h.longitude)
        if d <= radius_m:
            results.append({"id": h.id, "code": h.code, "label": h.label, "ward": h.ward, "distance_m": round(d, 1), "status": h.status})
    return sorted(results, key=lambda x: x["distance_m"])


@app.get("/api/hotspots")
def list_hotspots(ward: str | None = None, status: str | None = None, priority: str | None = None,
                  db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    query = db.query(Hotspot)
    if ward:
        query = query.filter(Hotspot.ward == ward)
    if status:
        query = query.filter(Hotspot.status == status)
    output = [_hotspot_dict(db, h) for h in query.order_by(Hotspot.last_seen_at.desc()).all()]
    if priority:
        output = [h for h in output if h["priority"]["band"] == priority]
    return output


@app.get("/api/hotspots/{hotspot_id}/passport")
def hotspot_passport(hotspot_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    hotspot = db.get(Hotspot, hotspot_id)
    if not hotspot:
        raise HTTPException(404, "Hotspot not found")
    reports = db.query(Report).filter(Report.hotspot_id == hotspot_id).order_by(Report.created_at.desc()).all()
    tasks = db.query(Task).filter(Task.hotspot_id == hotspot_id).order_by(Task.created_at.desc()).all()
    events = db.query(HotspotEvent).filter(HotspotEvent.hotspot_id == hotspot_id).order_by(HotspotEvent.created_at.desc()).all()
    actor_ids = {e.actor_id for e in events if e.actor_id}
    users = {u.id: u for u in db.query(User).filter(User.id.in_(actor_ids)).all()} if actor_ids else {}
    interventions = db.query(Intervention).filter(Intervention.hotspot_id == hotspot_id).order_by(Intervention.created_at.desc()).all()
    followups = db.query(FollowUp).filter(FollowUp.hotspot_id == hotspot_id).order_by(FollowUp.scheduled_at).all()
    possible = [r for r in reports if hotspot.last_verified_cleanup_at and r.created_at > hotspot.last_verified_cleanup_at and r.verification_state in {"POSSIBLE_RETURN", "UNVERIFIED"}]
    return {"hotspot": _hotspot_dict(db, hotspot), "reports": [_report_dict(r, hotspot) for r in reports],
            "tasks": [_task_dict(db, t) for t in tasks], "events": [_event_dict(e, users.get(e.actor_id)) for e in events],
            "interventions": [_intervention_dict(i) for i in interventions], "followups": [_followup_dict(f) for f in followups],
            "possible_return_reports": [_report_dict(r, hotspot) for r in possible]}


@app.get("/api/reports")
def list_reports(hotspot_id: int | None = None, mine: bool = False,
                 db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    query = db.query(Report)
    if user.role == "resident" or mine:
        query = query.filter(Report.reporter_id == user.id)
    elif hotspot_id:
        query = query.filter(Report.hotspot_id == hotspot_id)
    reports = query.order_by(Report.created_at.desc()).all()
    hotspot_ids = {r.hotspot_id for r in reports}
    hotspot_map = {h.id: h for h in db.query(Hotspot).filter(Hotspot.id.in_(hotspot_ids)).all()} if hotspot_ids else {}
    return [_report_dict(r, hotspot_map.get(r.hotspot_id)) for r in reports]


@app.post("/api/reports")
def create_report(issue_type: str = Form(...), description: str = Form(""), ward: str = Form("Ward 01"),
                  lat: float = Form(...), lng: float = Form(...), gps_accuracy_m: float | None = Form(None),
                  hotspot_id: int | None = Form(None), photo: UploadFile | None = File(None),
                  db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    issue_type = issue_type.strip().upper()
    if issue_type not in ALLOWED_ISSUES:
        raise HTTPException(422, "Unsupported issue type")
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise HTTPException(422, "Latitude/longitude are out of range")
    pilot_cfg = _get_pilot_config(db)
    dist_to_pilot_m = distance_m(lat, lng, pilot_cfg["latitude"], pilot_cfg["longitude"])
    is_outside_pilot = dist_to_pilot_m > (pilot_cfg["radius_km"] * 1000)

    photo_key = _save_image(photo) if photo else None
    existing = db.get(Hotspot, hotspot_id) if hotspot_id else None
    if hotspot_id and not existing:
        raise HTTPException(404, "Selected hotspot does not exist")
    if existing:
        if user.role not in {"admin"} and distance_m(lat, lng, existing.latitude, existing.longitude) > HOTSPOT_RADIUS_METERS:
            raise HTTPException(422, "Selected hotspot is outside the candidate radius; choose a closer hotspot or create a new identity")
        hotspot = existing
        hotspot.is_demo = False
    else:
        max_num = db.query(Hotspot).count() + 100
        code = f"HS-{max_num:03d}"
        while db.query(Hotspot).filter(Hotspot.code == code).first():
            max_num += 1
            code = f"HS-{max_num:03d}"
        hotspot = Hotspot(code=code, label=f"Report location {max_num:03d}", ward=ward[:80],
                          latitude=lat, longitude=lng, status="ACTIVE", first_seen_at=utcnow(), last_seen_at=utcnow(),
                          recurrence_count=0, is_demo=False, created_at=utcnow(), updated_at=utcnow())
        db.add(hotspot); db.flush()
    verification = "UNVERIFIED"
    if hotspot.last_verified_cleanup_at and utcnow() > hotspot.last_verified_cleanup_at:
        verification = "POSSIBLE_RETURN"
        hotspot.status = "POSSIBLE_RETURN"
    precision = "manual" if gps_accuracy_m is None else "gps"
    if is_outside_pilot:
        precision += "_outside_pilot"
    report = Report(hotspot_id=hotspot.id, reporter_id=user.id, issue_type=issue_type, description=description.strip()[:2000],
                    latitude=lat, longitude=lng, gps_accuracy_m=gps_accuracy_m, location_precision=precision,
                    photo_key=photo_key, verification_state=verification, is_demo=False, created_at=utcnow())
    db.add(report); db.flush()
    hotspot.last_seen_at = report.created_at
    event_note = f"{issue_type.replace('_',' ').title()} report submitted"
    if is_outside_pilot:
        event_note += f" (Outside primary {pilot_cfg['name']} boundary: {dist_to_pilot_m/1000:.1f} km from center)"
    add_event(db, hotspot.id, "REPORT_SUBMITTED", event_note, user.id,
              report_id=report.id, evidence_key=photo_key, latitude=lat, longitude=lng, is_demo=False)
    if verification == "POSSIBLE_RETURN":
        add_event(db, hotspot.id, "POSSIBLE_RETURN_FLAGGED", "New report arrived after a recorded verified cleanup; human review required", user.id,
                  report_id=report.id, evidence_key=photo_key, latitude=lat, longitude=lng, is_demo=False)
    _audit(db, user.id, "REPORT_CREATED", "report", report.id, f"hotspot_id={hotspot.id}; issue_type={issue_type}; outside_pilot={is_outside_pilot}")
    db.commit(); db.refresh(report)
    rep_dict = _report_dict(report, hotspot)
    rep_dict["outside_pilot_area"] = is_outside_pilot
    rep_dict["pilot_distance_km"] = round(dist_to_pilot_m / 1000, 1) if is_outside_pilot else None
    msg = f"Report saved. Note: Location is {dist_to_pilot_m/1000:.1f} km outside {pilot_cfg['name']} boundary — flagged for supervisor review." if is_outside_pilot else "Report saved. Nearby location grouping remains a reviewable decision."
    return {"report": rep_dict, "hotspot": _hotspot_dict(db, hotspot), "message": msg, "outside_pilot_area": is_outside_pilot}


@app.post("/api/reports/{report_id}/evidence")
def attach_report_evidence(report_id: int, photo: UploadFile = File(...),
                           db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Attach additional image evidence to the existing report; never create a duplicate incident."""
    report = db.get(Report, report_id)
    if not report:
        raise HTTPException(404, "Report not found")
    if user.role != "admin" and report.reporter_id != user.id:
        raise HTTPException(403, "Only the report owner or an authorised supervisor can attach evidence")
    hotspot = db.get(Hotspot, report.hotspot_id)
    if not hotspot:
        raise HTTPException(404, "Canonical hotspot not found")
    photo_key = _save_image(photo)
    previous_key = report.photo_key
    report.photo_key = photo_key
    add_event(db, hotspot.id, "REPORT_EVIDENCE_ATTACHED",
              "Additional image evidence attached to the existing report; supervisor review remains required",
              user.id, report_id=report.id, evidence_key=photo_key,
              latitude=report.latitude, longitude=report.longitude, is_demo=report.is_demo)
    _audit(db, user.id, "REPORT_EVIDENCE_ATTACHED", "report", report.id,
           f"previous_evidence={'present' if previous_key else 'missing'};new_evidence=present")
    db.commit(); db.refresh(report)
    return {"report": _report_dict(report, hotspot), "message": "Evidence attached to the existing report. Review and confirmation are still required."}


@app.post("/api/reports/{report_id}/associate")
def associate_report(report_id: int, payload: AssociateReport, db: Session = Depends(get_db), user: User = Depends(allow_roles("admin"))):
    report = db.get(Report, report_id)
    target = db.get(Hotspot, payload.hotspot_id)
    if not report or not target:
        raise HTTPException(404, "Report or hotspot not found")
    if distance_m(report.latitude, report.longitude, target.latitude, target.longitude) > HOTSPOT_RADIUS_METERS:
        raise HTTPException(422, f"Association exceeds configured {int(HOTSPOT_RADIUS_METERS)} m review radius")
    old_id = report.hotspot_id
    report.hotspot_id = target.id
    report.verification_state = "POSSIBLE_RETURN" if target.last_verified_cleanup_at and report.created_at > target.last_verified_cleanup_at else "UNVERIFIED"
    add_event(db, target.id, "REPORT_ASSOCIATED", f"Report {report.id} manually associated from hotspot {old_id}", user.id, report_id=report.id,
              evidence_key=report.photo_key, latitude=report.latitude, longitude=report.longitude)
    _audit(db, user.id, "REPORT_ASSOCIATED", "report", report.id, f"from={old_id};to={target.id}")
    db.commit()
    return {"report": _report_dict(report, target), "hotspot": _hotspot_dict(db, target)}


@app.post("/api/tasks")
def create_task(payload: TaskCreate, db: Session = Depends(get_db), user: User = Depends(allow_roles("admin"))):
    hotspot = db.get(Hotspot, payload.hotspot_id)
    if not hotspot:
        raise HTTPException(404, "Hotspot not found")
    if payload.stream.upper() not in ALLOWED_STREAMS:
        raise HTTPException(422, "Unsupported waste stream")
    worker_id = payload.assigned_worker_id
    if worker_id:
        worker = db.get(User, worker_id)
        if not worker or worker.role != "worker":
            raise HTTPException(422, "Task assignee must be an active worker")
    max_num = db.query(Task).count() + 1
    code = f"TSK-{max_num:03d}"
    while db.query(Task).filter(Task.code == code).first():
        max_num += 1
        code = f"TSK-{max_num:03d}"
    task = Task(code=code, hotspot_id=hotspot.id, assigned_worker_id=worker_id, created_by_id=user.id,
                due_at=as_naive_utc(payload.due_at), status="ASSIGNED", stream=payload.stream.upper(), notes=payload.notes.strip(),
                is_demo=False, created_at=utcnow(), updated_at=utcnow())
    db.add(task); db.flush()
    add_event(db, hotspot.id, "TASK_ASSIGNED", f"Task {task.code} assigned; due {task.due_at.isoformat()}", user.id, task_id=task.id)
    _audit(db, user.id, "TASK_CREATED", "task", task.id, f"worker={worker_id};due_at={task.due_at.isoformat()}")
    db.commit(); db.refresh(task)
    return _task_dict(db, task)


@app.get("/api/tasks")
def list_tasks(status: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    query = db.query(Task)
    if user.role == "worker":
        query = query.filter(Task.assigned_worker_id == user.id)
    elif user.role == "receiver":
        routed_task_ids = [h.task_id for h in db.query(Handoff).filter(Handoff.receiver_name == user.display_name).all()]
        query = query.filter(Task.id.in_(routed_task_ids)) if routed_task_ids else query.filter(Task.id == -1)
    elif user.role == "resident":
        own_hotspot_ids = [r.hotspot_id for r in db.query(Report).filter(Report.reporter_id == user.id).all()]
        query = query.filter(Task.hotspot_id.in_(own_hotspot_ids)) if own_hotspot_ids else query.filter(Task.id == -1)
    if status:
        query = query.filter(Task.status == status.upper())
    return [_task_dict(db, t) for t in query.order_by(Task.due_at.asc()).all()]


@app.patch("/api/tasks/{task_id}")
def update_task(task_id: int, payload: TaskUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    if user.role == "worker" and task.assigned_worker_id != user.id:
        raise HTTPException(403, "Workers can update assigned tasks only")
    if user.role not in {"admin", "worker"}:
        raise HTTPException(403, "Your role cannot update tasks")
    changes = {}
    if payload.assigned_worker_id is not None:
        if user.role != "admin":
            raise HTTPException(403, "Only supervisors can reassign tasks")
        worker = db.get(User, payload.assigned_worker_id)
        if not worker or worker.role != "worker":
            raise HTTPException(422, "Task assignee must be an active worker")
        task.assigned_worker_id = worker.id; changes["assigned_worker_id"] = worker.id
    if payload.due_at is not None:
        if user.role != "admin":
            raise HTTPException(403, "Only supervisors can change due times")
        task.due_at = as_naive_utc(payload.due_at); changes["due_at"] = task.due_at.isoformat()
    if payload.stream is not None:
        if payload.stream.upper() not in ALLOWED_STREAMS:
            raise HTTPException(422, "Unsupported waste stream")
        task.stream = payload.stream.upper(); changes["stream"] = task.stream
    if payload.notes is not None:
        task.notes = payload.notes.strip(); changes["notes"] = "updated"
    task.updated_at = utcnow()
    _audit(db, user.id, "TASK_UPDATED", "task", task.id, json.dumps(changes))
    db.commit(); db.refresh(task)
    return _task_dict(db, task)


@app.post("/api/tasks/{task_id}/start")
def start_task(task_id: int, db: Session = Depends(get_db), user: User = Depends(allow_roles("admin", "worker"))):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    if user.role == "worker" and task.assigned_worker_id != user.id:
        raise HTTPException(403, "Workers can start assigned tasks only")
    if task.status != "ASSIGNED":
        raise HTTPException(409, f"Only ASSIGNED tasks can start; current status is {task.status}")
    task.status = "IN_PROGRESS"; task.updated_at = utcnow()
    add_event(db, task.hotspot_id, "TASK_STARTED", f"Task {task.code} work started", user.id, task_id=task.id)
    _audit(db, user.id, "TASK_STARTED", "task", task.id)
    db.commit(); db.refresh(task)
    return _task_dict(db, task)


@app.post("/api/tasks/{task_id}/evidence")
def upload_task_evidence(task_id: int, kind: str = Form(...), latitude: float = Form(...), longitude: float = Form(...),
                         photo: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(allow_roles("admin", "worker"))):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    if user.role == "worker" and task.assigned_worker_id != user.id:
        raise HTTPException(403, "Workers can add evidence to assigned tasks only")
    kind = kind.lower()
    if kind not in {"before", "after"}:
        raise HTTPException(422, "Evidence kind must be before or after")
    if kind == "before" and task.status not in {"ASSIGNED", "IN_PROGRESS"}:
        raise HTTPException(409, "Before evidence can only be submitted before resolution")
    if kind == "after" and task.status != "IN_PROGRESS":
        raise HTTPException(409, "After evidence requires an IN_PROGRESS task")
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        raise HTTPException(422, "Latitude/longitude are out of range")
    hotspot = db.get(Hotspot, task.hotspot_id)
    if distance_m(latitude, longitude, hotspot.latitude, hotspot.longitude) > 250:
        raise HTTPException(422, "Evidence location is too far from the hotspot; check the pin")
    key = _save_image(photo)
    if kind == "before":
        task.before_key, task.before_latitude, task.before_longitude = key, latitude, longitude
    else:
        task.after_key, task.after_latitude, task.after_longitude, task.after_uploaded_at = key, latitude, longitude, utcnow()
    task.updated_at = utcnow()
    add_event(db, hotspot.id, f"{kind.upper()}_EVIDENCE_ADDED", f"{kind.title()} evidence submitted for {task.code}", user.id,
              task_id=task.id, evidence_key=key, latitude=latitude, longitude=longitude)
    _audit(db, user.id, "TASK_EVIDENCE_ADDED", "task", task.id, f"kind={kind};key={key}")
    db.commit(); db.refresh(task)
    return _task_dict(db, task)


@app.post("/api/tasks/{task_id}/finish")
def finish_task(task_id: int, db: Session = Depends(get_db), user: User = Depends(allow_roles("admin", "worker"))):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    if user.role == "worker" and task.assigned_worker_id != user.id:
        raise HTTPException(403, "Workers can finish assigned tasks only")
    if task.status != "IN_PROGRESS":
        raise HTTPException(409, "Task must be IN_PROGRESS before submitting for verification")
    if not task.before_key:
        raise HTTPException(422, "Submit before-photo evidence before completing field work")
    if not task.after_key or task.after_latitude is None or task.after_uploaded_at is None:
        raise HTTPException(422, "Submit after-photo with location and timestamp before finishing the task")
    if task.stream == "MIXED_UNKNOWN":
        # Unknown remains an explicit valid state, but user is warned to confirm it deliberately in the UI.
        pass
    task.status = "AWAITING_VERIFICATION"; task.updated_at = utcnow()
    add_event(db, task.hotspot_id, "AWAITING_VERIFICATION", f"Task {task.code} submitted for human review", user.id,
              task_id=task.id, evidence_key=task.after_key, latitude=task.after_latitude, longitude=task.after_longitude)
    _audit(db, user.id, "TASK_SUBMITTED_FOR_REVIEW", "task", task.id)
    db.commit(); db.refresh(task)
    return _task_dict(db, task)


@app.post("/api/tasks/{task_id}/verify")
def verify_task(task_id: int, approved: bool = Form(...), notes: str = Form(""),
                db: Session = Depends(get_db), user: User = Depends(allow_roles("admin"))):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    if task.status != "AWAITING_VERIFICATION":
        raise HTTPException(409, "Only submitted evidence can be reviewed")
    hotspot = db.get(Hotspot, task.hotspot_id)
    if approved:
        if not task.after_key or task.after_uploaded_at is None or task.after_latitude is None or task.after_longitude is None:
            raise HTTPException(422, "Evidence is incomplete")
        task.status = "VERIFIED_RESOLVED"; task.verified_at = utcnow(); task.reviewer_id = user.id
        hotspot.status = "VERIFIED_RESOLVED"; hotspot.last_verified_cleanup_at = task.verified_at
        add_event(db, hotspot.id, "CLEANUP_VERIFIED", f"Cleanup evidence accepted by {user.display_name}. Follow-up windows scheduled.", user.id,
                  task_id=task.id, evidence_key=task.after_key, latitude=task.after_latitude, longitude=task.after_longitude)
        for days in (7, 30):
            db.add(FollowUp(hotspot_id=hotspot.id, scheduled_at=task.verified_at + timedelta(days=days), window_days=days,
                            observed_state="NOT_OBSERVED", notes="Scheduled after verified cleanup", is_demo=hotspot.is_demo))
        message = "Cleanup verified. This records a clean-up event, not a permanent fix. 7-day and 30-day follow-up scheduled."
        action = "TASK_VERIFIED"
    else:
        task.status = "IN_PROGRESS"; task.reviewer_id = user.id
        add_event(db, hotspot.id, "VERIFICATION_REJECTED", f"More evidence requested: {notes.strip() or 'No additional notes'}", user.id,
                  task_id=task.id, evidence_key=task.after_key)
        message = "Evidence rejected; task reopened for correction."
        action = "TASK_VERIFICATION_REJECTED"
    if notes.strip():
        task.notes = (task.notes + "\nReview: " + notes.strip()).strip()
    task.updated_at = utcnow()
    _audit(db, user.id, action, "task", task.id, notes.strip())
    db.commit(); db.refresh(task)
    return {"task": _task_dict(db, task), "message": message}


@app.post("/api/hotspots/{hotspot_id}/confirm-recurrence")
def confirm_recurrence(hotspot_id: int, payload: RecurrenceConfirm, db: Session = Depends(get_db), user: User = Depends(allow_roles("admin"))):
    hotspot = db.get(Hotspot, hotspot_id)
    report = db.get(Report, payload.report_id)
    if not hotspot or not report or report.hotspot_id != hotspot_id:
        raise HTTPException(404, "Hotspot or report not found")
    if not hotspot.last_verified_cleanup_at:
        raise HTTPException(409, "Cannot confirm recurrence: no verified cleanup is recorded for this hotspot")
    if report.created_at <= hotspot.last_verified_cleanup_at:
        raise HTTPException(409, "This report predates the latest verified cleanup; classify it as persistent/unresolved instead")
    if not report.photo_key:
        raise HTTPException(422, "Evidence-backed report required before recurrence can be confirmed")
    if any(e.event_type == "RECURRENCE_CONFIRMED" and e.report_id == report.id for e in db.query(HotspotEvent).filter(HotspotEvent.hotspot_id == hotspot_id).all()):
        raise HTTPException(409, "Recurrence already confirmed for this report")
    report.verification_state = "CONFIRMED_RETURN"
    hotspot.recurrence_count += 1
    hotspot.status = "RECURRENCE_CONFIRMED"
    add_event(db, hotspot.id, "RECURRENCE_CONFIRMED", payload.notes, user.id, report_id=report.id, evidence_key=report.photo_key,
              latitude=report.latitude, longitude=report.longitude, is_demo=report.is_demo)
    _audit(db, user.id, "RECURRENCE_CONFIRMED", "hotspot", hotspot.id, f"report_id={report.id}")
    db.commit(); db.refresh(hotspot); db.refresh(report)
    return {"hotspot": _hotspot_dict(db, hotspot), "report": _report_dict(report, hotspot), "message": "Evidence-backed post-cleanup return recorded."}


@app.post("/api/hotspots/{hotspot_id}/followups")
def record_followup(hotspot_id: int, payload: FollowUpCreate,
                    db: Session = Depends(get_db), user: User = Depends(allow_roles("admin", "worker"))):
    hotspot = db.get(Hotspot, hotspot_id)
    if not hotspot:
        raise HTTPException(404, "Hotspot not found")
    if payload.window_days not in {7, 30}:
        raise HTTPException(422, "Follow-up window must be 7 or 30 days")
    state = payload.observed_state.upper()
    if state not in {"NO_RETURN", "POSSIBLE_RETURN", "CONFIRMED_RETURN", "INSUFFICIENT_FOLLOWUP"}:
        raise HTTPException(422, "Invalid follow-up observation state")
    if state in {"POSSIBLE_RETURN", "CONFIRMED_RETURN"} and not payload.notes.strip():
        raise HTTPException(422, "A return observation requires written inspection notes or image evidence")
    followup = _upsert_followup_observation(db, hotspot, user, payload.window_days, state,
                                            payload.notes, None, payload.intervention_id)
    add_event(db, hotspot.id, "FOLLOWUP_RECORDED", f"{payload.window_days}-day follow-up recorded: {state}", user.id,
              evidence_key=followup.evidence_key)
    if state == "CONFIRMED_RETURN":
        hotspot.status = "POSSIBLE_RETURN"  # Recurrence still requires a linked post-cleanup report and human confirmation.
    elif state == "NO_RETURN" and not hotspot.recurrence_count:
        hotspot.status = "MONITORING"
    _audit(db, user.id, "FOLLOWUP_RECORDED", "followup", followup.id, f"state={state};window={payload.window_days};intervention_id={payload.intervention_id}")
    db.commit(); db.refresh(followup)
    return {"followup": _followup_dict(followup), "message": "Follow-up observation recorded. Not observed is not equivalent to no return."}


@app.post("/api/hotspots/{hotspot_id}/followups/record")
def record_followup_form(hotspot_id: int, window_days: int = Form(...), observed_state: str = Form(...), notes: str = Form(""),
                         intervention_id: int | None = Form(None), photo: UploadFile | None = File(None),
                         db: Session = Depends(get_db), user: User = Depends(allow_roles("admin", "worker"))):
    hotspot = db.get(Hotspot, hotspot_id)
    if not hotspot:
        raise HTTPException(404, "Hotspot not found")
    if window_days not in {7, 30}:
        raise HTTPException(422, "Follow-up window must be 7 or 30 days")
    state = observed_state.upper()
    if state not in {"NO_RETURN", "POSSIBLE_RETURN", "CONFIRMED_RETURN", "INSUFFICIENT_FOLLOWUP"}:
        raise HTTPException(422, "Invalid follow-up observation state")
    evidence_key = _save_image(photo) if photo else None
    if state in {"POSSIBLE_RETURN", "CONFIRMED_RETURN"} and not evidence_key and not notes.strip():
        raise HTTPException(422, "A return observation requires evidence or a written inspection note")
    followup = _upsert_followup_observation(db, hotspot, user, window_days, state, notes, evidence_key, intervention_id)
    add_event(db, hotspot.id, "FOLLOWUP_RECORDED", f"{window_days}-day follow-up recorded: {state}", user.id,
              evidence_key=followup.evidence_key, is_demo=False)
    if state == "CONFIRMED_RETURN":
        hotspot.status = "POSSIBLE_RETURN"  # requires linking a specific later report to confirm recurrence
    elif state == "NO_RETURN":
        if not hotspot.recurrence_count:
            hotspot.status = "MONITORING"
    _audit(db, user.id, "FOLLOWUP_RECORDED", "followup", followup.id,
           f"state={state};window={window_days};intervention_id={intervention_id}")
    db.commit(); db.refresh(followup)
    return {"followup": _followup_dict(followup), "message": "Follow-up observation recorded. A no-return outcome is only valid for the recorded observation window."}


@app.post("/api/hotspots/{hotspot_id}/interventions")
def create_intervention(hotspot_id: int, payload: InterventionCreate, db: Session = Depends(get_db), user: User = Depends(allow_roles("admin"))):
    hotspot = db.get(Hotspot, hotspot_id)
    if not hotspot:
        raise HTTPException(404, "Hotspot not found")
    due = as_naive_utc(payload.due_at)
    dates = sorted(set(payload.follow_up_dates))
    if not dates or any(d not in {7, 30} for d in dates):
        raise HTTPException(422, "Follow-up dates must use the supported 7/30-day windows")
    intervention = Intervention(hotspot_id=hotspot.id, hypothesis_code=payload.hypothesis_code.upper(), rationale=payload.rationale.strip(),
                                action_type=payload.action_type.upper(), owner=payload.owner.strip(), due_at=due,
                                status="OPEN", follow_up_dates=",".join(map(str, dates)), created_by_id=user.id,
                                is_demo=False, created_at=utcnow())
    db.add(intervention); db.flush()
    add_event(db, hotspot.id, "INTERVENTION_OPENED", f"Preventive action opened: {intervention.action_type}; cause remains a hypothesis", user.id)
    for days in dates:
        db.add(FollowUp(hotspot_id=hotspot.id, intervention_id=intervention.id, scheduled_at=due + timedelta(days=days),
                        window_days=days, observed_state="NOT_OBSERVED", notes="Scheduled from intervention due date", is_demo=False))
    hotspot.status = "INTERVENTION_OPEN" if hotspot.status in {"RECURRENCE_CONFIRMED", "POSSIBLE_RETURN"} else hotspot.status
    _audit(db, user.id, "INTERVENTION_CREATED", "intervention", intervention.id, f"hypothesis={intervention.hypothesis_code};owner={intervention.owner}")
    db.commit(); db.refresh(intervention)
    return _intervention_dict(intervention)


@app.get("/api/interventions")
def list_interventions(status: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    query = db.query(Intervention)
    if status:
        query = query.filter(Intervention.status == status.upper())
    return [_intervention_dict(i) | {"hotspot_code": db.get(Hotspot, i.hotspot_id).code} for i in query.order_by(Intervention.due_at).all()]


@app.patch("/api/interventions/{intervention_id}")
def update_intervention(intervention_id: int, payload: InterventionUpdate, db: Session = Depends(get_db), user: User = Depends(allow_roles("admin"))):
    item = db.get(Intervention, intervention_id)
    if not item:
        raise HTTPException(404, "Intervention not found")
    if payload.status:
        if payload.status.upper() not in {"OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"}:
            raise HTTPException(422, "Invalid intervention status")
        item.status = payload.status.upper()
        item.completed_at = utcnow() if item.status == "COMPLETED" else None
    if payload.outcome_notes is not None:
        item.outcome_notes = payload.outcome_notes.strip()
    add_event(db, item.hotspot_id, "INTERVENTION_UPDATED", f"Intervention {item.id} status: {item.status}", user.id)
    _audit(db, user.id, "INTERVENTION_UPDATED", "intervention", item.id, f"status={item.status}")
    db.commit(); db.refresh(item)
    return _intervention_dict(item)


@app.get("/api/handoffs")
def list_handoffs(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    query = db.query(Handoff)
    if user.role == "receiver":
        # The MVP partner account is scoped to receiver-labelled handoffs; a production deployment should map this to a receiver ID.
        query = query.filter(func.lower(Handoff.receiver_name).like("%receiver%"))
    return [_handoff_dict(db, h) for h in query.order_by(Handoff.created_at.desc()).all()]


@app.post("/api/handoffs")
def create_handoff(payload: HandoffCreate, db: Session = Depends(get_db), user: User = Depends(allow_roles("admin"))):
    task = db.get(Task, payload.task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    stream = payload.stream.upper()
    if stream not in ALLOWED_STREAMS:
        raise HTTPException(422, "Unsupported waste stream")
    if stream != task.stream and task.stream != "MIXED_UNKNOWN":
        raise HTTPException(422, "Handoff stream must match the recorded task stream")
    status = payload.status.upper()
    if status not in {"PENDING", "RECEIVED", "REJECTED", "FAILED"}:
        raise HTTPException(422, "Invalid handoff status")
    if status == "RECEIVED" and not payload.receiver_name.strip():
        raise HTTPException(422, "Receiver identity is required")
    handoff = Handoff(task_id=task.id, stream=stream, receiver_name=payload.receiver_name.strip(), quantity=payload.quantity,
                      unit=payload.unit.strip(), status=status, notes=payload.notes.strip(), received_at=utcnow() if status == "RECEIVED" else None,
                      created_by_id=user.id, is_demo=False, created_at=utcnow())
    db.add(handoff); db.flush()
    add_event(db, task.hotspot_id, "HANDOFF_RECORDED", f"{stream} handoff status: {status}", user.id)
    _audit(db, user.id, "HANDOFF_CREATED", "handoff", handoff.id, f"stream={stream};status={status}")
    db.commit(); db.refresh(handoff)
    return _handoff_dict(db, handoff)


@app.patch("/api/handoffs/{handoff_id}")
def update_handoff(handoff_id: int, payload: HandoffUpdate, db: Session = Depends(get_db), user: User = Depends(allow_roles("admin", "receiver"))):
    item = db.get(Handoff, handoff_id)
    if not item:
        raise HTTPException(404, "Handoff not found")
    if user.role == "receiver" and item.receiver_name != user.display_name:
        raise HTTPException(403, "This handoff is routed to a different receiver")
    status = payload.status.upper()
    if status not in {"PENDING", "RECEIVED", "REJECTED", "FAILED"}:
        raise HTTPException(422, "Invalid handoff status")
    item.status = status
    if payload.notes is not None:
        item.notes = payload.notes.strip()
    item.received_at = utcnow() if status == "RECEIVED" else None
    task = db.get(Task, item.task_id)
    add_event(db, task.hotspot_id, "HANDOFF_UPDATED", f"Handoff {item.id} status: {status}", user.id)
    _audit(db, user.id, "HANDOFF_UPDATED", "handoff", item.id, f"status={status}")
    db.commit(); db.refresh(item)
    return _handoff_dict(db, item)


@app.get("/api/followups")
def list_followups(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    query = db.query(FollowUp)
    if user.role == "worker":
        assigned_hotspots = [t.hotspot_id for t in db.query(Task).filter(Task.assigned_worker_id == user.id).all()]
        query = query.filter(FollowUp.hotspot_id.in_(assigned_hotspots)) if assigned_hotspots else query.filter(FollowUp.id == -1)
    rows = query.order_by(FollowUp.scheduled_at).all()
    return [_followup_dict(f) | {"hotspot_code": db.get(Hotspot, f.hotspot_id).code} for f in rows]


@app.get("/api/analytics/ward")
def ward_analytics(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    summary_data = summary(db, user)
    wards = {}
    for h in db.query(Hotspot).all():
        wards.setdefault(h.ward, {"ward": h.ward, "hotspots": 0, "recurring": 0, "active_tasks": 0, "overdue_tasks": 0})
        wards[h.ward]["hotspots"] += 1
        wards[h.ward]["recurring"] += 1 if h.recurrence_count else 0
    for t in db.query(Task).all():
        h = db.get(Hotspot, t.hotspot_id)
        if h and t.status in {"ASSIGNED", "IN_PROGRESS", "AWAITING_VERIFICATION"}:
            wards[h.ward]["active_tasks"] += 1
            wards[h.ward]["overdue_tasks"] += 1 if t.due_at < utcnow() else 0
    return {"summary": summary_data, "wards": list(wards.values()), "stream_counts": {stream: db.query(Task).filter(Task.stream == stream).count() for stream in sorted(ALLOWED_STREAMS)},
            "follow_up_note": "Only sites with recorded observation outcomes enter the recurrence denominator. Not observed is not equivalent to no return."}


@app.post("/api/demo/reset")
def reset_demo(db: Session = Depends(get_db), user: User = Depends(allow_roles("admin"))):
    env = os.getenv("ENVIRONMENT", "development").lower()
    allow_reset = os.getenv("ALLOW_DEMO_RESET", "true" if env != "production" else "false").lower() in {"true", "1", "yes"}
    if env == "production" and not allow_reset:
        raise HTTPException(403, "Demo reset is disabled in production environments to protect live operational records.")
    real_reports = db.query(Report).filter(Report.is_demo.is_(False)).count()
    real_hotspots = db.query(Hotspot).filter(Hotspot.is_demo.is_(False)).count()
    seed_demo(db, reset=True)
    admin_user = db.query(User).filter(User.username == "admin").first()
    _audit(db, admin_user.id if admin_user else None, "DEMO_RESET", "system", "all", f"Reset synthetic demo dataset. {real_reports} operational records preserved.")
    db.commit()
    return {
        "ok": True,
        "message": f"Synthetic demo dataset reset to the known scenario. {real_reports} real operational records were preserved.",
        "preserved_real_records": {"reports": real_reports, "hotspots": real_hotspots}
    }


@app.get("/api/evidence/{key}")
def get_evidence(key: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    # Only server-generated UUID image keys are accepted. Demo URI placeholders intentionally have no image payload.
    if not key.endswith(".jpg") or "/" in key or ".." in key:
        raise HTTPException(404, "Evidence file not found")
    path = (EVIDENCE_DIR / key).resolve()
    if not path.is_relative_to(EVIDENCE_DIR) or not path.exists():
        raise HTTPException(404, "Evidence file not found")
    return FileResponse(path, media_type="image/jpeg")
