from __future__ import annotations
from datetime import timedelta
from sqlalchemy.orm import Session
import os
from .models import User, Hotspot, Report, Task, HotspotEvent, Intervention, FollowUp, Handoff, AuditLog
from .security import hash_password
from .logic import utcnow, add_event


def bootstrap_admin(db: Session) -> User | None:
    admin = db.query(User).filter(User.role == "admin").first()
    if admin:
        return admin
    admin_user = os.getenv("INITIAL_ADMIN_USERNAME", "admin").strip()
    admin_pass = os.getenv("INITIAL_ADMIN_PASSWORD") or os.getenv("ADMIN_PASSWORD")
    if not admin_pass:
        return None
    user = User(
        username=admin_user,
        display_name=os.getenv("INITIAL_ADMIN_NAME", "System Administrator"),
        role="admin",
        password_hash=hash_password(admin_pass),
        active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.add(AuditLog(actor_id=user.id, action="ADMIN_BOOTSTRAPPED", target_type="user", target_id=str(user.id),
                    changed_fields="Production administrator provisioned from environment"))
    db.commit()
    return user


def seed_demo(db: Session, reset: bool = False) -> None:
    if reset:
        # Delete only records flagged as demo, preserving genuine operational records
        demo_intervention_ids = [i[0] for i in db.query(Intervention.id).filter(Intervention.is_demo.is_(True)).all()]
        if demo_intervention_ids:
            db.query(FollowUp).filter(FollowUp.intervention_id.in_(demo_intervention_ids), FollowUp.is_demo.is_(False)).update(
                {FollowUp.intervention_id: None}, synchronize_session=False
            )
        demo_report_ids = [r[0] for r in db.query(Report.id).filter(Report.is_demo.is_(True)).all()]
        if demo_report_ids:
            db.query(HotspotEvent).filter(HotspotEvent.report_id.in_(demo_report_ids), HotspotEvent.is_demo.is_(False)).update(
                {HotspotEvent.report_id: None}, synchronize_session=False
            )
        demo_task_ids = [t[0] for t in db.query(Task.id).filter(Task.is_demo.is_(True)).all()]
        if demo_task_ids:
            db.query(HotspotEvent).filter(HotspotEvent.task_id.in_(demo_task_ids), HotspotEvent.is_demo.is_(False)).update(
                {HotspotEvent.task_id: None}, synchronize_session=False
            )

        # Protect any hotspot that has operational children
        active_hotspot_ids = set()
        for model in (Report, Task, Intervention, FollowUp, HotspotEvent):
            ids = [r[0] for r in db.query(model.hotspot_id).filter(model.is_demo.is_(False)).distinct().all() if r[0] is not None]
            active_hotspot_ids.update(ids)

        if active_hotspot_ids:
            db.query(Hotspot).filter(Hotspot.id.in_(active_hotspot_ids), Hotspot.is_demo.is_(True)).update(
                {Hotspot.is_demo: False}, synchronize_session=False
            )

        db.query(Handoff).filter(Handoff.is_demo.is_(True)).delete(synchronize_session=False)
        db.query(FollowUp).filter(FollowUp.is_demo.is_(True)).delete(synchronize_session=False)
        db.query(Intervention).filter(Intervention.is_demo.is_(True)).delete(synchronize_session=False)
        db.query(HotspotEvent).filter(HotspotEvent.is_demo.is_(True)).delete(synchronize_session=False)
        db.query(Task).filter(Task.is_demo.is_(True)).delete(synchronize_session=False)
        db.query(Report).filter(Report.is_demo.is_(True)).delete(synchronize_session=False)
        db.query(Hotspot).filter(Hotspot.is_demo.is_(True)).delete(synchronize_session=False)
        db.query(AuditLog).filter(AuditLog.target_type == "dataset", AuditLog.target_id == "default").delete(synchronize_session=False)
        db.commit()
    elif db.query(Hotspot).filter(Hotspot.is_demo.is_(True)).count() > 0:
        return

    accounts = [
        ("resident", "Demo Resident", "resident", "citizen123"),
        ("admin", "Ward Supervisor", "admin", "admin123"),
        ("worker", "Field Worker", "worker", "worker123"),
        ("receiver", "Sample MRF Receiver", "receiver", "receiver123"),
    ]
    user_by_name: dict[str, User] = {}
    for username, display, role, password in accounts:
        existing_user = db.query(User).filter(User.username == username).first()
        if existing_user:
            user_by_name[username] = existing_user
        else:
            user = User(username=username, display_name=display, role=role, password_hash=hash_password(password), active=True)
            db.add(user)
            db.flush()
            user_by_name[username] = user
    resident, admin, worker, receiver = (user_by_name[k] for k in ("resident", "admin", "worker", "receiver"))
    now = utcnow()
    base_lat, base_lng = 21.1458, 79.0882  # synthetic demo cluster; not municipal data
    hotspot_specs = [
        ("HS-014", "Market Lane Corner", "Ward 01", 0.0000, 0.0000, "RECURRENCE_CONFIRMED"),
        ("HS-021", "Bus Stand Service Road", "Ward 01", 0.0017, 0.0014, "UNRESOLVED"),
        ("HS-008", "Canal Access Point", "Ward 02", -0.0018, 0.0017, "ACTIVE"),
        ("HS-033", "School Boundary", "Ward 02", 0.0024, -0.0019, "VERIFIED_RESOLVED"),
        ("HS-027", "Workshop Turn", "Ward 03", -0.0028, -0.0012, "ACTIVE"),
        ("HS-019", "Vegetable Market Rear", "Ward 03", 0.0031, 0.0022, "ACTIVE"),
        ("HS-042", "Community Bin Point", "Ward 01", -0.0031, 0.0030, "ACTIVE"),
        ("HS-051", "Drain-side Collection Point", "Ward 02", 0.0011, -0.0032, "OVERDUE"),
        ("HS-060", "Community Hall Lane", "Ward 04", -0.0011, -0.0040, "POSSIBLE_RETURN"),
        ("HS-064", "Transit Depot Edge", "Ward 04", 0.0040, -0.0005, "ACTIVE"),
    ]
    hotspots: dict[str, Hotspot] = {}
    for code, label, ward, dlat, dlng, status in hotspot_specs:
        existing_h = db.query(Hotspot).filter(Hotspot.code == code).first()
        if existing_h:
            hotspots[code] = existing_h
            continue
        created_at = now - timedelta(days=40 if code == "HS-033" else 18)
        h = Hotspot(code=code, label=label, ward=ward, latitude=base_lat+dlat, longitude=base_lng+dlng,
                    status=status, first_seen_at=created_at, last_seen_at=created_at,
                    recurrence_count=1 if code == "HS-014" else 0,
                    last_verified_cleanup_at=(now-timedelta(days=12) if code == "HS-014" else now-timedelta(days=36) if code == "HS-033" else now-timedelta(days=4) if code == "HS-060" else None),
                    is_demo=True, created_at=created_at, updated_at=now)
        db.add(h)
        db.flush()
        hotspots[code] = h

    def seed_task(task: Task) -> Task:
        existing = db.query(Task).filter(Task.code == task.code).first()
        if existing:
            return existing
        db.add(task)
        db.flush()
        return task

    def report(code: str, days_ago: int, issue: str, description: str, state: str = "UNVERIFIED", photo: str = "demo://report-photo") -> Report:
        h = hotspots[code]
        r = Report(hotspot_id=h.id, reporter_id=resident.id, issue_type=issue, description=description,
                   latitude=h.latitude, longitude=h.longitude, gps_accuracy_m=8, location_precision="simulated",
                   photo_key=photo, verification_state=state, is_demo=True, created_at=now-timedelta(days=days_ago))
        db.add(r)
        db.flush()
        event = add_event(db, h.id, "REPORT_SUBMITTED", f"Sample report: {description}", resident.id, report_id=r.id,
                          evidence_key=photo, latitude=h.latitude, longitude=h.longitude, is_demo=True)
        event.created_at = r.created_at
        if r.created_at > h.last_seen_at:
            h.last_seen_at = r.created_at
        return r

    # HS-014: verified cleanup followed by a later evidence-backed incident.
    old_r = report("HS-014", 16, "DUMPING", "Sample initial pile reported", "REVIEWED")
    task1 = seed_task(Task(code="TSK-014", hotspot_id=hotspots["HS-014"].id, assigned_worker_id=worker.id,
                 created_by_id=admin.id, due_at=now-timedelta(days=13), status="VERIFIED_RESOLVED", stream="DRY",
                 before_key="demo://before-014", after_key="demo://after-014", before_latitude=hotspots["HS-014"].latitude,
                 before_longitude=hotspots["HS-014"].longitude, after_latitude=hotspots["HS-014"].latitude,
                 after_longitude=hotspots["HS-014"].longitude, after_uploaded_at=now-timedelta(days=12),
                 reviewer_id=admin.id, verified_at=now-timedelta(days=12), notes="Synthetic verified cleanup", is_demo=True,
                 created_at=now-timedelta(days=14)))
    cleanup_event = add_event(db, hotspots["HS-014"].id, "CLEANUP_VERIFIED", "Sample cleanup accepted by demo supervisor", admin.id,
              task_id=task1.id, evidence_key="demo://after-014", is_demo=True)
    cleanup_event.created_at = task1.verified_at
    later_r = report("HS-014", 9, "DUMPING", "Sample later pile after verified cleanup", "CONFIRMED_RETURN")
    recurrence_event = add_event(db, hotspots["HS-014"].id, "RECURRENCE_CONFIRMED", "Seeded demo scenario: later incident confirmed after verified cleanup", admin.id,
              report_id=later_r.id, evidence_key=later_r.photo_key, is_demo=True)
    recurrence_event.created_at = later_r.created_at
    intervention = Intervention(hotspot_id=hotspots["HS-014"].id, hypothesis_code="MISSED_PICKUP_WINDOW",
        rationale="Sample operational record suggests the scheduled pickup window may have been missed; verify before treating this as confirmed cause.",
        action_type="PICKUP_ESCALATION", owner="Ward 01 Supervisor", due_at=now+timedelta(days=2), status="OPEN",
        follow_up_dates="7,30", created_by_id=admin.id, is_demo=True, created_at=now-timedelta(days=8))
    db.add(intervention); db.flush()
    db.add(FollowUp(hotspot_id=hotspots["HS-014"].id, intervention_id=intervention.id, scheduled_at=now-timedelta(days=5),
        window_days=7, observed_state="CONFIRMED_RETURN", evidence_key="demo://followup-014", reviewer_id=admin.id,
        notes="Seeded synthetic follow-up after verified cleanup", observed_at=now-timedelta(days=5), is_demo=True))
    db.add(FollowUp(hotspot_id=hotspots["HS-014"].id, intervention_id=intervention.id, scheduled_at=now+timedelta(days=18),
        window_days=30, observed_state="NOT_OBSERVED", notes="Scheduled; not yet observed", is_demo=True))

    # HS-021: two reports before any verified cleanup => persistent accumulation, not recurrence.
    report("HS-021", 10, "MISSED_PICKUP", "Sample missed collection report", "UNVERIFIED")
    report("HS-021", 8, "DUMPING", "Second sample report before cleanup", "UNVERIFIED")
    t2 = seed_task(Task(code="TSK-021", hotspot_id=hotspots["HS-021"].id, assigned_worker_id=worker.id, created_by_id=admin.id,
              due_at=now-timedelta(hours=10), status="ASSIGNED", stream="MIXED_UNKNOWN", notes="Overdue demo pickup", is_demo=True))
    add_event(db, hotspots["HS-021"].id, "TASK_ASSIGNED", "Overdue sample task assigned", admin.id, task_id=t2.id, is_demo=True)

    # Other incidents illustrate severity, segregation and no-return follow-up cases.
    report("HS-008", 3, "BURNING", "Sample suspected burning concern; requires human inspection", "UNVERIFIED")
    report("HS-033", 39, "DUMPING", "Sample report at site later verified clean", "REVIEWED")
    old_clean = seed_task(Task(code="TSK-008", hotspot_id=hotspots["HS-033"].id, assigned_worker_id=worker.id, created_by_id=admin.id,
              due_at=now-timedelta(days=36), status="VERIFIED_RESOLVED", stream="WET", before_key="demo://before-033",
              after_key="demo://after-033", before_latitude=hotspots["HS-033"].latitude, before_longitude=hotspots["HS-033"].longitude,
              after_latitude=hotspots["HS-033"].latitude, after_longitude=hotspots["HS-033"].longitude,
              after_uploaded_at=now-timedelta(days=36), reviewer_id=admin.id, verified_at=now-timedelta(days=36),
              notes="Sample verified cleanup", is_demo=True, created_at=now-timedelta(days=37)))
    old_cleanup_event = add_event(db, hotspots["HS-033"].id, "CLEANUP_VERIFIED", "Sample cleanup verified", admin.id, task_id=old_clean.id,
              evidence_key="demo://after-033", is_demo=True)
    old_cleanup_event.created_at = old_clean.verified_at
    db.add(FollowUp(hotspot_id=hotspots["HS-033"].id, scheduled_at=now-timedelta(days=6), window_days=30,
                    observed_state="NO_RETURN", evidence_key="demo://followup-033", reviewer_id=admin.id,
                    notes="No return observed in simulated 30-day window", observed_at=now-timedelta(days=6), is_demo=True))
    report("HS-027", 2, "MIXED_WASTE", "Sample mixed waste at collection point", "UNVERIFIED")
    report("HS-019", 1, "DRY_RECYCLABLES", "Sample dry recyclables awaiting receiver handoff", "UNVERIFIED")
    task3 = seed_task(Task(code="TSK-019", hotspot_id=hotspots["HS-019"].id, assigned_worker_id=worker.id, created_by_id=admin.id,
              due_at=now+timedelta(days=1), status="IN_PROGRESS", stream="DRY", before_key="demo://before-019",
              before_latitude=hotspots["HS-019"].latitude, before_longitude=hotspots["HS-019"].longitude,
              notes="Sample dry stream task", is_demo=True))
    db.add(Handoff(task_id=task3.id, stream="DRY", receiver_name="Sample MRF Receiver", quantity=12.5, unit="kg", status="PENDING",
                   notes="Synthetic material handoff awaiting confirmation", created_by_id=admin.id, is_demo=True))
    report("HS-042", 5, "SANITARY", "Sample sanitary waste requiring appropriate handling", "UNVERIFIED")
    task_awaiting = seed_task(Task(code="TSK-042", hotspot_id=hotspots["HS-042"].id, assigned_worker_id=worker.id, created_by_id=admin.id,
              due_at=now+timedelta(days=1), status="AWAITING_VERIFICATION", stream="SANITARY",
              before_key="demo://before-042", after_key="demo://after-042",
              before_latitude=hotspots["HS-042"].latitude, before_longitude=hotspots["HS-042"].longitude,
              after_latitude=hotspots["HS-042"].latitude, after_longitude=hotspots["HS-042"].longitude,
              after_uploaded_at=now-timedelta(hours=3),
              notes="Cleaned and segregated into sanitary waste container; awaiting supervisor review.", is_demo=True,
              created_at=now-timedelta(days=2)))
    add_event(db, hotspots["HS-042"].id, "CLEANUP_SUBMITTED", "Worker uploaded cleanup evidence; awaiting supervisor verification",
              worker.id, task_id=task_awaiting.id, evidence_key="demo://after-042", is_demo=True)
    db.add(Handoff(task_id=task1.id, stream="DRY", receiver_name="Sample MRF Receiver", quantity=45.0, unit="kg", status="RECEIVED",
                   notes="Confirmed receipt of segregated dry recyclables at central MRF", received_at=now-timedelta(days=11), created_by_id=admin.id, is_demo=True, created_at=now-timedelta(days=11)))
    db.add(Handoff(task_id=old_clean.id, stream="WET", receiver_name="Sample MRF Receiver", quantity=80.0, unit="kg", status="RECEIVED",
                   notes="Wet organic waste accepted at municipal bio-composting hub", received_at=now-timedelta(days=35), created_by_id=admin.id, is_demo=True, created_at=now-timedelta(days=35)))
    db.add(Handoff(task_id=task_awaiting.id, stream="SANITARY", receiver_name="Sample MRF Receiver", quantity=15.0, unit="kg", status="PENDING",
                   notes="Sanitary materials batch pending receiver intake inspection", created_by_id=admin.id, is_demo=True, created_at=now-timedelta(hours=2)))
    report("HS-051", 4, "MISSED_PICKUP", "Sample collection task overdue at drain-side point", "UNVERIFIED")
    task4 = seed_task(Task(code="TSK-051", hotspot_id=hotspots["HS-051"].id, assigned_worker_id=worker.id, created_by_id=admin.id,
              due_at=now-timedelta(days=1), status="ASSIGNED", stream="MIXED_UNKNOWN", notes="Overdue collection in sample data", is_demo=True))
    add_event(db, hotspots["HS-051"].id, "TASK_ASSIGNED", "Sample overdue task assigned", admin.id, task_id=task4.id, is_demo=True)
    # HS-060: deliberately seeded possible-return case. It has a verified cleanup,
    # then a later evidence-linked sample report that still requires human review.
    h060 = hotspots["HS-060"]
    cleanup060 = seed_task(Task(code="TSK-060", hotspot_id=h060.id, assigned_worker_id=worker.id, created_by_id=admin.id,
              due_at=now-timedelta(days=4), status="VERIFIED_RESOLVED", stream="MIXED_UNKNOWN",
              before_key="demo://before-060", after_key="demo://after-060", before_latitude=h060.latitude,
              before_longitude=h060.longitude, after_latitude=h060.latitude, after_longitude=h060.longitude,
              after_uploaded_at=now-timedelta(days=4), reviewer_id=admin.id, verified_at=now-timedelta(days=4),
              notes="Synthetic verified cleanup; follow-up review remains open", is_demo=True, created_at=now-timedelta(days=5)))
    event060 = add_event(db, h060.id, "CLEANUP_VERIFIED", "Sample cleanup verified; later incident still needs human review", admin.id,
              task_id=cleanup060.id, evidence_key="demo://after-060", is_demo=True)
    event060.created_at = cleanup060.verified_at
    report("HS-060", 2, "DUMPING", "Sample later pile after verified cleanup; review evidence before confirming recurrence", "POSSIBLE_RETURN")
    report("HS-064", 1, "MISSED_PICKUP", "Sample report about missed collection", "UNVERIFIED")

    db.add(AuditLog(actor_id=admin.id, action="DEMO_SEEDED", target_type="dataset", target_id="default",
                    changed_fields="Synthetic records created; not municipal performance data"))
    db.commit()
