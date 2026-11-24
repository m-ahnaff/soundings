"""Vercel entrypoint: exposes the ASGI `app`. Locally: `uv run uvicorn index:app --port 8800`."""

from app.main import create_app

app = create_app()
