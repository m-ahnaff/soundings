"""Demo mode is derived from SUPABASE_URL being empty and can't leak into a real deployment."""

from __future__ import annotations

import pytest

from app.config import Settings
from app.main import create_app
from app.repo.memory import MemoryRepo
from app.repo.postgrest import PostgrestRepo

from .conftest import ADMIN, MEMBER, PUBLISHABLE_KEY, SUPABASE_URL


def test_settings_from_env_without_url_is_demo(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_PUBLISHABLE_KEY", raising=False)
    assert Settings.from_env().demo_mode is True


def test_settings_from_env_with_url_is_not_demo(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", SUPABASE_URL + "/")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE_KEY)
    monkeypatch.setenv("CORS_ORIGINS", "https://board.example.com, http://localhost:3100")
    s = Settings.from_env()
    assert s.demo_mode is False
    assert s.supabase_url == SUPABASE_URL
    assert s.cors_origins == ["https://board.example.com", "http://localhost:3100"]


def test_url_without_key_refuses_to_start(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", SUPABASE_URL)
    monkeypatch.delenv("SUPABASE_PUBLISHABLE_KEY", raising=False)
    with pytest.raises(RuntimeError):
        Settings.from_env()


def test_configured_app_uses_postgrest_not_memory(sb_settings):
    app = create_app(sb_settings)
    assert isinstance(app.state.repo, PostgrestRepo)
    assert not isinstance(app.state.repo, MemoryRepo)


async def test_demo_header_is_ignored_when_supabase_configured(sb):
    for headers in (ADMIN, MEMBER):
        assert (await sb.get("/v1/me", headers=headers)).status_code == 401
        assert (await sb.get("/v1/admin/stats", headers=headers)).status_code == 401
        resp = await sb.post(
            "/v1/posts", json={"title": "Sneaky", "category": "bug"}, headers=headers
        )
        assert resp.status_code == 401


async def test_health_reports_mode(demo, sb, mock_supabase):
    assert (await demo.get("/healthz")).json() == {"ok": True, "mode": "demo"}
    assert (await sb.get("/healthz")).json() == {"ok": True, "mode": "supabase"}


async def test_cors_only_allows_configured_origins(sb):
    ok = await sb.options(
        "/v1/posts",
        headers={
            "Origin": "http://localhost:3100",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:3100"
    bad = await sb.options(
        "/v1/posts",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"},
    )
    assert "access-control-allow-origin" not in bad.headers
    # The demo header is not even an allowed request header outside demo mode.
    demo_hdr = await sb.options(
        "/v1/posts",
        headers={
            "Origin": "http://localhost:3100",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "x-demo-user",
        },
    )
    assert demo_hdr.status_code == 400


async def test_unknown_demo_user_is_rejected(demo):
    resp = await demo.get("/v1/me", headers={"X-Demo-User": "root"})
    assert resp.status_code == 401


def test_demo_refuses_to_start_in_vercel_production(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.setenv("VERCEL_ENV", "production")
    monkeypatch.delenv("ALLOW_DEMO_IN_PRODUCTION", raising=False)
    with pytest.raises(RuntimeError):
        Settings.from_env()
    monkeypatch.setenv("ALLOW_DEMO_IN_PRODUCTION", "1")
    assert Settings.from_env().demo_mode is True
