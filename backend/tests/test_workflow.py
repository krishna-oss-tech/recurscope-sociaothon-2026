from datetime import datetime, timedelta, timezone
from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image

from app.main import app


def png_bytes():
    image = Image.new("RGB", (24, 24), (120, 180, 130))
    buf = BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()


def auth(client, username="admin", password="admin123"):
    result = client.post("/api/auth/login", json={"username": username, "password": password})
    assert result.status_code == 200, result.text
    return {"Authorization": f"Bearer {result.json()['access_token']}"}


def test_health_and_synthetic_summary():
    with TestClient(app) as client:
        assert client.get("/health").json()["ok"] is True
        headers = auth(client)
        summary = client.get("/api/summary", headers=headers).json()
        assert summary["synthetic_data"] is True
        assert summary["hotspots"] >= 8
        assert summary["note"]


def test_two_reports_before_cleanup_cannot_be_confirmed_as_recurrence():
    with TestClient(app) as client:
        headers = auth(client)
        hotspots = client.get("/api/hotspots", headers=headers).json()
        unresolved = next(h for h in hotspots if h["code"] == "HS-021")
        passport = client.get(f"/api/hotspots/{unresolved['id']}/passport", headers=headers).json()
        assert len(passport["reports"]) >= 2
        report_id = passport["reports"][0]["id"]
        result = client.post(f"/api/hotspots/{unresolved['id']}/confirm-recurrence",
                             headers=headers, json={"report_id": report_id, "notes": "Attempt to confirm without verified cleanup"})
        assert result.status_code == 409
        assert "no verified cleanup" in result.json()["detail"].lower()


def test_real_task_flow_requires_after_evidence_then_verification_schedules_followups():
    with TestClient(app) as client:
        admin_headers = auth(client, "admin", "admin123")
        worker_headers = auth(client, "worker", "worker123")
        users = client.get("/api/users?role=worker", headers=admin_headers).json()
        hotspots = client.get("/api/hotspots", headers=admin_headers).json()
        target = next(h for h in hotspots if h["code"] == "HS-027")
        created = client.post("/api/tasks", headers=admin_headers, json={
            "hotspot_id": target["id"], "assigned_worker_id": users[0]["id"],
            "due_at": (datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=1)).isoformat(), "stream": "WET", "notes": "Test task"})
        assert created.status_code == 200, created.text
        task = created.json()
        assert task["status"] == "ASSIGNED"
        started = client.post(f"/api/tasks/{task['id']}/start", headers=worker_headers)
        assert started.status_code == 200
        denied_finish = client.post(f"/api/tasks/{task['id']}/finish", headers=worker_headers)
        assert denied_finish.status_code == 422
        for kind in ("before", "after"):
            response = client.post(f"/api/tasks/{task['id']}/evidence", headers=worker_headers,
                data={"kind": kind, "latitude": target["latitude"], "longitude": target["longitude"]},
                files={"photo": (f"{kind}.png", png_bytes(), "image/png")})
            assert response.status_code == 200, response.text
        finished = client.post(f"/api/tasks/{task['id']}/finish", headers=worker_headers)
        assert finished.status_code == 200
        assert finished.json()["status"] == "AWAITING_VERIFICATION"
        verified = client.post(f"/api/tasks/{task['id']}/verify", headers=admin_headers,
                               data={"approved": "true", "notes": "Reviewed test evidence"})
        assert verified.status_code == 200, verified.text
        assert verified.json()["task"]["status"] == "VERIFIED_RESOLVED"
        passport = client.get(f"/api/hotspots/{target['id']}/passport", headers=admin_headers).json()
        assert any(f["window_days"] == 7 and f["observed_state"] == "NOT_OBSERVED" for f in passport["followups"])
        assert any(f["window_days"] == 30 and f["observed_state"] == "NOT_OBSERVED" for f in passport["followups"])


def test_confirm_return_needs_post_cleanup_report_with_image_evidence():
    with TestClient(app) as client:
        admin_headers = auth(client)
        hs = client.get("/api/hotspots", headers=admin_headers).json()
        target = next(h for h in hs if h["code"] == "HS-033")
        no_photo = client.post("/api/reports", headers=admin_headers, data={
            "issue_type": "DUMPING", "description": "New observed sample report without photo", "ward": target["ward"],
            "lat": target["latitude"], "lng": target["longitude"], "hotspot_id": target["id"]})
        assert no_photo.status_code == 200
        report_id = no_photo.json()["report"]["id"]
        assert no_photo.json()["report"]["verification_state"] == "POSSIBLE_RETURN"
        denied = client.post(f"/api/hotspots/{target['id']}/confirm-recurrence", headers=admin_headers,
                             json={"report_id": report_id, "notes": "Supervisor review confirms the return"})
        assert denied.status_code == 422
        attached = client.post(f"/api/reports/{report_id}/evidence", headers=admin_headers,
                               files={"photo": ("pile.png", png_bytes(), "image/png")})
        assert attached.status_code == 200, attached.text
        assert attached.json()["report"]["id"] == report_id  # evidence attaches to the same incident
        assert attached.json()["report"]["photo_key"]
        passport_after_attach = client.get(f"/api/hotspots/{target['id']}/passport", headers=admin_headers).json()
        assert any(e["event_type"] == "REPORT_EVIDENCE_ATTACHED" and e["report_id"] == report_id
                   for e in passport_after_attach["events"])
        confirmed = client.post(f"/api/hotspots/{target['id']}/confirm-recurrence", headers=admin_headers,
                                json={"report_id": report_id, "notes": "Supervisor inspected after-cleanup evidence."})
        assert confirmed.status_code == 200, confirmed.text
        assert confirmed.json()["hotspot"]["recurrence_count"] >= 1


def test_report_evidence_upload_is_restricted_to_owner_or_supervisor():
    with TestClient(app) as client:
        admin_headers = auth(client, "admin", "admin123")
        resident_headers = auth(client, "resident", "citizen123")
        hs = client.get("/api/hotspots", headers=admin_headers).json()
        target = next(h for h in hs if h["code"] == "HS-033")
        created = client.post("/api/reports", headers=admin_headers, data={
            "issue_type": "DUMPING", "description": "Permission test report", "ward": target["ward"],
            "lat": target["latitude"], "lng": target["longitude"], "hotspot_id": target["id"]})
        assert created.status_code == 200
        report_id = created.json()["report"]["id"]
        denied = client.post(f"/api/reports/{report_id}/evidence", headers=resident_headers,
                             files={"photo": ("pile.png", png_bytes(), "image/png")})
        assert denied.status_code == 403


def test_demo_has_a_realistic_possible_return_review_case():
    with TestClient(app) as client:
        headers = auth(client)
        hotspots = client.get("/api/hotspots", headers=headers).json()
        target = next(h for h in hotspots if h["code"] == "HS-060")
        passport = client.get(f"/api/hotspots/{target['id']}/passport", headers=headers).json()
        assert target["status"] == "POSSIBLE_RETURN"
        assert target["last_verified_cleanup_at"]
        assert target["recurrence_count"] == 0  # possible return is not yet confirmed
        assert any(r["verification_state"] == "POSSIBLE_RETURN" and r["photo_key"]
                   for r in passport["reports"])
        assert any(e["event_type"] == "CLEANUP_VERIFIED" for e in passport["events"])


def test_followup_updates_linked_schedule_and_blocks_cross_hotspot_link():
    with TestClient(app) as client:
        headers = auth(client)
        interventions = client.get("/api/interventions", headers=headers).json()
        intervention = next(i for i in interventions if i["hotspot_code"] == "HS-014")
        hotspots = client.get("/api/hotspots", headers=headers).json()
        target = next(h for h in hotspots if h["code"] == "HS-014")
        before = client.get(f"/api/hotspots/{target['id']}/passport", headers=headers).json()
        scheduled = next(f for f in before["followups"] if f["intervention_id"] == intervention["id"]
                         and f["window_days"] == 30 and f["observed_state"] == "NOT_OBSERVED")
        response = client.post(f"/api/hotspots/{target['id']}/followups/record", headers=headers, data={
            "window_days": "30", "observed_state": "NO_RETURN",
            "notes": "Synthetic test observation; no return observed in this inspection window.",
            "intervention_id": str(intervention["id"]),
        })
        assert response.status_code == 200, response.text
        saved = response.json()["followup"]
        assert saved["id"] == scheduled["id"]  # update scheduled slot; do not create a duplicate
        assert saved["intervention_id"] == intervention["id"]
        assert saved["observed_state"] == "NO_RETURN"
        assert saved["observed_at"]
        after = client.get(f"/api/hotspots/{target['id']}/passport", headers=headers).json()
        assert len(after["followups"]) == len(before["followups"])

        other = next(h for h in hotspots if h["code"] == "HS-021")
        denied = client.post(f"/api/hotspots/{other['id']}/followups/record", headers=headers, data={
            "window_days": "7", "observed_state": "NO_RETURN",
            "notes": "This action intentionally tests invalid cross-hotspot linkage.",
            "intervention_id": str(intervention["id"]),
        })
        assert denied.status_code == 422
        assert "different hotspot" in denied.json()["detail"].lower()


def test_location_candidate_lookup_is_explicit_and_never_auto_merges():
    with TestClient(app) as client:
        headers = auth(client)
        hotspots = client.get("/api/hotspots", headers=headers).json()
        target = next(h for h in hotspots if h["code"] == "HS-060")
        nearby = client.get("/api/hotspots/candidates", headers=headers, params={
            "lat": target["latitude"], "lng": target["longitude"], "radius_m": 100,
        })
        assert nearby.status_code == 200, nearby.text
        candidates = nearby.json()
        assert candidates
        assert candidates[0]["id"] == target["id"]
        assert candidates[0]["distance_m"] == 0

        # A nearby candidate is advisory. The client must explicitly include hotspot_id to link it.
        created = client.post("/api/reports", headers=headers, data={
            "issue_type": "DUMPING", "description": "Candidate matching test", "ward": target["ward"],
            "lat": target["latitude"], "lng": target["longitude"],
        })
        assert created.status_code == 200, created.text
        assert created.json()["hotspot"]["id"] != target["id"]
        assert "reviewable decision" in created.json()["message"].lower()


def test_cleanup_scheduled_followup_upsert_and_custom_review_notes():
    with TestClient(app) as client:
        admin_headers = auth(client, "admin", "admin123")
        worker_headers = auth(client, "worker", "worker123")
        receiver_headers = auth(client, "receiver", "receiver123")

        # 1. Create a task on a hotspot, execute and submit evidence
        hotspots = client.get("/api/hotspots", headers=admin_headers).json()
        target = next(h for h in hotspots if h["code"] == "HS-042")
        workers = client.get("/api/users?role=worker", headers=admin_headers).json()
        due_time = (datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=2)).isoformat()
        t_res = client.post("/api/tasks", headers=admin_headers, json={
            "hotspot_id": target["id"], "assigned_worker_id": workers[0]["id"],
            "due_at": due_time, "stream": "DRY", "notes": "Life-cycle regression task"
        })
        assert t_res.status_code == 200, t_res.text
        task = t_res.json()

        # Worker starts task
        client.post(f"/api/tasks/{task['id']}/start", headers=worker_headers)

        # Worker uploads before and after evidence
        for kind in ("before", "after"):
            client.post(f"/api/tasks/{task['id']}/evidence", headers=worker_headers,
                        data={"kind": kind, "latitude": target["latitude"], "longitude": target["longitude"]},
                        files={"photo": (f"{kind}.png", png_bytes(), "image/png")})

        # Worker finishes task
        finish_res = client.post(f"/api/tasks/{task['id']}/finish", headers=worker_headers)
        assert finish_res.status_code == 200
        assert finish_res.json()["status"] == "AWAITING_VERIFICATION"

        # Supervisor verifies with custom review notes
        custom_notes = "Inspected on site: clear after evidence accepted"
        verify_res = client.post(f"/api/tasks/{task['id']}/verify", headers=admin_headers,
                                 data={"approved": "true", "notes": custom_notes})
        assert verify_res.status_code == 200
        verified_task = verify_res.json()["task"]
        assert verified_task["status"] == "VERIFIED_RESOLVED"
        assert custom_notes in verified_task["notes"]

        # Check that 7-day and 30-day cleanup follow-ups are scheduled
        passport = client.get(f"/api/hotspots/{target['id']}/passport", headers=admin_headers).json()
        cleanup_followups = [f for f in passport["followups"] if f["intervention_id"] is None]
        assert len(cleanup_followups) == 2
        f7 = next(f for f in cleanup_followups if f["window_days"] == 7)
        assert f7["observed_state"] == "NOT_OBSERVED"

        # 2. Record 7-day follow-up observation for the cleanup (general observation, intervention_id is None)
        obs_res = client.post(f"/api/hotspots/{target['id']}/followups/record", headers=admin_headers, data={
            "window_days": "7", "observed_state": "NO_RETURN",
            "notes": "7-day inspection confirms site remains clear"
        })
        assert obs_res.status_code == 200, obs_res.text
        updated_f7 = obs_res.json()["followup"]
        assert updated_f7["id"] == f7["id"]  # Must update the existing scheduled slot!
        assert updated_f7["observed_state"] == "NO_RETURN"

        # Ensure total follow-up count did not grow (no duplicate row created)
        passport_after = client.get(f"/api/hotspots/{target['id']}/passport", headers=admin_headers).json()
        assert len(passport_after["followups"]) == len(passport["followups"])

        # 3. Create and verify MRF handoff for this DRY task
        handoff_res = client.post("/api/handoffs", headers=admin_headers, json={
            "task_id": task["id"], "stream": "DRY", "receiver_name": "Sample MRF Receiver",
            "quantity": 18.5, "unit": "kg", "status": "PENDING", "notes": "Dry recyclables collected"
        })
        assert handoff_res.status_code == 200, handoff_res.text
        handoff = handoff_res.json()
        assert handoff["status"] == "PENDING"

        # MRF Receiver confirms receipt
        confirm_res = client.patch(f"/api/handoffs/{handoff['id']}", headers=receiver_headers, json={
            "status": "RECEIVED", "notes": "Material received and weighed at facility"
        })
        assert confirm_res.status_code == 200, confirm_res.text
        assert confirm_res.json()["status"] == "RECEIVED"


def test_production_readiness_health_and_demo_reset_guard(monkeypatch):
    with TestClient(app) as client:
        # Health check verifies database connectivity
        health_res = client.get("/health")
        assert health_res.status_code == 200
        health_data = health_res.json()
        assert health_data["ok"] is True
        assert health_data["database"] == "connected"
        assert health_data["service"] == "recurscope-api"

        admin_headers = auth(client, "admin", "admin123")

        # In production mode without explicit override, demo reset must be blocked
        monkeypatch.setenv("ENVIRONMENT", "production")
        monkeypatch.setenv("ALLOW_DEMO_RESET", "false")
        prod_reset_res = client.post("/api/demo/reset", headers=admin_headers)
        assert prod_reset_res.status_code == 403
        assert "disabled in production" in prod_reset_res.json()["detail"]

        # When explicitly allowed or in development, demo reset succeeds
        monkeypatch.setenv("ALLOW_DEMO_RESET", "true")
        allowed_reset_res = client.post("/api/demo/reset", headers=admin_headers)
        assert allowed_reset_res.status_code == 200
        assert allowed_reset_res.json()["ok"] is True


def test_pilot_configuration_and_role_restrictions():
    with TestClient(app) as client:
        admin_headers = auth(client, "admin", "admin123")
        resident_headers = auth(client, "resident", "citizen123")

        # 1. Anyone logged in can read pilot configuration
        pilot_res = client.get("/api/config/pilot", headers=resident_headers)
        assert pilot_res.status_code == 200, pilot_res.text
        cfg = pilot_res.json()
        assert "name" in cfg
        assert "latitude" in cfg
        assert "longitude" in cfg
        assert "radius_km" in cfg

        # 2. Resident cannot patch pilot configuration
        patch_denied = client.patch("/api/config/pilot", headers=resident_headers, json={"name": "Unauthorized Pilot"})
        assert patch_denied.status_code == 403

        # 3. Admin can update pilot configuration
        patch_res = client.patch("/api/config/pilot", headers=admin_headers, json={
            "name": "Dharampeth Pilot Zone",
            "latitude": 21.1400,
            "longitude": 79.0700,
            "radius_km": 5.0,
            "default_ward": "Ward 02"
        })
        assert patch_res.status_code == 200, patch_res.text
        updated = patch_res.json()
        assert updated["name"] == "Dharampeth Pilot Zone"
        assert updated["radius_km"] == 5.0
        assert updated["default_ward"] == "Ward 02"


def test_real_operational_report_and_pilot_boundary_detection():
    with TestClient(app) as client:
        admin_headers = auth(client, "admin", "admin123")
        resident_headers = auth(client, "resident", "citizen123")

        # Get active pilot config
        pilot = client.get("/api/config/pilot", headers=admin_headers).json()
        plat, plon = pilot["latitude"], pilot["longitude"]

        # 1. Submit a genuine report within pilot area with manual pin
        inside_report = client.post("/api/reports", headers=resident_headers, data={
            "issue_type": "DUMPING",
            "description": "Genuine citizen report inside pilot boundary",
            "ward": pilot["default_ward"],
            "lat": plat + 0.005,  # within 1 km
            "lng": plon + 0.005,
        }, files={"photo": ("evidence.png", png_bytes(), "image/png")})
        assert inside_report.status_code == 200, inside_report.text
        rep1 = inside_report.json()["report"]
        assert rep1["is_demo"] is False
        assert rep1["location_precision"] == "manual"
        assert rep1["outside_pilot_area"] is False
        assert rep1["photo_key"] is not None

        # 2. Submit a report outside pilot area with device GPS accuracy
        outside_report = client.post("/api/reports", headers=resident_headers, data={
            "issue_type": "MISSED_PICKUP",
            "description": "Real report far outside configured pilot radius",
            "ward": "Ward 99",
            "lat": plat + 0.5,  # ~55 km away
            "lng": plon + 0.5,
            "gps_accuracy_m": 8.5
        })
        assert outside_report.status_code == 200, outside_report.text
        rep2 = outside_report.json()["report"]
        assert rep2["is_demo"] is False
        assert rep2["location_precision"] == "gps_outside_pilot"
        assert rep2["outside_pilot_area"] is True

        # 3. Resident list_reports only shows their reports
        resident_reports = client.get("/api/reports", headers=resident_headers).json()
        rep_ids = [r["id"] for r in resident_reports]
        assert rep1["id"] in rep_ids
        assert rep2["id"] in rep_ids

        # 4. Admin list_reports shows all reports
        admin_reports = client.get("/api/reports", headers=admin_headers).json()
        assert len(admin_reports) >= len(resident_reports)


def test_demo_reset_preserves_real_operational_records():
    with TestClient(app) as client:
        admin_headers = auth(client, "admin", "admin123")
        resident_headers = auth(client, "resident", "citizen123")

        # Create a real operational report
        created = client.post("/api/reports", headers=resident_headers, data={
            "issue_type": "BURNING",
            "description": "Critical field report that must survive demo reset",
            "ward": "Ward 01",
            "lat": 21.1458,
            "lng": 79.0882
        })
        assert created.status_code == 200
        real_report_id = created.json()["report"]["id"]
        real_hotspot_id = created.json()["hotspot"]["id"]

        # Trigger demo reset
        reset_res = client.post("/api/demo/reset", headers=admin_headers)
        assert reset_res.status_code == 200
        reset_data = reset_res.json()
        assert "preserved_real_records" in reset_data
        assert reset_data["preserved_real_records"]["reports"] >= 1
        assert reset_data["preserved_real_records"]["hotspots"] >= 1

        # Verify real report and hotspot still exist
        reports = client.get("/api/reports", headers=admin_headers).json()
        assert any(r["id"] == real_report_id for r in reports)
        hs = client.get(f"/api/hotspots/{real_hotspot_id}/passport", headers=admin_headers)
        assert hs.status_code == 200
        assert hs.json()["hotspot"]["is_demo"] is False


def test_admin_user_provisioning_and_rbac():
    with TestClient(app) as client:
        admin_headers = auth(client, "admin", "admin123")
        resident_headers = auth(client, "resident", "citizen123")

        # Non-admin cannot provision users
        denied = client.post("/api/users", headers=resident_headers, json={
            "username": "unauthorized_user", "display_name": "Unauthorized",
            "role": "resident", "password": "Password123!"
        })
        assert denied.status_code == 403

        # Admin provisions a genuine pilot resident
        username = f"pilot_res_{int(datetime.now(timezone.utc).timestamp())}"
        created = client.post("/api/users", headers=admin_headers, json={
            "username": username, "display_name": "Pilot Resident Anita",
            "role": "resident", "password": "PilotResidentPass2026!"
        })
        assert created.status_code == 200
        user_data = created.json()
        assert user_data["username"] == username
        assert user_data["role"] == "resident"
        assert "password" not in user_data

        # Duplicate username returns 409
        dup = client.post("/api/users", headers=admin_headers, json={
            "username": username, "display_name": "Duplicate Anita",
            "role": "resident", "password": "AnotherPassword123!"
        })
        assert dup.status_code == 409

        # Newly provisioned user can log in
        login_res = client.post("/api/auth/login", json={"username": username, "password": "PilotResidentPass2026!"})
        assert login_res.status_code == 200
        assert "access_token" in login_res.json()


def test_resident_evidence_privacy_and_passport_isolation():
    with TestClient(app) as client:
        admin_headers = auth(client, "admin", "admin123")
        ts = int(datetime.now(timezone.utc).timestamp())
        user_a = f"alice_{ts}"
        user_b = f"bob_{ts}"

        # Provision Alice and Bob
        client.post("/api/users", headers=admin_headers, json={"username": user_a, "display_name": "Alice A", "role": "resident", "password": "AlicePassword123!"})
        client.post("/api/users", headers=admin_headers, json={"username": user_b, "display_name": "Bob B", "role": "resident", "password": "BobPassword123!"})

        alice_token = client.post("/api/auth/login", json={"username": user_a, "password": "AlicePassword123!"}).json()["access_token"]
        bob_token = client.post("/api/auth/login", json={"username": user_b, "password": "BobPassword123!"}).json()["access_token"]
        alice_headers = {"Authorization": f"Bearer {alice_token}"}
        bob_headers = {"Authorization": f"Bearer {bob_token}"}

        # Alice creates a report with photo evidence
        photo_data = png_bytes()
        rep_res = client.post("/api/reports", headers=alice_headers, data={
            "issue_type": "DUMPING", "description": "Alice private photo",
            "ward": "Ward 01", "lat": 21.1458, "lng": 79.0882, "consent": "true"
        }, files={"photo": ("evidence.png", photo_data, "image/png")})
        assert rep_res.status_code == 200
        photo_key = rep_res.json()["report"]["photo_key"]
        hotspot_id = rep_res.json()["hotspot"]["id"]
        assert photo_key is not None

        # Alice can fetch her own evidence
        alice_fetch = client.get(f"/api/evidence/{photo_key}", headers=alice_headers)
        assert alice_fetch.status_code == 200

        # Bob CANNOT fetch Alice's evidence (returns 403 Forbidden)
        bob_fetch = client.get(f"/api/evidence/{photo_key}", headers=bob_headers)
        assert bob_fetch.status_code == 403

        # Bob inspecting hotspot passport does not see Alice's reports
        bob_passport = client.get(f"/api/hotspots/{hotspot_id}/passport", headers=bob_headers).json()
        assert not any(r["photo_key"] == photo_key for r in bob_passport["reports"])

        # Alice inspecting hotspot passport sees her own report
        alice_passport = client.get(f"/api/hotspots/{hotspot_id}/passport", headers=alice_headers).json()
        assert any(r["photo_key"] == photo_key for r in alice_passport["reports"])


def test_consent_handling_and_production_lockout():
    import os
    with TestClient(app) as client:
        resident_headers = auth(client, "resident", "citizen123")

        # Report without consent is rejected
        rejected = client.post("/api/reports", headers=resident_headers, data={
            "issue_type": "DUMPING", "description": "No consent given",
            "ward": "Ward 01", "lat": 21.1458, "lng": 79.0882, "consent": "false"
        })
        assert rejected.status_code == 422
        assert "consent is required" in rejected.json()["detail"].lower()

        # In production mode, demo password login is rejected
        old_env = os.environ.get("ENVIRONMENT", "development")
        try:
            os.environ["ENVIRONMENT"] = "production"
            prod_login = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
            assert prod_login.status_code == 401
            assert "default demo credentials cannot be used" in prod_login.json()["detail"].lower()
        finally:
            os.environ["ENVIRONMENT"] = old_env
