RECURSCOPE MVP v0.4 — WINDOWS STARTUP FIXES

1. Uses dedicated ports: web 5188 and API 8018, so it does not attach to JanSetu on 5173/8000.
2. The launcher checks API identity/health before opening the browser.
3. Local Windows demo uses SQLite, so it does not install the optional PostgreSQL psycopg driver. This avoids psycopg-binary wheel/dependency resolution failures on some Python environments.
4. Docker/PostgreSQL setup installs backend/requirements-postgres.txt from the Dockerfile.

Launch: double-click START_RECURSCOPE.bat from this extracted project folder.
App: http://localhost:5188
API health: http://127.0.0.1:8018/health
API docs: http://127.0.0.1:8018/docs
