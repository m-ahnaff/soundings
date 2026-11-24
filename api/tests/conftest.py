from __future__ import annotations

import json
import time
from collections.abc import AsyncIterator
from typing import Any

import httpx
import jwt
import pytest
import respx
from cryptography.hazmat.primitives.asymmetric import ec
from jwt.algorithms import ECAlgorithm

from app.config import Settings
from app.main import create_app
from app.repo.memory import MemoryRepo

SUPABASE_URL = "https://abcd1234.supabase.co"
PUBLISHABLE_KEY = "sb_publishable_test_key"
USER_ID = "11111111-1111-4111-8111-111111111111"
ADMIN_ID = "22222222-2222-4222-8222-222222222222"
KID = "test-key-1"


class Keys:
    def __init__(self) -> None:
        self.private = ec.generate_private_key(ec.SECP256R1())
        self.other = ec.generate_private_key(ec.SECP256R1())
        jwk = json.loads(ECAlgorithm.to_jwk(self.private.public_key()))
        jwk.update({"kid": KID, "alg": "ES256", "use": "sig"})
        self.jwks = {"keys": [jwk]}

    def token(
        self,
        sub: str = USER_ID,
        *,
        aud: str = "authenticated",
        iss: str = f"{SUPABASE_URL}/auth/v1",
        exp_in: int = 3600,
        key: Any = None,
        kid: str = KID,
        extra: dict[str, Any] | None = None,
    ) -> str:
        now = int(time.time())
        claims = {
            "sub": sub,
            "aud": aud,
            "iss": iss,
            "iat": now,
            "exp": now + exp_in,
            "role": "authenticated",
            "email": "sam@example.com",
            **(extra or {}),
        }
        return jwt.encode(claims, key or self.private, algorithm="ES256", headers={"kid": kid})


@pytest.fixture(scope="session")
def keys() -> Keys:
    return Keys()


def _client(app) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver")


@pytest.fixture
def demo_settings() -> Settings:
    return Settings(cors_origins=["http://localhost:3100"], write_limit_per_minute=0)


@pytest.fixture
def memory_repo() -> MemoryRepo:
    return MemoryRepo.seeded()


@pytest.fixture
async def demo(
    demo_settings: Settings, memory_repo: MemoryRepo
) -> AsyncIterator[httpx.AsyncClient]:
    app = create_app(demo_settings, memory_repo)
    async with _client(app) as client:
        yield client


@pytest.fixture
def sb_settings() -> Settings:
    return Settings(
        supabase_url=SUPABASE_URL,
        supabase_publishable_key=PUBLISHABLE_KEY,
        cors_origins=["http://localhost:3100"],
        write_limit_per_minute=0,
    )


@pytest.fixture
def mock_supabase(keys: Keys) -> respx.MockRouter:
    with respx.mock(assert_all_called=False) as router:
        router.route(host="testserver").pass_through()
        router.get(f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json", name="jwks").respond(
            json=keys.jwks
        )
        yield router


@pytest.fixture
async def sb(
    sb_settings: Settings, mock_supabase: respx.MockRouter
) -> AsyncIterator[httpx.AsyncClient]:
    app = create_app(sb_settings)
    async with _client(app) as client:
        yield client
    await app.state.repo.aclose()


MEMBER = {"X-Demo-User": "member"}
ADMIN = {"X-Demo-User": "admin"}


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
