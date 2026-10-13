from __future__ import annotations

from pathlib import Path

from flask import Flask, abort, jsonify, send_from_directory

from .auth import auth_bp
from .db import init_app as init_database
from .orders import orders_bp


PROJECT_ROOT = Path(__file__).resolve().parent.parent
STATIC_EXTENSIONS = {".html", ".css", ".js", ".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico"}


def create_app(config: dict | None = None) -> Flask:
    app = Flask(__name__)
    app.config.from_mapping(
        DATABASE=str(Path(__file__).resolve().with_name("shophub.sqlite3")),
        COOKIE_SECURE=False,
    )
    if config:
        app.config.update(config)

    init_database(app)
    app.register_blueprint(auth_bp)
    app.register_blueprint(orders_bp)

    @app.get("/api/health")
    def health():
        return jsonify(success=True, message="ShopHub Backend Running")

    @app.get("/")
    def index():
        return send_from_directory(PROJECT_ROOT, "index.html")

    @app.get("/<path:asset>")
    def serve_asset(asset: str):
        normalized = asset.replace("\\", "/")
        parts = [part for part in normalized.split("/") if part]
        if not parts or any(part.startswith(".") or part.lower() == "server" for part in parts):
            abort(404)

        if Path(parts[-1]).suffix.lower() not in STATIC_EXTENSIONS:
            abort(404)

        return send_from_directory(PROJECT_ROOT, "/".join(parts))

    return app


if __name__ == "__main__":
    create_app().run(host="127.0.0.1", port=5000, debug=False)
