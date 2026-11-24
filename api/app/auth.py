"""Who is calling?

Supabase mode: verify the user's access token against the project's JWKS
(asymmetric keys only), checking signature, `aud=authenticated`, expiry and
issuer. The verified token is forwarded to PostgREST so RLS sees the same user.

Demo mode (no SUPABASE_URL): the dev-only `X-Demo-User: admin|member` header
picks one of the seeded users. The header is ignored entirely in Supabase mode.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx
import jwt
from anyio import to_thread
from fastapi import Request
from jwt import PyJWKClient
from jwt.exceptions import PyJWKClientConnectionError, PyJWKClientError

from .config import Settings
from .errors import ApiError, unauthorized

ALLOWED_ALGORITHMS = ["ES256", "RS256", "EdDSA"]

DEMO_USERS = {
    "admin": "00000000-0000-4000-8000-00000000a001",
    "member": "00000000-0000-4000-8000-00000000b001",
}


@dataclass(frozen=True)
class Principal:
    id: str
    token: str | None = None  # the raw, verified JWT (Supabase mode only)
    email: str | None = None


class HttpxJWKClient(PyJWKClient):
    """PyJWKClient that fetches over httpx (testable with respx) and caches keys."""

    def fetch_data(self) -> Any:
        try:
            resp = httpx.get(self.uri, timeout=self.timeout, follow_redirects=False)
            resp.raise_for_status()
            data = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise PyJWKClientConnectionError(f"Could not fetch JWKS: {exc}") from exc
        if not isinstance(data, dict) or not isinstance(data.get("keys"), list):
            raise PyJWKClientError("JWKS endpoint returned an unexpected payload")
        if self.jwk_set_cache is not None:
            self.jwk_set_cache.put(data)
        return data


class TokenVerifier:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.jwks = HttpxJWKClient(
            settings.jwks_url,
            cache_keys=True,
            cache_jwk_set=True,
            lifespan=600,
            timeout=5,
            # Unknown `kid`s trigger at most one JWKS refetch per 30 s, so junk tokens
            # can't make us hammer the auth server.
            cooldown_duration=30,
        )

    def verify(self, token: str) -> dict[str, Any]:
        try:
            header = jwt.get_unverified_header(token)
        except jwt.PyJWTError as exc:
            raise unauthorized("Your session token is malformed. Sign in again.") from exc
        if header.get("alg") not in ALLOWED_ALGORITHMS:
            # Refuses HS256 (shared-secret) and "none" outright.
            raise unauthorized("Unsupported token algorithm.")
        try:
            signing_key = self.jwks.get_signing_key_from_jwt(token)
        except PyJWKClientConnectionError as exc:
            raise ApiError(503, "auth_unavailable", "Couldn't reach the auth server.") from exc
        except (PyJWKClientError, jwt.PyJWTError) as exc:
            raise unauthorized("Your session token wasn't issued by this project.") from exc
        try:
            claims = jwt.decode(
                token,
                signing_key.key,
                algorithms=[signing_key.algorithm_name]
                if signing_key.algorithm_name in ALLOWED_ALGORITHMS
                else ALLOWED_ALGORITHMS,
                audience="authenticated",
                issuer=self.settings.jwt_issuer,
                options={"require": ["exp", "sub", "aud", "iss"]},
                leeway=10,
            )
        except jwt.ExpiredSignatureError as exc:
            raise unauthorized("Your session expired. Sign in again.") from exc
        except jwt.PyJWTError as exc:
            raise unauthorized("Your session token is invalid. Sign in again.") from exc
        if claims.get("role") not in (None, "authenticated") or claims.get("is_anonymous"):
            raise unauthorized("Your session token is invalid. Sign in again.")
        return claims


async def resolve_principal(request: Request) -> Principal | None:
    settings: Settings = request.app.state.settings
    auth = request.headers.get("authorization", "")

    if settings.demo_mode:
        who = request.headers.get("x-demo-user", "").strip().lower()
        if who in DEMO_USERS:
            return Principal(id=DEMO_USERS[who])
        if who and who not in ("anon", "anonymous", ""):
            raise unauthorized("X-Demo-User must be 'admin' or 'member'.")
        return None

    if not auth:
        return None
    scheme, _, token = auth.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise unauthorized("Use an 'Authorization: Bearer <token>' header.")
    verifier: TokenVerifier = request.app.state.verifier
    claims = await to_thread.run_sync(verifier.verify, token.strip())
    return Principal(id=str(claims["sub"]), token=token.strip(), email=claims.get("email"))
