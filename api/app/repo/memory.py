"""In-memory store for local demo mode. Mirrors the database rules in schema.sql."""

from __future__ import annotations

import asyncio
import random
import re
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from ..auth import Principal
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
    WeekCount,
)
from . import seed

CLOSED_FOR_VOTING = ("merged",)


def _now() -> datetime:
    return datetime.now(UTC)


@dataclass
class _User:
    id: str
    display_name: str
    role: str = "member"


@dataclass
class _Post:
    id: str
    number: int
    title: str
    body: str
    category: str
    status: str
    author_id: str | None
    created_at: datetime
    updated_at: datetime
    pinned: bool = False
    merged_into: str | None = None
    vote_count: int = 0
    comment_count: int = 0


@dataclass
class _Comment:
    id: str
    post_id: str
    author_id: str | None
    body: str
    created_at: datetime


@dataclass
class _Event:
    id: str
    post_id: str
    kind: str
    actor_id: str | None
    created_at: datetime
    from_status: str | None = None
    to_status: str | None = None
    related_id: str | None = None


@dataclass
class MemoryRepo:
    users: dict[str, _User] = field(default_factory=dict)
    posts: dict[str, _Post] = field(default_factory=dict)
    votes: dict[tuple[str, str], datetime] = field(default_factory=dict)
    comments: dict[str, _Comment] = field(default_factory=dict)
    events: list[_Event] = field(default_factory=list)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    _next_number: int = 101

    # ---------------------------------------------------------------- seeding
    @classmethod
    def seeded(cls, now: datetime | None = None) -> MemoryRepo:
        now = now or _now()
        repo = cls()
        rng = random.Random(1729)
        for user_id, (name, role) in seed.NAMED_USERS.items():
            repo.users[user_id] = _User(user_id, name, role)
        community = [f"00000000-0000-4000-8000-0000000d{i:04d}" for i in range(80)]
        for i, cid in enumerate(community):
            repo.users[cid] = _User(cid, f"Larder cook {i + 1}")

        keyed: dict[str, _Post] = {}
        for sp in sorted(seed.POSTS, key=lambda p: -p.age_days):
            created = now - timedelta(days=sp.age_days, hours=rng.randint(0, 9))
            post = _Post(
                id=str(uuid.UUID(int=rng.getrandbits(128), version=4)),
                number=repo._take_number(),
                title=sp.title,
                body=sp.body,
                category=sp.category,
                status="under_review",
                author_id=seed.uid(sp.author),
                created_at=created,
                updated_at=created,
                pinned=sp.pinned,
            )
            repo.posts[post.id] = post
            keyed[sp.key] = post
            # Authors vote for their own post, like the database trigger does.
            pool = [u for u in [seed.MEMBER_ID, *community] if u != post.author_id]
            voters = [post.author_id, *rng.sample(pool, max(sp.popularity - 1, 0))]
            if sp.popularity == 0:
                voters = []
            span = (now - created).total_seconds()
            for voter in voters:
                if voter is None:
                    continue
                at = created + timedelta(seconds=span * (rng.random() ** 1.6))
                repo.votes[(post.id, voter)] = min(at, now)
            post.vote_count = sum(1 for (pid, _) in repo.votes if pid == post.id)

        for sp in seed.POSTS:
            post = keyed[sp.key]
            for after_days, status in seed.STATUS_TRAIL.get(sp.key, []):
                at = post.created_at + timedelta(days=after_days)
                repo.events.append(
                    _Event(
                        _uid(),
                        post.id,
                        "status_changed",
                        seed.ADMIN_ID,
                        at,
                        from_status=post.status,
                        to_status=status,
                    )
                )
                post.status = status
            if sp.merged_into:
                target = keyed[sp.merged_into]
                at = post.created_at + timedelta(days=2)
                post.status = "merged"
                post.merged_into = target.id
                repo.events.append(
                    _Event(_uid(), post.id, "merged_into", seed.ADMIN_ID, at, related_id=target.id)
                )
                repo.events.append(
                    _Event(_uid(), target.id, "merged_from", seed.ADMIN_ID, at, related_id=post.id)
                )

        for key, who, after_days, body in seed.COMMENTS:
            post = keyed[key]
            at = min(post.created_at + timedelta(days=after_days, minutes=rng.randint(0, 600)), now)
            c = _Comment(_uid(), post.id, seed.uid(who), body, at)
            repo.comments[c.id] = c
            post.comment_count += 1
        return repo

    def _take_number(self) -> int:
        n = self._next_number
        self._next_number += 1
        return n

    # ---------------------------------------------------------------- helpers
    def _role(self, user_id: str | None) -> str | None:
        user = self.users.get(user_id or "")
        return user.role if user else None

    def _author(self, user_id: str | None) -> Author | None:
        user = self.users.get(user_id or "")
        if not user:
            return None
        return Author(id=user.id, display_name=user.display_name, is_team=user.role == "admin")

    def _ref(self, post_id: str | None) -> PostRef | None:
        p = self.posts.get(post_id or "")
        return PostRef(id=p.id, number=p.number, title=p.title) if p else None

    def _to_post(self, p: _Post, viewer: Principal | None) -> Post:
        return Post(
            id=p.id,
            number=p.number,
            title=p.title,
            body=p.body,
            category=p.category,  # type: ignore[arg-type]
            status=p.status,  # type: ignore[arg-type]
            pinned=p.pinned,
            vote_count=p.vote_count,
            comment_count=p.comment_count,
            created_at=p.created_at,
            updated_at=p.updated_at,
            author=self._author(p.author_id),
            merged_into=self._ref(p.merged_into),
            has_voted=bool(viewer and (p.id, viewer.id) in self.votes),
        )

    def _item(self, p: _Post) -> RoadmapItem:
        return RoadmapItem(
            id=p.id,
            number=p.number,
            title=p.title,
            category=p.category,  # type: ignore[arg-type]
            status=p.status,  # type: ignore[arg-type]
            vote_count=p.vote_count,
            comment_count=p.comment_count,
        )

    def _recount(self, post_id: str) -> None:
        post = self.posts[post_id]
        post.vote_count = sum(1 for (pid, _) in self.votes if pid == post_id)

    def _ensure_user(self, viewer: Principal) -> None:
        if viewer.id not in self.users:
            self.users[viewer.id] = _User(viewer.id, "New member")

    # ---------------------------------------------------------------- reads
    async def get_me(self, viewer: Principal) -> Me | None:
        user = self.users.get(viewer.id)
        if not user:
            return None
        return Me(id=user.id, display_name=user.display_name, role=user.role)  # type: ignore[arg-type]

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
        rows = [p for p in self.posts.values() if p.status != "merged" or status == "merged"]
        if status == "open":
            rows = [p for p in rows if p.status in ("under_review", "planned", "in_progress")]
        elif status:
            rows = [p for p in rows if p.status == status]
        if category:
            rows = [p for p in rows if p.category == category]
        if author_id:
            rows = [p for p in rows if p.author_id == author_id]
        if q:
            needle = q.lower()
            num = re.fullmatch(r"#?(\d+)", q.strip())
            rows = [
                p
                for p in rows
                if needle in p.title.lower()
                or needle in p.body.lower()
                or (num and p.number == int(num.group(1)))
            ]
        week_ago = _now() - timedelta(days=7)
        recent: dict[str, int] = {}
        if sort == "trending":
            for (pid, _), at in self.votes.items():
                if at >= week_ago:
                    recent[pid] = recent.get(pid, 0) + 1

        def key(p: _Post) -> tuple:
            ts = -p.created_at.timestamp()
            if sort == "new":
                primary: tuple = (ts,)
            elif sort == "updated":
                primary = (-p.updated_at.timestamp(), ts)
            elif sort == "trending":
                primary = (-recent.get(p.id, 0), -p.vote_count, ts)
            else:
                primary = (-p.vote_count, ts)
            boost = 0 if p.pinned and not q and sort != "updated" else 1
            return (boost, *primary, p.number)

        rows.sort(key=key)
        total = len(rows)
        page = rows[offset : offset + limit]
        # Like list_posts() in SQL: rows carry a 300-char body excerpt.
        out = [self._to_post(p, viewer) for p in page]
        return [p.model_copy(update={"body": p.body[:300]}) for p in out], total

    async def get_post(self, viewer: Principal | None, post_id: str) -> Post | None:
        p = self.posts.get(post_id)
        return self._to_post(p, viewer) if p else None

    async def list_activity(self, viewer: Principal | None, post_id: str) -> list[Comment | Event]:
        items: list[Comment | Event] = []
        for c in self.comments.values():
            if c.post_id == post_id:
                items.append(
                    Comment(
                        id=c.id,
                        post_id=c.post_id,
                        body=c.body,
                        created_at=c.created_at,
                        author=self._author(c.author_id),
                    )
                )
        for e in self.events:
            if e.post_id == post_id:
                items.append(
                    Event(
                        id=e.id,
                        post_id=e.post_id,
                        kind=e.kind,  # type: ignore[arg-type]
                        from_status=e.from_status,  # type: ignore[arg-type]
                        to_status=e.to_status,  # type: ignore[arg-type]
                        related=self._ref(e.related_id),
                        actor=self._author(e.actor_id),
                        created_at=e.created_at,
                    )
                )
        items.sort(key=lambda i: i.created_at)
        return items

    async def get_comment(self, viewer: Principal | None, comment_id: str) -> Comment | None:
        c = self.comments.get(comment_id)
        if not c:
            return None
        return Comment(
            id=c.id,
            post_id=c.post_id,
            body=c.body,
            created_at=c.created_at,
            author=self._author(c.author_id),
        )

    async def roadmap(self, viewer: Principal | None) -> Roadmap:
        cols: dict[str, list[RoadmapItem]] = {s: [] for s in ROADMAP_STATUSES}
        for p in sorted(self.posts.values(), key=lambda p: (-p.vote_count, p.number)):
            if p.status in cols and len(cols[p.status]) < 50:
                cols[p.status].append(self._item(p))
        return Roadmap(**cols)

    async def stats(self, viewer: Principal) -> Stats:
        if self._role(viewer.id) != "admin":
            raise forbidden("Only the team can see the dashboard.")
        now = _now()
        week_ago = now - timedelta(days=7)
        live = [p for p in self.posts.values() if p.status != "merged"]
        breakdown: dict[str, int] = {}
        for p in self.posts.values():
            breakdown[p.status] = breakdown.get(p.status, 0) + 1
        this_monday = (now - timedelta(days=now.weekday())).date()
        weeks = [this_monday - timedelta(weeks=i) for i in range(7, -1, -1)]
        counts = {w: 0 for w in weeks}
        for p in self.posts.values():
            d = p.created_at.date()
            w = d - timedelta(days=d.weekday())
            if w in counts:
                counts[w] += 1
        top = sorted(live, key=lambda p: (-p.vote_count, p.number))[:10]
        return Stats(
            total_posts=len(live),
            total_votes=len(self.votes),
            total_comments=len(self.comments),
            new_posts_week=sum(1 for p in self.posts.values() if p.created_at >= week_ago),
            votes_week=sum(1 for at in self.votes.values() if at >= week_ago),
            status_breakdown=breakdown,
            top_posts=[self._item(p) for p in top],
            posts_per_week=[WeekCount(week_start=w, count=counts[w]) for w in weeks],
        )

    # ---------------------------------------------------------------- writes
    async def create_post(
        self, viewer: Principal, *, title: str, body: str, category: Category
    ) -> Post:
        async with self._lock:
            self._ensure_user(viewer)
            now = _now()
            p = _Post(
                id=_uid(),
                number=self._take_number(),
                title=title,
                body=body,
                category=category,
                status="under_review",
                author_id=viewer.id,
                created_at=now,
                updated_at=now,
            )
            self.posts[p.id] = p
            self.votes[(p.id, viewer.id)] = now
            self._recount(p.id)
            return self._to_post(p, viewer)

    async def update_post(self, viewer: Principal, post_id: str, fields: dict) -> Post | None:
        async with self._lock:
            p = self.posts.get(post_id)
            if not p:
                return None
            # Same rule as the RLS policy: own post, still under review.
            if p.author_id != viewer.id or p.status != "under_review":
                raise forbidden(
                    "Only the author can edit a post, and only while it's under review."
                )
            for k in ("title", "body", "category"):
                if fields.get(k) is not None:
                    setattr(p, k, fields[k])
            p.updated_at = _now()
            return self._to_post(p, viewer)

    async def delete_post(self, viewer: Principal, post_id: str) -> bool:
        async with self._lock:
            p = self.posts.get(post_id)
            if not p:
                return False
            is_admin = self._role(viewer.id) == "admin"
            if not is_admin and (p.author_id != viewer.id or p.status != "under_review"):
                raise forbidden("You can delete your own post only while it's under review.")
            children = [o for o in self.posts.values() if o.merged_into == post_id]
            if children and not is_admin:
                raise ApiError(
                    409,
                    "has_merges",
                    "Other posts were merged into this one, so only the team can delete it.",
                )
            for child in children:  # reopen as declined rather than pointing nowhere
                child.status = "declined"
                child.merged_into = None
            del self.posts[post_id]
            self.votes = {k: v for k, v in self.votes.items() if k[0] != post_id}
            self.comments = {k: c for k, c in self.comments.items() if c.post_id != post_id}
            self.events = [e for e in self.events if e.post_id != post_id]
            return True

    async def set_vote(self, viewer: Principal, post_id: str, on: bool) -> VoteResult:
        async with self._lock:
            p = self.posts.get(post_id)
            if not p:
                raise not_found()
            key = (post_id, viewer.id)
            if on:
                if p.status in CLOSED_FOR_VOTING:
                    raise ApiError(
                        409, "post_closed", "This post was merged. Vote on the original instead."
                    )
                self._ensure_user(viewer)
                self.votes.setdefault(key, _now())
            else:
                self.votes.pop(key, None)
            self._recount(post_id)
            return VoteResult(post_id=post_id, voted=key in self.votes, vote_count=p.vote_count)

    async def add_comment(self, viewer: Principal, post_id: str, body: str) -> Comment:
        async with self._lock:
            p = self.posts.get(post_id)
            if not p:
                raise not_found()
            if p.status == "merged":
                raise ApiError(
                    409, "post_closed", "This post was merged. Comment on the original instead."
                )
            self._ensure_user(viewer)
            c = _Comment(_uid(), post_id, viewer.id, body, _now())
            self.comments[c.id] = c
            p.comment_count += 1
            p.updated_at = c.created_at  # comments count as activity for "Recently updated"
            return Comment(
                id=c.id,
                post_id=post_id,
                body=body,
                created_at=c.created_at,
                author=self._author(viewer.id),
            )

    async def delete_comment(self, viewer: Principal, comment_id: str) -> bool:
        async with self._lock:
            c = self.comments.get(comment_id)
            if not c:
                return False
            if c.author_id != viewer.id and self._role(viewer.id) != "admin":
                raise forbidden("You can only delete your own comments.")
            del self.comments[comment_id]
            if c.post_id in self.posts:
                self.posts[c.post_id].comment_count -= 1
            return True

    async def admin_update(
        self,
        viewer: Principal,
        post_id: str,
        *,
        status: SettableStatus | None,
        pinned: bool | None,
    ) -> Post | None:
        async with self._lock:
            if self._role(viewer.id) != "admin":
                raise forbidden("Only the team can change status or pin posts.")
            p = self.posts.get(post_id)
            if not p:
                return None
            if p.status == "merged":
                raise ApiError(409, "post_closed", "Merged posts can't be changed.")
            now = _now()
            if status is not None and status != p.status:
                self.events.append(
                    _Event(
                        _uid(),
                        p.id,
                        "status_changed",
                        viewer.id,
                        now,
                        from_status=p.status,
                        to_status=status,
                    )
                )
                p.status = status
            if pinned is not None and pinned != p.pinned:
                self.events.append(
                    _Event(_uid(), p.id, "pinned" if pinned else "unpinned", viewer.id, now)
                )
                p.pinned = pinned
            p.updated_at = now
            return self._to_post(p, viewer)

    async def merge(self, viewer: Principal, source_id: str, target_id: str) -> Post:
        async with self._lock:
            if self._role(viewer.id) != "admin":
                raise forbidden("Only the team can merge posts.")
            if source_id == target_id:
                raise ApiError(400, "bad_request", "A post can't be merged into itself.")
            src = self.posts.get(source_id)
            dst = self.posts.get(target_id)
            if not src or not dst:
                raise not_found()
            if src.status == "merged":
                raise ApiError(409, "already_merged", "That post has already been merged.")
            if dst.status == "merged":
                raise ApiError(409, "target_merged", "Pick the post it was merged into instead.")
            now = _now()
            for (pid, voter), at in list(self.votes.items()):
                if pid == source_id:
                    self.votes.setdefault((target_id, voter), at)  # de-duplicated
                    del self.votes[(pid, voter)]
            src.status = "merged"
            src.merged_into = target_id
            src.pinned = False
            src.updated_at = now
            for other in self.posts.values():  # re-point earlier merges into the source
                if other.merged_into == source_id:
                    other.merged_into = target_id
            self._recount(source_id)
            self._recount(target_id)
            self.events.append(
                _Event(_uid(), src.id, "merged_into", viewer.id, now, related_id=dst.id)
            )
            self.events.append(
                _Event(_uid(), dst.id, "merged_from", viewer.id, now, related_id=src.id)
            )
            return self._to_post(dst, viewer)

    async def aclose(self) -> None:
        return None


def _uid() -> str:
    return str(uuid.uuid4())


__all__ = ["MemoryRepo"]
