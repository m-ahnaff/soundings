"""The storage contract shared by the in-memory demo store and the PostgREST store.

Routes do the friendly permission checks (to return 403/409 with a clear
message); the PostgREST store additionally relies on RLS in the database, so a
bug in the route layer can't widen access.
"""

from __future__ import annotations

from typing import Protocol

from ..auth import Principal
from ..models import (
    Category,
    Comment,
    Event,
    Me,
    Post,
    Roadmap,
    SettableStatus,
    Sort,
    Stats,
    VoteResult,
)


class Repo(Protocol):
    async def get_me(self, viewer: Principal) -> Me | None: ...

    async def list_posts(
        self,
        viewer: Principal | None,
        *,
        status: str | None,
        category: Category | None,
        q: str | None,
        sort: Sort,
        limit: int,
        offset: int,
        author_id: str | None = None,
    ) -> tuple[list[Post], int]: ...

    async def get_post(self, viewer: Principal | None, post_id: str) -> Post | None: ...

    async def create_post(
        self, viewer: Principal, *, title: str, body: str, category: Category
    ) -> Post: ...

    async def update_post(self, viewer: Principal, post_id: str, fields: dict) -> Post | None: ...

    async def delete_post(self, viewer: Principal, post_id: str) -> bool: ...

    async def set_vote(self, viewer: Principal, post_id: str, on: bool) -> VoteResult: ...

    async def list_activity(
        self, viewer: Principal | None, post_id: str
    ) -> list[Comment | Event]: ...

    async def add_comment(self, viewer: Principal, post_id: str, body: str) -> Comment: ...

    async def get_comment(self, viewer: Principal | None, comment_id: str) -> Comment | None: ...

    async def delete_comment(self, viewer: Principal, comment_id: str) -> bool: ...

    async def admin_update(
        self,
        viewer: Principal,
        post_id: str,
        *,
        status: SettableStatus | None,
        pinned: bool | None,
    ) -> Post | None: ...

    async def merge(self, viewer: Principal, source_id: str, target_id: str) -> Post: ...

    async def roadmap(self, viewer: Principal | None) -> Roadmap: ...

    async def stats(self, viewer: Principal) -> Stats: ...

    async def aclose(self) -> None: ...
