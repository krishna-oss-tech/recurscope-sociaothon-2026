# RecurScope — PS 06 Working MVP v0.5

**SOCIAOTHON 2026 · Preventing Recurring Waste Hotspots**<br/>
*Don't just clear the waste. Break the cycle.*

RecurScope is an evidence-led waste operations prototype centred on a recurrence decision workbench—not just a complaint map. Its primary workflow separates possible post-cleanup returns from unresolved accumulation, requires human review before recurrence is confirmed, and connects preventive actions to actual 7/30-day observations.

> **Demo honesty:** the included seed dataset is synthetic and explicitly presented as simulated in the UI. It is not municipal data and is not evidence of measured impact. The operational priority score is a configurable, explainable prototype rule—not an ML prediction or probability.

## What works in this version

- Role-based sign-in for resident, supervisor, field worker and recovery partner.
- Recurrence-first workbench with separate lanes for possible returns, persistent/unresolved accumulation, confirmed recurrence history and intervention effectiveness; map/list remains supporting context.
- Citizen report submission with issue type, click-to-place Leaflet map pin, optional current-device geolocation, manually editable coordinates, GPS-accuracy field, photo validation (JPG/PNG/WebP up to 5 MB) and consent checkbox.
- Supervisor or original reporter can attach a photo to the existing incident later; the event is appended to the hotspot timeline instead of creating a duplicate report, and access is role-checked.
- Live 100 m candidate lookup as the report pin moves; each candidate displays distance and status, and must be explicitly linked by a person. Nearby location records are never auto-merged from distance alone.
- Map-first overview with a 100 m context ring around the selected hotspot, animated focus on map selection, and geodesic nearby-candidate counts.
- Hotspot Passport: incident history, event timeline, evidence references, current status, recurrence count and transparent score breakdown.
- Configurable nearby-candidate endpoint (100 m default); nearby grouping is reviewable, not an automatic merge based only on distance.
- Task assignment, worker start, before/after image upload, evidence location/time checks, submit-for-review, supervisor approve/reject.
- Supervisor approval schedules 7-day and 30-day follow-up records; recording an outcome against an intervention updates its matching scheduled window rather than creating a duplicate placeholder. Cross-hotspot intervention links are rejected.
- Recurrence confirmation is blocked unless the selected report is later than a recorded verified cleanup and has evidence linked. Multiple reports before a verified cleanup remain unresolved/persistent accumulation.
- Intervention Ledger with a suspected cause recorded as a hypothesis, action, owner, due date and scheduled follow-up.
- Four waste streams plus explicit mixed/unknown state, receiver/MRF handoff records and receipt status.
- Ward analytics with declared denominators and a note when the observation data is insufficient.
- Resettable synthetic scenario; uploaded evidence is resized/re-encoded as JPEG and stored on persistent local/container storage.
- API tests cover unresolved-vs-recurrence logic, evidence requirements, same-report evidence attachment and its access control, task state transitions, a seeded possible-return review case and intervention-linked follow-up updates.

## Signature demo cases

- **HS-060 — possible return (synthetic):** verified cleanup exists, a later evidence-linked report is waiting for human review, and recurrence count remains zero until confirmed.
- **HS-021 — persistent/unresolved accumulation (synthetic):** multiple reports before verified cleanup; the system blocks recurrence confirmation.
- **HS-014 — confirmed recurrence history (synthetic):** demonstrates a previously reviewed return and a linked preventive intervention.

The Intervention Ledger reports **“effectiveness not established”** whenever the planned observation evidence is incomplete. “Not observed” is a data-collection state, not a successful outcome. A “no return observed” statement applies only to the recorded inspection window and is not a guarantee that a hotspot will never recur.

## Architecture

```text
Resident / Worker / Supervisor / Recovery Partner
                     |
              React + TypeScript
            Vite · Leaflet · OSM
                     |
                FastAPI REST API
            Pydantic · role checks
                     |
            SQLAlchemy data layer
           /                     \
SQLite local demo        PostgreSQL + PostGIS
                            (Docker Compose)
                     |
             Evidence image storage
        local persistent volume in demo
```

The data model stores stable hotspot identities, reports, tasks, append-only timeline events, interventions, follow-up observations, handoffs and audit entries. When PostgreSQL/PostGIS is used, the candidate search can run through PostGIS distance functions; SQLite uses the same configurable-radius Haversine fallback for a portable local demo.

## Recommended Windows launch — one click (v0.5)

**Use this for the current RecurScope folder. Do not open `localhost:5173` or `localhost:8000`**—those are commonly already used by JanSetu or another Vite/API project. RecurScope v0.5 uses its own fixed ports: web `http://localhost:5188`, API `http://127.0.0.1:8018`.

1. Close any older RecurScope development terminals, but you do not need to uninstall or delete JanSetu.
2. In this extracted `RecurScope_MVP_v0.5` folder, double-click `START_RECURSCOPE.bat`.
3. On first launch it creates the Python virtual environment and installs missing dependencies; it may take a few minutes and needs internet access for package installation. It opens separate API and web terminal windows and waits for the API before opening RecurScope in the browser.
4. Confirm the browser address is **`http://localhost:5188`** and the page says **RecurScope Workspace**. If a configured port is already occupied, the launcher stops with the port number rather than silently showing another app.
5. Demo logins: `admin` / `admin123`; `worker` / `worker123`; `resident` / `citizen123`; `receiver` / `receiver123`.

To stop the servers, press `Ctrl+C` in both RecurScope API and RecurScope Web terminal windows.

## Manual quick start — simplest local mode

You need Python 3.11+ (Python 3.12 recommended) and Node.js 20+ (Node 22 recommended). Run each command in a separate terminal.

### 1) Start the API

```bash
cd backend
python -m venv .venv
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# macOS/Linux:
# source .venv/bin/activate
pip install -r requirements.txt

# The local demo uses SQLite, so no PostgreSQL driver is needed.
# For PostgreSQL/PostGIS Docker builds, the Dockerfile also installs requirements-postgres.txt.
# Optional: copy .env.example to .env and adjust values for your environment.
uvicorn app.main:app --reload --host 127.0.0.1 --port 8018
```

The local default is SQLite at `backend/recurscope.db`. On first start, the API creates the schema and seeds the sample scenario. API health: <http://127.0.0.1:8018/health>. Interactive API docs: <http://127.0.0.1:8018/docs>.

### 2) Start the web app

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5188>. The map uses OpenStreetMap tiles and therefore needs an internet connection for the basemap; the report form, lists and case controls remain available if map tiles fail. To target a different API, create `frontend/.env.local` with:

```env
VITE_API_BASE_URL=http://127.0.0.1:8018
```

### 3) Demo accounts

| Role | Username | Password |
|---|---|---|
| Ward supervisor | `admin` | `admin123` |
| Field worker | `worker` | `worker123` |
| Resident | `resident` | `citizen123` |
| Recovery partner | `receiver` | `receiver123` |

These credentials are intentionally convenient for a local hackathon demo only. Change `SECRET_KEY`, credentials and deployment configuration before hosting publicly.

## One-command container setup

Docker Compose uses PostgreSQL/PostGIS, the API, and a built frontend. It is a separate deployment mode and needs Docker running.

```bash
docker compose up --build
```

Then open <http://localhost:5188>; API docs are at <http://localhost:8018/docs>. Change demo passwords, the database password and the API secret before any public deployment. `recurscope_db` and `recurscope_evidence` volumes persist the local container data.

## Test the core rules

From `backend/` with the dependencies installed:

```bash
pytest -q
```

Acceptance scenarios covered:

1. Health and seed-data mode are visible.
2. Two reports before verified cleanup cannot be labelled recurrence.
3. Task flow requires before and after evidence, location/time metadata, and supervisor review; approval schedules both follow-up windows.
4. A post-cleanup return without photo evidence cannot be confirmed; an evidence-backed report can be confirmed by an authorised reviewer.

## Recommended 2-minute judge demo

1. Sign in as **admin**. Open **Hotspot map** and select **HS-014 / Market Lane Corner**. Point out the simulated timeline: verified cleanup, then a later incident.
2. Open a new task against **HS-021 / Bus Stand Service Road**. Switch to **worker**, start the task, upload a before-photo and an after-photo, then submit it for review.
3. Switch back to **admin** and verify the task. Show that cleanup verification created 7-day and 30-day follow-up records rather than declaring the location permanently fixed.
4. Open **Hotspot Passport** for a location with a possible return and use human review to confirm recurrence only when a post-cleanup evidence-backed report exists.
5. Open **Intervention Ledger** and create a preventive action linked to a clearly labelled hypothesis; then show the 7/30-day schedule.
6. Open **Segregation & impact**. Show a pending dry-waste handoff and confirm receipt as the receiver/admin. Explain that a pending handoff is not counted as received.
7. Finish with analytics, pointing out the numerator/denominator and simulated-data warning.

Tip: use a local throwaway JPG/PNG photo during rehearsal so the upload and after-photo evidence really persists. Seeded `demo://...` references are story data, not actual image files.

## Important limitations before a public pilot

- This is an early working MVP, not a security-audited municipal production system.
- User administration, password reset, ward-level data permissions, rate limiting, privacy retention jobs and formal audit export need further hardening before public exposure.
- The recovery-partner view uses a simple demo receiver label filter. A real deployment should assign a receiver ID and enforce partner-scoped permissions server-side.
- Image data uses local disk / a Docker persistent volume in this MVP. For deployments with ephemeral disks, wire the storage interface to S3-compatible object storage and keep only object metadata in Postgres.
- Candidate grouping is a configurable radius plus human decision; it is not an automatic proof that two incidents are the same place.
- The initial operational-priority weights and thresholds are prototype hypotheses; test them with permissioned data before operational use.
- Analytics only use available recorded observations. “Not observed” and missing follow-up do not count as “no recurrence”.
- OSM tiles rely on network connectivity and the tile provider's usage policy. Review this before scaling.
- PostGIS support is best-effort at startup; if the hosting Postgres instance disallows the extension, candidate distance falls back to Haversine. The model currently stores latitude/longitude columns and uses PostGIS point expressions for candidate search, not a materialized indexed geometry column.

## Repository map

```text
backend/
  app/database.py     engine, session and model base
  app/models.py       users, hotspots, reports, events, tasks, interventions, follow-ups, handoffs, audit log
  app/security.py     password hashing, signed bearer token, role dependencies
  app/logic.py        geospatial distance and explainable priority rules
  app/seed.py         synthetic demo dataset and reset scenario
  app/main.py         REST endpoints and validation/state transitions
  tests/              workflow acceptance tests
frontend/
  src/App.tsx         dashboard and operational workflows
  src/components/     role login and Leaflet map
  src/lib/            typed API client and data contracts
  src/styles.css      responsive product UI
```

## Product direction guardrails

- Don't add broad feature categories before the citizen-to-verified-cleanup-to-follow-up flow is repeatedly demoable.
- Don't call the score AI, ML, or a probability.
- Don't call a location a recurrence unless the evidence chronology supports it.
- Keep every sample record labelled simulated.
- Don't copy source code/assets from MapMyWaste or JanSetu-Swachh without confirming licence/permission.


### Existing-report evidence repair

Supervisors can attach a JPG, PNG or WebP image (maximum 5 MB) to an existing post-cleanup report from the Hotspot Passport. The API records a separate `REPORT_EVIDENCE_ATTACHED` event; it does not create a duplicate report. Only the report owner or an authorised supervisor can attach evidence. The recurrence decision remains a separate supervisor action and still requires the report to be after the latest verified cleanup.
