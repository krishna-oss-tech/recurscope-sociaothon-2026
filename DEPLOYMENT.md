# RecurScope — Production Readiness & Deployment Guide

> **Product**: RecurScope (PS 06 — Preventing Recurring Waste Hotspots)<br/>
> **Target**: Public Hackathon Demo / Cloud Production Hosting<br/>
> **Local Launcher**: Preserved on ports `8018` (API) and `5188` (Frontend)

---

## 1. Architecture & Persistence Audit

### Storage & Ephemeral Risks
- **Database**:
  - **Local Development**: Uses SQLite (`sqlite:///./recurscope.db`) with foreign keys enabled (`PRAGMA foreign_keys=ON`).
  - **Production Requirement**: Deploy with PostgreSQL (PostGIS extension optional but supported). Ephemeral container disks will wipe SQLite databases on restart.
- **Evidence Images (`EVIDENCE_DIR`)**:
  - Uploaded verification and report photos are stored under `EVIDENCE_DIR` (defaults to `./storage/evidence` or `/app/storage/evidence`).
  - **Production Requirement**: When running in Docker or containerized PaaS (Render, Railway, Fly.io), attach a **persistent disk/volume** mounted to `/app/storage/evidence`. Without persistent volume mounting, newly uploaded images will be lost on container recreation.
- **Demo Data Safety**:
  - Seeded demo records are flagged with `is_demo=True` and `location_precision="simulated"`.
  - The demo reset endpoint (`POST /api/demo/reset`) is strictly protected in production:
    - Blocked with `HTTP 403` when `ENVIRONMENT=production` unless explicitly overridden by `ALLOW_DEMO_RESET=true`.
    - Requires authenticated `admin` role with audit trail logging (`DEMO_RESET`).

---

## 2. Environment Variables Reference

### Backend (`/backend`)

| Variable | Required | Default | Production Value | Description |
|---|:---:|---|---|---|
| `ENVIRONMENT` | Yes | `development` | `production` | Switches security guards and disables demo reset by default |
| `DATABASE_URL` | Yes | `sqlite:///./recurscope.db` | `postgresql+psycopg://user:pass@host:5432/db` | PostgreSQL connection URI. Automatically normalizes `postgres://` -> `postgresql://` |
| `SECRET_KEY` | Yes | `local-demo-secret...` | *(Generate 32-byte hex)* | Used for JWT signing. Generate: `python -c "import secrets; print(secrets.token_hex(32))"` |
| `ACCESS_TOKEN_EXPIRE_HOURS` | No | `8` | `8` to `24` | Token lifespan in hours |
| `ALLOW_DEMO_RESET` | No | `false` | `false` | If `true`, permits `/api/demo/reset` even in production |
| `CORS_ORIGINS` | Yes | `http://localhost:5188` | `https://your-frontend.vercel.app` or `*` | Comma-separated frontend origins. Wildcard `*` is safely handled |
| `CORS_ORIGIN_REGEX` | No | *(empty)* | `^https:\/\/.*\.vercel\.app$` | Optional regex pattern for dynamic deployment preview URLs |
| `EVIDENCE_DIR` | Yes | `./storage/evidence` | `/app/storage/evidence` | Persistent directory for evidence uploads |
| `MAX_UPLOAD_MB` | No | `5` | `5` | Maximum image upload size in MB |
| `HOTSPOT_RADIUS_METERS` | No | `100` | `100` | Candidate detection proximity threshold |

### Frontend (`/frontend`)

| Variable | Required | Default | Production Value | Description |
|---|:---:|---|---|---|
| `VITE_API_BASE_URL` | Optional | `""` | `https://your-recurscope-api.onrender.com` | Base URL of the backend API. If omitted on non-localhost domains, frontend defaults to relative `/` (ideal for reverse proxies) |

---

## 3. Build & Start Commands

### Backend
- **Install Dependencies**:
  ```bash
  pip install -r requirements.txt -r requirements-postgres.txt
  ```
- **Start Command (PaaS / Linux)**:
  ```bash
  uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
  ```
- **Health Check**:
  `GET /health` returns:
  ```json
  {
    "ok": true,
    "service": "recurscope-api",
    "version": "0.5.0",
    "database": "connected",
    "environment": "production"
  }
  ```

### Frontend
- **Install & Build**:
  ```bash
  npm install
  npm run build
  ```
- **Output Directory**: `frontend/dist`
- **SPA Fallbacks**:
  - Vercel: Configured via [vercel.json](file:///d:/RecurScope_MVP_v0.5/RecurScope_MVP_v0.5/frontend/vercel.json).
  - Netlify / Cloudflare / Render: Configured via [public/_redirects](file:///d:/RecurScope_MVP_v0.5/RecurScope_MVP_v0.5/frontend/public/_redirects).
  - Nginx: Pre-configured in [nginx.conf](file:///d:/RecurScope_MVP_v0.5/RecurScope_MVP_v0.5/frontend/nginx.conf).

---

## 4. Recommended Deployment Paths

### Option A: Render + Vercel / Netlify (Simplest Free/Low-Cost Hackathon Stack)

1. **Database & API (Render)**:
   - Create a **PostgreSQL Database** on Render (or Supabase/Neon).
   - Create a **Web Service** on Render from the repository root:
     - Root Directory: `backend`
     - Build Command: `pip install -r requirements.txt -r requirements-postgres.txt`
     - Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
     - Health Check Path: `/health`
     - Add Persistent Disk: Mount `/app/storage/evidence` (1 GB).
     - Environment Variables:
       - `ENVIRONMENT=production`
       - `DATABASE_URL=<your-render-postgres-connection-string>`
       - `SECRET_KEY=<32-byte-hex-random>`
       - `CORS_ORIGINS=https://<your-frontend-project>.vercel.app`
       - `ALLOW_DEMO_RESET=false`
2. **Frontend (Vercel or Netlify)**:
   - Root Directory: `frontend`
   - Framework Preset: `Vite`
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Environment Variable:
     - `VITE_API_BASE_URL=https://<your-render-api-subdomain>.onrender.com`
3. **Verification**:
   - Visit `https://<your-render-api-subdomain>.onrender.com/health` (should return `"ok": true, "database": "connected"`).
   - Visit your frontend URL, log in with `admin` / `admin123`, and verify the overview, hotspot passport, and task workflows.

---

### Option B: Single Host / VPS via Docker Compose

1. **Deploy with persistent volumes**:
   ```bash
   # In workspace root
   docker compose up -d --build
   ```
2. **Default Ports**:
   - Web frontend: `http://<server-ip>:5188`
   - Backend API: `http://<server-ip>:8018`
   - Database: Port `5432` (internal)
3. **Data Volumes**:
   - `recurscope_db`: Preserves PostgreSQL records across container restarts.
   - `recurscope_evidence`: Preserves uploaded before/after evidence photos.

---

## 5. Local Development Preservation

The local Windows launcher scripts and port configurations remain completely intact:
- **`START_RECURSCOPE.bat`**: Starts local backend on `8018` and Vite frontend on `5188`.
- **`CHECK_RECURSCOPE.bat`**: Runs verification suite against active local services.
- **Port Isolation**: RecurScope intentionally uses `8018` and `5188` so it never collides with standard development services on `8000` or `5173`.

---

## 6. Local Operational Pilot Readiness & Field Procedures

### Pilot Area Configuration
The system does not depend on a hard-coded location. The operational pilot geography is fully configurable by an authorised administrator via API or database settings:
- **Endpoints**:
  - `GET /api/config/pilot`: Inspects the active pilot area (name, center coordinates, radius in km, default ward).
  - `PATCH /api/config/pilot` *(Admin only)*: Updates the active pilot parameters:
    ```json
    {
      "name": "Dharampeth Pilot Zone",
      "latitude": 21.1400,
      "longitude": 79.0700,
      "radius_km": 5.0,
      "default_ward": "Ward 02"
    }
    ```

### Real Reporting & GPS Accuracy
- Citizens can report using device GPS (`Locate me`) with captured horizontal accuracy in metres, or by manually clicking/dragging a map pin on the interactive MapLibre map.
- GPS denial or lack of sensor hardware never blocks a report.
- When coordinates fall outside the configured pilot boundary (`distance > radius_km`), the frontend provides an immediate advisory alert, and the report is recorded with `location_precision="..._outside_pilot"` and `outside_pilot_area=True` for triage without silently discarding field observations.

### Demo vs. Operational Separation
- **Seeded records**: Marked with `is_demo=True`.
- **User-submitted reports**: Marked with `is_demo=False`, creating real hotspots (`is_demo=False`, codes `HS-100+`), events, and tasks.
- **Demo Reset Protection**: In development or demo mode, `POST /api/demo/reset` will only purge records where `is_demo=True`. All operational reports, verified cleanups, and field records are strictly preserved.
- **Pure Production Bootstrapping**: Setting `ENVIRONMENT=production` ensures no synthetic demo records are created on startup. A production admin account is provisioned via `INITIAL_ADMIN_PASSWORD` (or `ADMIN_BOOTSTRAP_PASSWORD`).
