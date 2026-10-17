from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from .database import get_db
from .models import User

import logging

logger = logging.getLogger("recurscope.security")
bearer = HTTPBearer(auto_error=False)
SECRET_KEY = os.getenv("SECRET_KEY", "local-demo-secret-change-before-deployment")
ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()
TOKEN_LIFETIME_HOURS = int(os.getenv("ACCESS_TOKEN_EXPIRE_HOURS", "8"))

INSECURE_KEYS = {
    "local-demo-secret-change-before-deployment",
    "replace-with-a-long-random-secret-before-deployment",
    "change-this-to-a-long-random-secret-before-deployment",
    "",
}
if ENVIRONMENT == "production" and (SECRET_KEY in INSECURE_KEYS or len(SECRET_KEY) < 16):
    raise RuntimeError("CRITICAL: A secure, non-default SECRET_KEY (minimum 16 characters) must be configured in production.")



def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 210_000).hex()
    return f"pbkdf2_sha256${salt}${derived}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, salt, digest = stored.split("$", 2)
        if algorithm != "pbkdf2_sha256":
            return False
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 210_000).hex()
        return hmac.compare_digest(actual, digest)
    except (ValueError, AttributeError):
        return False


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def create_access_token(user: User, lifetime_seconds: int | None = None) -> str:
    lifetime = lifetime_seconds if lifetime_seconds is not None else (TOKEN_LIFETIME_HOURS * 3600)
    now = int(time.time())
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {"sub": str(user.id), "username": user.username, "role": user.role, "iat": now, "exp": now + lifetime}
    body = f"{_b64(json.dumps(header, separators=(',', ':')).encode())}.{_b64(json.dumps(payload, separators=(',', ':')).encode())}"
    signature = hmac.new(SECRET_KEY.encode(), body.encode(), hashlib.sha256).digest()
    return f"{body}.{_b64(signature)}"


def decode_access_token(token: str) -> dict:
    try:
        header64, payload64, signature64 = token.split(".")
        header = json.loads(base64.urlsafe_b64decode(header64 + "=" * (-len(header64) % 4)))
        if header.get("alg") != "HS256":
            raise ValueError("unsupported algorithm")
        body = f"{header64}.{payload64}"
        expected = _b64(hmac.new(SECRET_KEY.encode(), body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(expected, signature64):
            raise ValueError("bad signature")
        payload = json.loads(base64.urlsafe_b64decode(payload64 + "=" * (-len(payload64) % 4)))
        if int(payload.get("exp", 0)) < int(time.time()):
            raise ValueError("expired")
        return payload
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session") from exc


def get_current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> User:
    if not credentials:
        raise HTTPException(status_code=401, detail="Sign in to continue")
    payload = decode_access_token(credentials.credentials)
    user = db.get(User, int(payload["sub"]))
    if not user or not user.active:
        raise HTTPException(status_code=401, detail="Account is inactive")
    return user


def allow_roles(*roles: str):
    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Your role cannot perform this action")
        return user
    return dependency
