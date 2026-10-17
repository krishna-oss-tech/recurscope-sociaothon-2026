import pytest
from fastapi.testclient import TestClient
from app.main import app


def auth(client, username="admin", password="admin123"):
    result = client.post("/api/auth/login", json={"username": username, "password": password})
    assert result.status_code == 200, result.text
    return {"Authorization": f"Bearer {result.json()['access_token']}"}


def test_get_pilot_config_unauthenticated():
    with TestClient(app) as client:
        res = client.get("/api/config/pilot")
        assert res.status_code == 401


def test_get_pilot_config_authenticated_roles():
    with TestClient(app) as client:
        for username, pwd in [("resident", "citizen123"), ("worker", "worker123"), ("receiver", "receiver123"), ("admin", "admin123")]:
            headers = auth(client, username, pwd)
            res = client.get("/api/config/pilot", headers=headers)
            assert res.status_code == 200, f"Failed for {username}: {res.text}"
            data = res.json()
            assert "name" in data
            assert "latitude" in data
            assert "longitude" in data
            assert "radius_km" in data
            assert "default_ward" in data


def test_patch_pilot_config_unauthenticated():
    with TestClient(app) as client:
        res = client.patch("/api/config/pilot", json={"name": "Hacked Pilot"})
        assert res.status_code == 401


def test_patch_pilot_config_forbidden_roles():
    with TestClient(app) as client:
        for username, pwd in [("resident", "citizen123"), ("worker", "worker123"), ("receiver", "receiver123")]:
            headers = auth(client, username, pwd)
            res = client.patch("/api/config/pilot", headers=headers, json={"name": "Unauthorized Attempt"})
            assert res.status_code == 403, f"Expected 403 for {username}, got {res.status_code}"


def test_patch_pilot_config_admin_success_and_persistence():
    with TestClient(app) as client:
        admin_headers = auth(client, "admin", "admin123")
        payload = {
            "name": "Nagpur Metro Operational Area",
            "latitude": 21.1550,
            "longitude": 79.0950,
            "radius_km": 18.5,
            "default_ward": "Ward 07",
        }
        res = client.patch("/api/config/pilot", headers=admin_headers, json=payload)
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["name"] == "Nagpur Metro Operational Area"
        assert abs(data["latitude"] - 21.1550) < 1e-4
        assert abs(data["longitude"] - 79.0950) < 1e-4
        assert abs(data["radius_km"] - 18.5) < 1e-4
        assert data["default_ward"] == "Ward 07"

        # Verify persistence via separate GET
        get_res = client.get("/api/config/pilot", headers=admin_headers)
        assert get_res.status_code == 200
        persisted = get_res.json()
        assert persisted["name"] == "Nagpur Metro Operational Area"
        assert abs(persisted["latitude"] - 21.1550) < 1e-4
        assert abs(persisted["longitude"] - 79.0950) < 1e-4
        assert abs(persisted["radius_km"] - 18.5) < 1e-4
        assert persisted["default_ward"] == "Ward 07"


def test_patch_pilot_config_partial_updates():
    with TestClient(app) as client:
        admin_headers = auth(client, "admin", "admin123")
        # Update only radius_km
        res1 = client.patch("/api/config/pilot", headers=admin_headers, json={"radius_km": 25.0})
        assert res1.status_code == 200
        assert res1.json()["radius_km"] == 25.0

        # Update only default_ward
        res2 = client.patch("/api/config/pilot", headers=admin_headers, json={"default_ward": "Ward 12"})
        assert res2.status_code == 200
        assert res2.json()["default_ward"] == "Ward 12"
        assert res2.json()["radius_km"] == 25.0  # Retains previously saved radius


def test_patch_pilot_config_validation_latitude():
    with TestClient(app) as client:
        admin_headers = auth(client, "admin", "admin123")
        # Below -90
        res1 = client.patch("/api/config/pilot", headers=admin_headers, json={"latitude": -95.0})
        assert res1.status_code == 422
        # Above 90
        res2 = client.patch("/api/config/pilot", headers=admin_headers, json={"latitude": 95.0})
        assert res2.status_code == 422
        # Non-numeric
        res3 = client.patch("/api/config/pilot", headers=admin_headers, json={"latitude": "invalid"})
        assert res3.status_code == 422


def test_patch_pilot_config_validation_longitude():
    with TestClient(app) as client:
        admin_headers = auth(client, "admin", "admin123")
        # Below -180
        res1 = client.patch("/api/config/pilot", headers=admin_headers, json={"longitude": -190.0})
        assert res1.status_code == 422
        # Above 180
        res2 = client.patch("/api/config/pilot", headers=admin_headers, json={"longitude": 185.0})
        assert res2.status_code == 422
        # Non-numeric
        res3 = client.patch("/api/config/pilot", headers=admin_headers, json={"longitude": "abc"})
        assert res3.status_code == 422


def test_patch_pilot_config_validation_radius():
    with TestClient(app) as client:
        admin_headers = auth(client, "admin", "admin123")
        # Zero
        res1 = client.patch("/api/config/pilot", headers=admin_headers, json={"radius_km": 0})
        assert res1.status_code == 422
        # Negative
        res2 = client.patch("/api/config/pilot", headers=admin_headers, json={"radius_km": -10.0})
        assert res2.status_code == 422
        # Above 200
        res3 = client.patch("/api/config/pilot", headers=admin_headers, json={"radius_km": 250.0})
        assert res3.status_code == 422
        # Non-numeric
        res4 = client.patch("/api/config/pilot", headers=admin_headers, json={"radius_km": "huge"})
        assert res4.status_code == 422


def test_patch_pilot_config_validation_empty_strings():
    with TestClient(app) as client:
        admin_headers = auth(client, "admin", "admin123")
        # Empty name
        res1 = client.patch("/api/config/pilot", headers=admin_headers, json={"name": ""})
        assert res1.status_code == 422
        # Whitespace-only name
        res2 = client.patch("/api/config/pilot", headers=admin_headers, json={"name": "   "})
        assert res2.status_code == 422
        # Empty default_ward
        res3 = client.patch("/api/config/pilot", headers=admin_headers, json={"default_ward": ""})
        assert res3.status_code == 422
        # Whitespace-only default_ward
        res4 = client.patch("/api/config/pilot", headers=admin_headers, json={"default_ward": "   "})
        assert res4.status_code == 422
