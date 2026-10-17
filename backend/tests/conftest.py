import os
import tempfile
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

_tmp = tempfile.mkdtemp(prefix="recurscope-tests-")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("SECRET_KEY", "test-only-secret-do-not-use-in-production")
os.environ.setdefault("EVIDENCE_DIR", f"{_tmp}/evidence")
os.environ.setdefault("DEMO_SEED", "true")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:5188")
