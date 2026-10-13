from __future__ import annotations

import sqlite3
from pathlib import Path

from flask import Flask, current_app, g

from .catalog import normalize_order, order_fingerprint


def get_db() -> sqlite3.Connection:
    if "database" not in g:
        database_path = Path(current_app.config["DATABASE"])
        database_path.parent.mkdir(parents=True, exist_ok=True)
        database = sqlite3.connect(database_path)
        database.row_factory = sqlite3.Row
        database.execute("PRAGMA foreign_keys = ON")
        g.database = database
    return g.database


def close_db(_error: BaseException | None = None) -> None:
    database = g.pop("database", None)
    if database is not None:
        database.close()


def init_db() -> None:
    get_db().executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reference TEXT NOT NULL UNIQUE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            delivery_name TEXT NOT NULL,
            delivery_address TEXT NOT NULL,
            delivery_phone TEXT NOT NULL,
            total INTEGER NOT NULL CHECK (total >= 0),
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
            product_id INTEGER NOT NULL,
            product_name TEXT NOT NULL,
            unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
            quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99)
        );

        CREATE TABLE IF NOT EXISTS order_submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            idempotency_key TEXT NOT NULL,
            order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
            payload_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE (user_id, idempotency_key)
        );

        CREATE INDEX IF NOT EXISTS orders_user_id_created_at_idx ON orders(user_id, created_at);
        CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items(order_id);
        CREATE INDEX IF NOT EXISTS order_submissions_user_id_idx ON order_submissions(user_id);
        """
    )

    submission_columns = {
        row["name"]
        for row in get_db().execute("PRAGMA table_info(order_submissions)").fetchall()
    }
    if "payload_hash" not in submission_columns:
        database = get_db()
        database.execute("ALTER TABLE order_submissions ADD COLUMN payload_hash TEXT")
        database.commit()

    database = get_db()
    legacy_submissions = database.execute(
        "SELECT id, order_id FROM order_submissions WHERE payload_hash IS NULL OR payload_hash = ''"
    ).fetchall()
    for submission in legacy_submissions:
        order = database.execute(
            "SELECT delivery_name, delivery_address, delivery_phone FROM orders WHERE id = ?",
            (submission["order_id"],),
        ).fetchone()
        item_rows = database.execute(
            "SELECT product_id, quantity FROM order_items WHERE order_id = ? ORDER BY product_id",
            (submission["order_id"],),
        ).fetchall()
        if order is None or not item_rows:
            continue
        try:
            items, delivery, _total = normalize_order(
                [{"id": row["product_id"], "quantity": row["quantity"]} for row in item_rows],
                {
                    "name": order["delivery_name"],
                    "address": order["delivery_address"],
                    "phone": order["delivery_phone"],
                },
            )
        except ValueError:
            continue
        database.execute(
            "UPDATE order_submissions SET payload_hash = ? WHERE id = ?",
            (order_fingerprint(items, delivery), submission["id"]),
        )
    if legacy_submissions:
        database.commit()


def init_app(app: Flask) -> None:
    app.teardown_appcontext(close_db)
    with app.app_context():
        init_db()
