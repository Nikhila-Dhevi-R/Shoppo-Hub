from __future__ import annotations

import hashlib
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from functools import wraps
from typing import Any, Callable

from flask import Blueprint, current_app, g, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

from .db import get_db


auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")
SESSION_COOKIE = "shophub_session"
SESSION_DAYS = 7
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _timestamp(value: datetime) -> str:
    return value.isoformat(timespec="seconds").replace("+00:00", "Z")


def _safe_user(row: Any) -> dict[str, Any]:
    return {"id": row["id"], "name": row["name"], "email": row["email"]}


def current_user() -> dict[str, Any] | None:
    if hasattr(g, "shop_user"):
        return g.shop_user

    token = request.cookies.get(SESSION_COOKIE, "")
    if not token:
        g.shop_user = None
        return None

    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    row = get_db().execute(
        """
        SELECT users.id, users.name, users.email, sessions.expires_at
        FROM sessions JOIN users ON users.id = sessions.user_id
        WHERE sessions.token_hash = ?
        """,
        (token_hash,),
    ).fetchone()

    if row is None:
        g.shop_user = None
        return None

    if row["expires_at"] <= _timestamp(_utc_now()):
        database = get_db()
        database.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))
        database.commit()
        g.shop_user = None
        return None

    g.shop_user = _safe_user(row)
    return g.shop_user


def login_required(view: Callable[..., Any]) -> Callable[..., Any]:
    @wraps(view)
    def wrapped(*args: Any, **kwargs: Any):
        if current_user() is None:
            return jsonify(error="Please sign in to continue."), 401
        return view(*args, **kwargs)

    return wrapped


def _json_body() -> dict[str, Any] | None:
    body = request.get_json(silent=True)
    return body if isinstance(body, dict) else None


@auth_bp.post("/register")
def register():
    body = _json_body()
    if body is None:
        return jsonify(error="Please enter valid account details."), 400

    name = body.get("name")
    email = body.get("email")
    password = body.get("password")
    if not all(isinstance(value, str) for value in (name, email, password)):
        return jsonify(error="Please complete every field."), 400

    name = name.strip()
    email = email.strip().lower()
    if not name or len(name) > 120:
        return jsonify(error="Enter a name between 1 and 120 characters."), 400
    if len(email) > 254 or not EMAIL_PATTERN.fullmatch(email):
        return jsonify(error="Enter a valid email address."), 400
    if len(password) < 8:
        return jsonify(error="Choose a password with at least 8 characters."), 400
    if len(password) > 256:
        return jsonify(error="Your password is too long."), 400

    database = get_db()
    if database.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
        return jsonify(error="An account with this email already exists. Please log in."), 409

    created_at = _timestamp(_utc_now())
    try:
        cursor = database.execute(
            "INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
            (name, email, generate_password_hash(password), created_at),
        )
        database.commit()
    except sqlite3.IntegrityError:
        database.rollback()
        return jsonify(error="An account with this email already exists. Please log in."), 409
    except Exception:
        database.rollback()
        raise

    user = {"id": cursor.lastrowid, "name": name, "email": email}
    return jsonify(success=True, user=user), 201


@auth_bp.post("/login")
def login():
    body = _json_body()
    if body is None:
        return jsonify(error="Enter your email and password."), 400

    email = body.get("email")
    password = body.get("password")
    if not isinstance(email, str) or not isinstance(password, str):
        return jsonify(error="Enter your email and password."), 400

    email = email.strip().lower()
    user_row = get_db().execute(
        "SELECT id, name, email, password_hash FROM users WHERE email = ?",
        (email,),
    ).fetchone()
    if user_row is None or not check_password_hash(user_row["password_hash"], password):
        return jsonify(error="Email or password is incorrect."), 401

    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    now = _utc_now()
    get_db().execute(
        "INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
        (token_hash, user_row["id"], _timestamp(now + timedelta(days=SESSION_DAYS)), _timestamp(now)),
    )
    get_db().commit()

    response = jsonify(success=True, user=_safe_user(user_row))
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=SESSION_DAYS * 24 * 60 * 60,
        httponly=True,
        secure=bool(current_app.config.get("COOKIE_SECURE", False)),
        samesite="Lax",
        path="/",
    )
    return response


@auth_bp.get("/me")
def me():
    user = current_user()
    if user is None:
        return jsonify(error="Please sign in to continue."), 401
    return jsonify(user=user)


@auth_bp.post("/logout")
def logout():
    token = request.cookies.get(SESSION_COOKIE, "")
    if token:
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        get_db().execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))
        get_db().commit()

    response = jsonify(success=True)
    response.set_cookie(
        SESSION_COOKIE,
        "",
        max_age=0,
        httponly=True,
        secure=bool(current_app.config.get("COOKIE_SECURE", False)),
        samesite="Lax",
        path="/",
    )
    return response
