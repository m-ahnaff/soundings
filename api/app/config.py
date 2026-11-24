"""Runtime configuration, read once from the environment.

Demo mode is *derived*, never configured: it is on only when SUPABASE_URL is
empty. There is deliberately no flag that can switch it on next to a real
Supabase project.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache


def _split_csv(value: str) -> list[str]:
    return [part.strip().rstrip("/") for part in value.split(",") if part.strip()]


@dataclass(frozen=True)
class Settings:
    supabase_url: str = ""
    supabase_publishable_key: str = ""
    cors_origins: list[str] = field(default_factory=list)
    # Per-user write budget for create endpoints (posts + comments).
    write_limit_per_minute: int = 12

    @property
    def demo_mode(self) -> bool:
        return not self.supabase_url

    @property
    def jwks_url(self) -> str:
        return f"{self.supabase_url}/auth/v1/.well-known/jwks.json"

    @property
    def jwt_issuer(self) -> str:
        return f"{self.supabase_url}/auth/v1"

    @property
    def rest_url(self) -> str:
        return f"{self.supabase_url}/rest/v1"

    @classmethod
    def from_env(cls) -> Settings:
        url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
        key = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "").strip()
        origins = _split_csv(os.environ.get("CORS_ORIGINS", "http://localhost:3100"))
        if url and not key:
            raise RuntimeError("SUPABASE_URL is set but SUPABASE_PUBLISHABLE_KEY is missing.")
        if url and not url.startswith("https://") and not url.startswith("http://127.0.0.1"):
            raise RuntimeError("SUPABASE_URL must be an https:// URL.")
        if (
            not url
            and os.environ.get("VERCEL_ENV") == "production"
            and os.environ.get("ALLOW_DEMO_IN_PRODUCTION") != "1"
        ):
            # Fail closed: a production deploy that forgot SUPABASE_URL must not
            # silently become a writable demo where anyone can act as admin.
            raise RuntimeError(
                "SUPABASE_URL is not set in production. Set it, or set "
                "ALLOW_DEMO_IN_PRODUCTION=1 to deliberately run the public demo."
            )
        limit = int(os.environ.get("WRITE_LIMIT_PER_MINUTE", "12"))
        return cls(
            supabase_url=url,
            supabase_publishable_key=key,
            cors_origins=origins,
            write_limit_per_minute=limit,
        )


@lru_cache
def get_settings() -> Settings:
    return Settings.from_env()
