"""Supabase PostgREST store.

Every request carries the publishable key as `apikey` and, when a user is
signed in, *their own* JWT as the bearer token. The database therefore applies
Row Level Security as that user; this service holds no secret key.
"""

from __future__ import annotations

from typing import Any

import httpx

from ..auth import Principal
from ..config import Settings
from ..errors import ApiError, forbidden, not_found
from ..models import (
    ROADMAP_STATUSES,
    Author,
    Category,
    Comment,
    Event,
    Me,
    Post,
    PostRef,
    Roadmap,
    RoadmapItem,
    SettableStatus,
    Sort,
    Stats,
    VoteResult,
)

AUTHOR = "id,display_name,role"
POST_SELECT = f"*,author:profiles!posts_author_id_fkey({AUTHOR})"
COMMENT_SELECT = f"id,post_id,body,created_at,author:profiles!comments_author_id_fkey({AUTHOR})"
EVENT_SELECT = (
    "id,post_id,kind,from_status,to_status,created_at,"
    f"actor:profiles!post_events_actor_id_fkey({AUTHOR}),"
    "related:posts!post_events_related_post_id_fkey(id,number,title)"
)
ITEM_SELECT = "id,number,title,category,status,vote_count,comment_count"

# Messages raised by functions in schema.sql -> API errors.
_DB_MESSAGES = {
    "not_admin": (403, "forbidden", "Only the team can do that."),
    "same_post": (400, "bad_request", "A post can't be merged into itself."),
    "already_merged": (409, "already_merged", "That post has already been merged."),
    "target_merged": (409, "target_merged", "Pick the post it was merged into instead."),
    "post_closed": (409, "post_closed", "This post was merged. Use the original instead."),
    "protected_column": (403, "forbidden", "You can't change that field."),
    "use_merge_post": (400, "bad_request", "Use the merge action to merge posts."),
    "has_merges": (
        409,
        "has_merges",
        "Other posts were merged into this one, so only the team can delete it.",
    ),
    "rate_limited": (429, "rate_limited", "You're posting quickly. Try again in a minute."),
}

_RETRYABLE = {"40P01", "40001"}  # deadlock / serialization failure


def _author(row: dict[str, Any] | None) -> Author | None:
    if not row:
        return None
    return Author(
        id=row["id"], display_name=row["display_name"], is_team=row.get("role") == "admin"
    )


def _item(row: dict[str, Any]) -> RoadmapItem:
    return RoadmapItem(**{k: row[k] for k in RoadmapItem.model_fields})


class PostgrestRepo:
    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None) -> None:
        self.settings = settings
        self.client = client or httpx.AsyncClient(
            base_url=settings.rest_url, timeout=httpx.Timeout(8.0, connect=4.0)
        )

    async def aclose(self) -> None:
        await self.client.aclose()

    # ----------------------------------------------------------- transport
    def _headers(self, viewer: Principal | None, prefer: str | None = None) -> dict[str, str]:
        headers = {"apikey": self.settings.supabase_publishable_key, "Accept": "application/json"}
        if viewer and viewer.token:
            headers["Authorization"] = f"Bearer {viewer.token}"
        if prefer:
            headers["Prefer"] = prefer
        return headers

    async def _req(
        self,
        method: str,
        path: str,
        viewer: Principal | None,
        *,
        params: dict[str, str] | None = None,
        json: Any = None,
        prefer: str | None = None,
    ) -> Any:
        for attempt in (1, 2):
            try:
                resp = await self.client.request(
                    method, path, params=params, json=json, headers=self._headers(viewer, prefer)
                )
            except httpx.HTTPError as exc:
                raise ApiError(
                    502, "upstream_unavailable", "The database didn't respond. Try again."
                ) from exc
            if resp.status_code >= 400 and attempt == 1 and self._code(resp) in _RETRYABLE:
                continue  # a concurrent vote/merge won the lock; one retry is enough
            break
        if resp.status_code >= 400:
            raise self._map_error(resp)
        if resp.status_code == 204 or not resp.content:
            return None
        return resp.json()

    @staticmethod
    def _code(resp: httpx.Response) -> str:
        try:
            return str(resp.json().get("code", ""))
        except (ValueError, AttributeError):
            return ""

    @staticmethod
    def _map_error(resp: httpx.Response) -> ApiError:
        try:
            body = resp.json()
        except ValueError:
            body = {}
        code = str(body.get("code", ""))
        message = str(body.get("message", ""))
        if message in _DB_MESSAGES:
            status, api_code, text = _DB_MESSAGES[message]
            return ApiError(status, api_code, text)
        if resp.status_code == 401 or code.startswith("PGRST30"):
            return ApiError(401, "unauthorized", "Your session expired. Sign in again.")
        if code == "42501" or resp.status_code == 403:
            return forbidden()
        if code == "P0002" or resp.status_code == 404:
            return not_found()
        if code in _RETRYABLE:
            return ApiError(409, "busy", "That post was busy. Try again.")
        if code == "23503":
            return not_found()
        if code == "23505":
            return ApiError(409, "conflict", "That already exists.")
        if code in ("23514", "22001", "23502"):
            return ApiError(422, "validation_error", "Some fields didn't pass validation.")
        return ApiError(502, "upstream_error", "The database rejected the request.")

    # ----------------------------------------------------------- mapping
    async def _ref(self, viewer: Principal | None, post_id: str | None) -> PostRef | None:
        if not post_id:
            return None
        rows = await self._req(
            "GET", "/posts", viewer, params={"id": f"eq.{post_id}", "select": "id,number,title"}
        )
        return PostRef(**rows[0]) if rows else None

    def _post(self, row: dict[str, Any], has_voted: bool, merged: PostRef | None) -> Post:
        author = row.get("author")
        if author is None and row.get("author_id") and row.get("author_name") is not None:
            author = {
                "id": row["author_id"],
                "display_name": row["author_name"],
                "role": row.get("author_role"),
            }
        return Post(
            id=row["id"],
            number=row["number"],
            title=row["title"],
            body=row.get("body") or "",
            category=row["category"],
            status=row["status"],
            pinned=row["pinned"],
            vote_count=row["vote_count"],
            comment_count=row["comment_count"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            author=_author(author),
            merged_into=merged,
            has_voted=has_voted,
        )

    async def _has_voted(self, viewer: Principal | None, post_id: str) -> bool:
        if not viewer:
            return False
        rows = await self._req(
            "GET",
            "/votes",
            viewer,
            params={"post_id": f"eq.{post_id}", "user_id": f"eq.{viewer.id}", "select": "post_id"},
        )
        return bool(rows)

    # ----------------------------------------------------------- reads
    async def get_me(self, viewer: Principal) -> Me | None:
        rows = await self._req(
            "GET", "/profiles", viewer, params={"id": f"eq.{viewer.id}", "select": AUTHOR}
        )
        return Me(**rows[0]) if rows else None

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
    ) -> tuple[list[Post], int]:
        rows = await self._req(
            "POST",
            "/rpc/list_posts",
            viewer,
            json={
                "p_status": status,
                "p_category": category,
                "p_q": q or None,
                "p_sort": sort,
                "p_limit": limit,
                "p_offset": offset,
                "p_author": author_id,
            },
        )
        rows = rows or []
        total = int(rows[0]["total_count"]) if rows else 0
        if not rows and offset > 0:
            # Past the end: ask for the first row only to learn the total.
            probe = await self._req(
                "POST",
                "/rpc/list_posts",
                viewer,
                json={
                    "p_status": status,
                    "p_category": category,
                    "p_q": q or None,
                    "p_sort": sort,
                    "p_limit": 1,
                    "p_offset": 0,
                    "p_author": author_id,
                },
            )
            total = int(probe[0]["total_count"]) if probe else 0
        posts = [self._post(r, bool(r.get("has_voted")), None) for r in rows]
        return posts, total

    async def get_post(self, viewer: Principal | None, post_id: str) -> Post | None:
        rows = await self._req(
            "GET", "/posts", viewer, params={"id": f"eq.{post_id}", "select": POST_SELECT}
        )
        if not rows:
            return None
        row = rows[0]
        merged = await self._ref(viewer, row.get("merged_into"))
        return self._post(row, await self._has_voted(viewer, post_id), merged)

    async def list_activity(self, viewer: Principal | None, post_id: str) -> list[Comment | Event]:
        comments = await self._req(
            "GET",
            "/comments",
            viewer,
            params={
                "post_id": f"eq.{post_id}",
                "select": COMMENT_SELECT,
                "order": "created_at.asc",
            },
        )
        events = await self._req(
            "GET",
            "/post_events",
            viewer,
            params={"post_id": f"eq.{post_id}", "select": EVENT_SELECT, "order": "created_at.asc"},
        )
        items: list[Comment | Event] = [
            Comment(
                id=c["id"],
                post_id=c["post_id"],
                body=c["body"],
                created_at=c["created_at"],
                author=_author(c.get("author")),
            )
            for c in comments or []
        ]
        items += [
            Event(
                id=e["id"],
                post_id=e["post_id"],
                kind=e["kind"],
                from_status=e.get("from_status"),
                to_status=e.get("to_status"),
                related=PostRef(**e["related"]) if e.get("related") else None,
                actor=_author(e.get("actor")),
                created_at=e["created_at"],
            )
            for e in events or []
        ]
        items.sort(key=lambda i: i.created_at)
        return items

    async def get_comment(self, viewer: Principal | None, comment_id: str) -> Comment | None:
        rows = await self._req(
            "GET", "/comments", viewer, params={"id": f"eq.{comment_id}", "select": COMMENT_SELECT}
        )
        if not rows:
            return None
        c = rows[0]
        return Comment(
            id=c["id"],
            post_id=c["post_id"],
            body=c["body"],
            created_at=c["created_at"],
            author=_author(c.get("author")),
        )

    async def roadmap(self, viewer: Principal | None) -> Roadmap:
        cols: dict[str, list[RoadmapItem]] = {}
        for status in ROADMAP_STATUSES:  # one query per column so no column starves another
            rows = await self._req(
                "GET",
                "/posts",
                viewer,
                params={
                    "status": f"eq.{status}",
                    "select": ITEM_SELECT,
                    "order": "vote_count.desc,number.asc",
                    "limit": "50",
                },
            )
            cols[status] = [_item(r) for r in rows or []]
        return Roadmap(**cols)

    async def stats(self, viewer: Principal) -> Stats:
        data = await self._req("POST", "/rpc/admin_stats", viewer, json={})
        return Stats.model_validate(data)

    # ----------------------------------------------------------- writes
    async def create_post(
        self, viewer: Principal, *, title: str, body: str, category: Category
    ) -> Post:
        rows = await self._req(
            "POST",
            "/posts",
            viewer,
            params={"select": "id"},
            json={"title": title, "body": body, "category": category},
            prefer="return=representation",
        )
        post = await self.get_post(viewer, rows[0]["id"])
        if post is None:  # pragma: no cover - would mean RLS hides a row we just wrote
            raise ApiError(502, "upstream_error", "The post was saved but couldn't be read back.")
        return post

    async def update_post(self, viewer: Principal, post_id: str, fields: dict) -> Post | None:
        payload = {k: v for k, v in fields.items() if v is not None}
        rows = await self._req(
            "PATCH",
            "/posts",
            viewer,
            params={"id": f"eq.{post_id}", "select": "id"},
            json=payload,
            prefer="return=representation",
        )
        if not rows:
            raise forbidden("Only the author can edit a post, and only while it's under review.")
        return await self.get_post(viewer, post_id)

    async def delete_post(self, viewer: Principal, post_id: str) -> bool:
        rows = await self._req(
            "DELETE",
            "/posts",
            viewer,
            params={"id": f"eq.{post_id}", "select": "id"},
            prefer="return=representation",
        )
        return bool(rows)

    async def set_vote(self, viewer: Principal, post_id: str, on: bool) -> VoteResult:
        if on:
            await self._req(
                "POST",
                "/votes",
                viewer,
                params={"on_conflict": "post_id,user_id"},
                json={"post_id": post_id, "user_id": viewer.id},
                prefer="resolution=ignore-duplicates,return=minimal",
            )
        else:
            await self._req(
                "DELETE",
                "/votes",
                viewer,
                params={"post_id": f"eq.{post_id}", "user_id": f"eq.{viewer.id}"},
                prefer="return=minimal",
            )
        rows = await self._req(
            "GET", "/posts", viewer, params={"id": f"eq.{post_id}", "select": "vote_count"}
        )
        if not rows:
            raise not_found()
        return VoteResult(post_id=post_id, voted=on, vote_count=rows[0]["vote_count"])

    async def add_comment(self, viewer: Principal, post_id: str, body: str) -> Comment:
        rows = await self._req(
            "POST",
            "/comments",
            viewer,
            params={"select": COMMENT_SELECT},
            json={"post_id": post_id, "body": body},
            prefer="return=representation",
        )
        c = rows[0]
        return Comment(
            id=c["id"],
            post_id=c["post_id"],
            body=c["body"],
            created_at=c["created_at"],
            author=_author(c.get("author")),
        )

    async def delete_comment(self, viewer: Principal, comment_id: str) -> bool:
        rows = await self._req(
            "DELETE",
            "/comments",
            viewer,
            params={"id": f"eq.{comment_id}", "select": "id"},
            prefer="return=representation",
        )
        return bool(rows)

    async def admin_update(
        self,
        viewer: Principal,
        post_id: str,
        *,
        status: SettableStatus | None,
        pinned: bool | None,
    ) -> Post | None:
        payload: dict[str, Any] = {}
        if status is not None:
            payload["status"] = status
        if pinned is not None:
            payload["pinned"] = pinned
        rows = await self._req(
            "PATCH",
            "/posts",
            viewer,
            params={"id": f"eq.{post_id}", "select": "id"},
            json=payload,
            prefer="return=representation",
        )
        if not rows:
            return None
        return await self.get_post(viewer, post_id)

    async def merge(self, viewer: Principal, source_id: str, target_id: str) -> Post:
        await self._req(
            "POST",
            "/rpc/merge_post",
            viewer,
            json={"p_source": source_id, "p_target": target_id},
        )
        post = await self.get_post(viewer, target_id)
        if post is None:
            raise not_found()
        return post
