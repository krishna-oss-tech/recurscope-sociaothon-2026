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
| `VITE_API_BASE_URL` | Optional | `""` | `https://your-recurscope-api.onrender.com` | Base URL of the live operational backend API. If omitted on non-localhost domains, frontend defaults to relative `/` (for reverse proxies) |
| `VITE_DEMO_API_BASE_URL` | Recommended | `""` | `https://your-recurscope-demo-api.onrender.com` | Base URL of the isolated demo backend service with synthetic records. If unset in production, demo mode shows an incomplete configuration notice |

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

## 4. Chosen Production Architecture: Vercel Frontend + Render Backend

This is the primary production architecture for RecurScope. It provides independent scaling, durable persistent disk storage for before/after photos, and strict separation between the client and API tiers.

### Step 1: Deploy Backend & Database on Render

1. **Provision Managed PostgreSQL**:
   - Create a **PostgreSQL Database** on Render (or Supabase / Neon / AWS RDS).
   - Copy the internal or external connection string (format: `postgresql://user:password@host:5432/dbname`).
2. **Create Web Service**:
   - In Render, create a **Web Service** pointing to your GitHub repository.
   - **Root Directory**: `backend`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt -r requirements-postgres.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Health Check Path**: `/health` (or `/api/health`)
3. **Attach Persistent Storage**:
   - Under **Disks**, add a persistent volume:
     - **Name**: `recurscope-evidence`
     - **Mount Path**: `/app/storage/evidence`
     - **Size**: 1 GB or larger
4. **Configure Backend Environment Variables**:
   ```env
   ENVIRONMENT=production
   DATABASE_URL=postgresql+psycopg://user:password@host:5432/dbname
   SECRET_KEY=<32-byte-hex-random>
   INITIAL_ADMIN_USERNAME=admin
   INITIAL_ADMIN_PASSWORD=<secure-admin-password>
   EVIDENCE_DIR=/app/storage/evidence
   ALLOW_DEMO_RESET=false
   CORS_ORIGINS=https://<your-vercel-domain>.vercel.app
   CORS_ORIGIN_REGEX=^https:\/\/.*\.vercel\.app$
   ```

### Step 2: Deploy Frontend on Vercel

1. **Import Project**:
   - In Vercel, import your GitHub repository.
   - Set **Root Directory** to `frontend` (or click **Import single project** next to `frontend`).
   - **Framework Preset**: `Vite` (auto-detected).
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
2. **Configure Frontend Environment Variables**:
   ```env
   # 1. Operational Pilot Backend (strict production authentication & live PostgreSQL)
   VITE_API_BASE_URL=https://<your-render-service>.onrender.com

   # 2. Isolated Demo Backend (sandbox with synthetic seed records & demo reset)
   VITE_DEMO_API_BASE_URL=https://<your-render-demo-service>.onrender.com
   ```
   > [!IMPORTANT]
   > - **Mode Isolation**: When the user selects **Explore Demo**, all authentication, tasks, reports, and resets strictly target `VITE_DEMO_API_BASE_URL`.
   > - **Operational Security**: When the user selects **Operational Login**, all requests target `VITE_API_BASE_URL`. Default demo credentials are never sent to the production operational API.
   > - If `VITE_DEMO_API_BASE_URL` is omitted, the frontend clearly indicates that the demo service is unconfigured, preventing misconfigured demo requests against live production records.
3. **Routing**:
   - Handled via [`frontend/vercel.json`](file:///d:/RecurScope_MVP_v0.5/RecurScope_MVP_v0.5/frontend/vercel.json) rewrite rule `/(.*) -> /index.html` for clean client-side SPA routing.

### Step 3: Deploy Isolated Demo Service on Render (Optional for Demo Mode)

To provide the Explore Demo experience alongside the operational pilot without compromising production security:

1. **Create a Second Render Web Service**:
   - **Name**: `recurscope-demo-api`
   - **Root Directory**: `backend`
   - **Build Command**: `pip install -r requirements.txt -r requirements-postgres.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
2. **Configure Demo Environment Variables**:
   ```env
   ENVIRONMENT=development
   SEED_DEMO=true
   ALLOW_DEMO_RESET=true
   DATABASE_URL=sqlite:////app/storage/demo.db
   ALLOW_SQLITE_IN_PRODUCTION=true
   EVIDENCE_DIR=/app/storage/demo_evidence
   ALLOW_EPHEMERAL_STORAGE=true
   SECRET_KEY=<generate-separate-demo-secret>
   CORS_ORIGINS=https://<your-vercel-domain>.vercel.app
   CORS_ORIGIN_REGEX=^https:\/\/.*\.vercel\.app$
   ```
3. **Add Demo URL to Vercel**:
   - In Vercel Project Settings -> Environment Variables:
   - Add `VITE_DEMO_API_BASE_URL=https://recurscope-demo-api.onrender.com`.
   - Redeploy the frontend.

### Step 4: Verification Checklist

1. Visit `https://<your-render-service>.onrender.com/health`:
   - Returns status: `{"ok": true, "service": "recurscope-api", "version": "0.5.0", "database": "connected", "environment": "production", "demo_mode": false}`.
2. Visit `https://<your-vercel-domain>.vercel.app`:
   - **Explore Demo**:
     - If `VITE_DEMO_API_BASE_URL` is set: clicking demo role cards authenticates against the isolated demo backend with simulated records.
     - If `VITE_DEMO_API_BASE_URL` is unset: shows clear warning that demo service configuration is incomplete.
   - **Operational Login**:
     - Connects exclusively to the production API.
     - Default demo passwords (`admin123`, `worker123`, etc.) are blocked.
     - Provisioned municipal staff and registered residents log in to genuine operational records.

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

---

## 7. Pilot Security, Identity, Consent & Data-Retention Gate

### A. Production Identity & Admin-Controlled Provisioning
- **Safe Pilot Onboarding**: Public unrestricted self-registration is disabled. Pilot participants (residents, field workers, recovery partners) are provisioned directly by an authorised administrator via `POST /api/users`.
  ```json
  POST /api/users
  Headers: { "Authorization": "Bearer <admin-token>" }
  {
    "username": "resident_ravi",
    "display_name": "Ravi Sharma",
    "role": "resident",
    "password": "SecurePilotPassword2026!"
  }
  ```
- **Password Security**: Passwords are never logged or returned in responses. Hashing is performed via PBKDF2-HMAC-SHA256 with 210,000 iterations and 16-byte random salts.
- **Demo Credential Lockout**: In production (`ENVIRONMENT=production`), default demo passwords (`admin123`, `worker123`, `citizen123`, `receiver123`) are explicitly rejected by the authentication layer, and quick-login demo buttons are automatically removed from the login interface.

### B. Role-Based Access & Evidence Isolation
- **Resident Privacy**:
  - `GET /api/reports`: Residents only see reports they submitted (`reporter_id == user.id`).
  - `GET /api/hotspots/{id}/passport`: Reports list is restricted to the requesting resident's own reports.
  - `GET /api/evidence/{key}`: Residents are forbidden (`HTTP 403`) from accessing photo evidence keys submitted by other residents.
- **Field Worker Authorization**: Workers can only inspect, start, add evidence to, and submit tasks assigned to their user ID (`task.assigned_worker_id == user.id`).
- **Recovery Partner Authorization**: Recycling handoffs are matched to the authenticated recovery partner's verified username or display name rather than demo substrings.

### C. Citizen Consent, Evidence Sanitization & Data Retention
- **Informed Citizen Consent**: Report submission requires explicit consent confirmation that the location and photo are provided for municipal waste case handling.
- **Image Content & EXIF Sanitization**:
  - Max upload size is strictly capped at 5 MB (`MAX_UPLOAD_MB`).
  - Uploaded files are verified using PIL/Pillow for valid image headers (JPEG, PNG, WebP).
  - Images are re-encoded to clean JPEG (quality 86, max 1800x1800) with server-generated UUID filenames. This completely strips embedded EXIF metadata and prevents polyglot attacks.
- **Data Retention Schedule**:
  - **Active Operational Period**: Reports and evidence photos remain active until hotspot cleanup is verified.
  - **Post-Verification Retention**: Records and evidence are preserved for 90 days following verified cleanup for follow-up recurrence tracking.
  - **Data Minimization**: Personal resident contact details (e.g., phone, email) are never stored in incident report tables; identity is maintained solely by internal user foreign key.
- **Abuse Protections & Rate Limiting**:
  - In-memory rate limiting throttles authentication (`POST /api/auth/login`), report submissions (`POST /api/reports`), and image uploads (`POST /api/*/evidence`) to protect against brute-force attacks and automated flooding.
