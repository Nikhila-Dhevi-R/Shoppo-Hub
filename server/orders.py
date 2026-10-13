from __future__ import annotations

import uuid
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from .auth import current_user, login_required
from .catalog import normalize_order, order_fingerprint
from .db import get_db


orders_bp = Blueprint("orders", __name__, url_prefix="/api/orders")


def _utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


@orders_bp.post("")
@login_required
def create_order():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify(error="Please submit a valid order."), 400

    try:
        items, delivery, total = normalize_order(body.get("items"), body.get("delivery"))
    except ValueError as error:
        return jsonify(error=str(error)), 400

    request_fingerprint = order_fingerprint(items, delivery)

    raw_idempotency_key = request.headers.get("Idempotency-Key", "")
    try:
        idempotency_key = str(uuid.UUID(raw_idempotency_key))
    except (AttributeError, ValueError):
        return jsonify(error="Please retry with a valid order request."), 400

    user = current_user()
    database = get_db()
    created_at = _utc_timestamp()
    reference = f"SH-{uuid.uuid4().hex.upper()}"

    try:
        database.execute("BEGIN IMMEDIATE")
        prior_submission = database.execute(
            """
            SELECT orders.reference, orders.total, orders.created_at, order_submissions.payload_hash
            FROM order_submissions
            JOIN orders ON orders.id = order_submissions.order_id
            WHERE order_submissions.user_id = ? AND order_submissions.idempotency_key = ?
            """,
            (user["id"], idempotency_key),
        ).fetchone()
        if prior_submission is not None:
            if prior_submission["payload_hash"] != request_fingerprint:
                database.rollback()
                return jsonify(
                    error="This checkout attempt already saved different details. Start a new order attempt to place another order."
                ), 409
            database.commit()
            return jsonify(
                reference=prior_submission["reference"],
                total=prior_submission["total"],
                created_at=prior_submission["created_at"],
            ), 201

        cursor = database.execute(
            """
            INSERT INTO orders (reference, user_id, delivery_name, delivery_address, delivery_phone, total, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                reference,
                user["id"],
                delivery["name"],
                delivery["address"],
                delivery["phone"],
                total,
                created_at,
            ),
        )
        order_id = cursor.lastrowid
        database.executemany(
            """
            INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity)
            VALUES (?, ?, ?, ?, ?)
            """,
            [
                (order_id, item["id"], item["name"], item["price"], item["quantity"])
                for item in items
            ],
        )
        database.execute(
            """
            INSERT INTO order_submissions (user_id, idempotency_key, order_id, payload_hash, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (user["id"], idempotency_key, order_id, request_fingerprint, created_at),
        )
        database.commit()
    except Exception:
        database.rollback()
        raise

    return jsonify(reference=reference, total=total, created_at=created_at), 201


@orders_bp.get("")
@login_required
def list_orders():
    user = current_user()
    database = get_db()
    rows = database.execute(
        """
        SELECT id, reference, total, created_at
        FROM orders
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        """,
        (user["id"],),
    ).fetchall()

    orders = []
    for order in rows:
        item_rows = database.execute(
            """
            SELECT product_id, product_name, unit_price, quantity
            FROM order_items
            WHERE order_id = ?
            ORDER BY id
            """,
            (order["id"],),
        ).fetchall()
        orders.append(
            {
                "reference": order["reference"],
                "created_at": order["created_at"],
                "total": order["total"],
                "items": [
                    {
                        "product_id": item["product_id"],
                        "name": item["product_name"],
                        "unit_price": item["unit_price"],
                        "quantity": item["quantity"],
                    }
                    for item in item_rows
                ],
            }
        )

    return jsonify(orders=orders)
