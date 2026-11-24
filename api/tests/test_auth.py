"""JWT verification against a mocked JWKS endpoint (ES256 keys generated per run)."""

from __future__ import annotations

import jwt
import respx

from .conftest import PUBLISHABLE_KEY, SUPABASE_URL, USER_ID, Keys, bearer

PROFILES = f"{SUPABASE_URL}/rest/v1/profiles"


def _profile_route(router: respx.MockRouter) -> respx.Route:
    return router.get(PROFILES).respond(
        json=[{"id": USER_ID, "display_name": "Sam", "role": "member"}]
    )


async def test_valid_token_is_accepted_and_forwarded(sb, mock_supabase, keys: Keys):
    route = _profile_route(mock_supabase)
    token = keys.token()
    resp = await sb.get("/v1/me", headers=bearer(token))
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"id": USER_ID, "display_name": "Sam", "role": "member"}
    sent = route.calls.last.request
    assert sent.headers["authorization"] == f"Bearer {token}"
    assert sent.headers["apikey"] == PUBLISHABLE_KEY


async def test_expired_token_is_rejected(sb, mock_supabase, keys: Keys):
    _profile_route(mock_supabase)
    resp = await sb.get("/v1/me", headers=bearer(keys.token(exp_in=-120)))
    assert resp.status_code == 401
    body = resp.json()["error"]
    assert body["code"] == "unauthorized"
    assert "expired" in body["message"].lower()


async def test_wrong_audience_is_rejected(sb, mock_supabase, keys: Keys):
    _profile_route(mock_supabase)
    resp = await sb.get("/v1/me", headers=bearer(keys.token(aud="anon")))
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "unauthorized"


async def test_wrong_issuer_is_rejected(sb, mock_supabase, keys: Keys):
    _profile_route(mock_supabase)
    token = keys.token(iss="https://evil.supabase.co/auth/v1")
    resp = await sb.get("/v1/me", headers=bearer(token))
    assert resp.status_code == 401


async def test_token_signed_by_unknown_key_is_rejected(sb, mock_supabase, keys: Keys):
    _profile_route(mock_supabase)
    resp = await sb.get("/v1/me", headers=bearer(keys.token(key=keys.other)))
    assert resp.status_code == 401


async def test_unknown_kid_is_rejected(sb, mock_supabase, keys: Keys):
    _profile_route(mock_supabase)
    resp = await sb.get("/v1/me", headers=bearer(keys.token(kid="rotated-away")))
    assert resp.status_code == 401


async def test_symmetric_and_none_algorithms_are_refused(sb, mock_supabase):
    _profile_route(mock_supabase)
    hs = jwt.encode(
        {
            "sub": USER_ID,
            "aud": "authenticated",
            "exp": 9999999999,
            "iss": f"{SUPABASE_URL}/auth/v1",
        },
        "a-shared-secret-that-is-long-enough-for-hs256",
        algorithm="HS256",
    )
    resp = await sb.get("/v1/me", headers=bearer(hs))
    assert resp.status_code == 401
    unsigned = jwt.encode({"sub": USER_ID}, None, algorithm="none")
    resp = await sb.get("/v1/me", headers=bearer(unsigned))
    assert resp.status_code == 401


async def test_malformed_authorization_header(sb, mock_supabase):
    resp = await sb.get("/v1/me", headers={"Authorization": "Token abc"})
    assert resp.status_code == 401
    resp = await sb.get("/v1/me", headers=bearer("not-a-jwt"))
    assert resp.status_code == 401


async def test_jwks_is_cached_between_requests(sb, mock_supabase, keys: Keys):
    _profile_route(mock_supabase)
    for _ in range(3):
        resp = await sb.get("/v1/me", headers=bearer(keys.token()))
        assert resp.status_code == 200
    assert mock_supabase["jwks"].call_count == 1


async def test_jwks_outage_returns_503(sb, mock_supabase, keys: Keys):
    mock_supabase["jwks"].respond(500)
    resp = await sb.get("/v1/me", headers=bearer(keys.token()))
    assert resp.status_code == 503
    assert resp.json()["error"]["code"] == "auth_unavailable"


async def test_missing_token_on_protected_route(sb):
    resp = await sb.get("/v1/me")
    assert resp.status_code == 401
    assert resp.headers["www-authenticate"] == "Bearer"


async def test_anonymous_supabase_user_is_rejected(sb, mock_supabase, keys: Keys):
    _profile_route(mock_supabase)
    resp = await sb.get("/v1/me", headers=bearer(keys.token(extra={"is_anonymous": True})))
    assert resp.status_code == 401
