from __future__ import annotations

import math
import os
from datetime import datetime, timezone, timedelta
from sqlalchemy import func
from sqlalchemy.orm import Session
from .models import Hotspot, Report, Task, FollowUp, Handoff, HotspotEvent


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def as_naive_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    earth_radius = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * earth_radius * math.asin(math.sqrt(min(1, a)))


def add_event(db: Session, hotspot_id: int, event_type: str, notes: str = "", actor_id: int | None = None,
              report_id: int | None = None, task_id: int | None = None, evidence_key: str | None = None,
              latitude: float | None = None, longitude: float | None = None, is_demo: bool = False):
    event = HotspotEvent(hotspot_id=hotspot_id, event_type=event_type, notes=notes, actor_id=actor_id,
                         report_id=report_id, task_id=task_id, evidence_key=evidence_key,
                         latitude=latitude, longitude=longitude, is_demo=is_demo, created_at=utcnow())
    db.add(event)
    return event


def _positive_int(key: str, default: int) -> int:
    try:
        return max(0, int(os.getenv(key, str(default))))
    except ValueError:
        return default


def score_hotspot(db: Session, hotspot: Hotspot) -> dict:
    """Explainable, configurable operational score; never a probability."""
    now = utcnow()
    maxima = {
        "verified_returns": _positive_int("SCORE_WEIGHT_VERIFIED_RETURNS", 30),
        "incident_frequency": _positive_int("SCORE_WEIGHT_INCIDENT_FREQUENCY", 20),
        "overdue_or_missed_pickup": _positive_int("SCORE_WEIGHT_OVERDUE_PICKUP", 15),
        "severity_or_handling": _positive_int("SCORE_WEIGHT_SEVERITY", 15),
        "time_to_return": _positive_int("SCORE_WEIGHT_TIME_TO_RETURN", 15),
        "segregation_or_handoff_gap": _positive_int("SCORE_WEIGHT_HANDOFF_GAP", 5),
    }
    returns = db.query(HotspotEvent).filter(
        HotspotEvent.hotspot_id == hotspot.id,
        HotspotEvent.event_type == "RECURRENCE_CONFIRMED",
        HotspotEvent.created_at >= now - timedelta(days=30),
    ).count()
    recent_reports = db.query(Report).filter(
        Report.hotspot_id == hotspot.id,
        Report.created_at >= now - timedelta(days=30),
    ).count()
    overdue = db.query(Task).filter(
        Task.hotspot_id == hotspot.id,
        Task.status.in_(["ASSIGNED", "IN_PROGRESS", "AWAITING_VERIFICATION"]),
        Task.due_at < now,
    ).count()
    severe = db.query(Report).filter(
        Report.hotspot_id == hotspot.id,
        Report.issue_type.in_(["BURNING", "SHARP_OR_HAZARDOUS", "SPECIAL_CARE"]),
    ).count()
    recent_return_days = None
    if hotspot.last_verified_cleanup_at:
        later = db.query(func.min(Report.created_at)).filter(
            Report.hotspot_id == hotspot.id,
            Report.created_at > hotspot.last_verified_cleanup_at,
        ).scalar()
        if later:
            recent_return_days = max(0, (later - hotspot.last_verified_cleanup_at).days)
    return_step = _positive_int("SCORE_POINTS_PER_RETURN", max(1, maxima["verified_returns"] // 2))
    report_step = _positive_int("SCORE_POINTS_PER_EXTRA_REPORT", 5)
    components = {
        "verified_returns": min(maxima["verified_returns"], returns * return_step),
        "incident_frequency": min(maxima["incident_frequency"], max(0, recent_reports - 1) * report_step),
        "overdue_or_missed_pickup": maxima["overdue_or_missed_pickup"] if overdue else 0,
        "severity_or_handling": maxima["severity_or_handling"] if severe else 0,
        "time_to_return": maxima["time_to_return"] if recent_return_days is not None and recent_return_days <= 7 else (
            round(maxima["time_to_return"] * 0.53) if recent_return_days is not None and recent_return_days <= 14 else 0),
        "segregation_or_handoff_gap": maxima["segregation_or_handoff_gap"] if db.query(Handoff).join(Task, Handoff.task_id == Task.id).filter(
            Task.hotspot_id == hotspot.id, Handoff.status.in_(["PENDING", "FAILED", "REJECTED"])
        ).count() else 0,
    }
    total_max = max(1, sum(maxima.values()))
    total = min(100, round(sum(components.values()) / total_max * 100))
    monitor_threshold = _positive_int("PRIORITY_MONITOR_THRESHOLD", 35)
    high_threshold = _positive_int("PRIORITY_HIGH_THRESHOLD", 60)
    critical_threshold = _positive_int("PRIORITY_CRITICAL_THRESHOLD", 80)
    band = "CRITICAL" if total >= critical_threshold else "HIGH" if total >= high_threshold else "MONITOR" if total >= monitor_threshold else "ROUTINE"
    return {"score": total, "band": band, "components": components, "maxima": maxima,
            "thresholds": {"monitor": monitor_threshold, "high": high_threshold, "critical": critical_threshold},
            "basis": "Configurable prototype rules, not a probability or trained prediction"}
