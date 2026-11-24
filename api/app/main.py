"""Soundings API: a small, versioned REST layer over the feedback board."""

from __future__ import annotations

import time
import uuid
from collections import defaultdict, deque
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, FastAPI, Path, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from .auth import Principal, TokenVerifier, resolve_principal
from .config import Settings, get_settings
from .errors import ApiError, forbidden, install_error_handlers, not_found, unauthorized
from .models import (
    Activity,
    AdminPostUpdate,
    Category,
    Comment,
    CommentCreate,
    Health,
    Me,
    MergeRequest,
    Post,
    PostCreate,
    PostList,
    PostUpdate,
    Roadmap,
    Sort,
    Stats,
    VoteResult,
)
from .repo.base import Repo
from .repo.memory import MemoryRepo
from .repo.postgrest import PostgrestRepo

StatusFilter = Literal[
    "open", "under_review", "planned", "in_progress", "done", "declined", "merged"
]


# ----------------------------------------------------------------- deps
def repo_dep(request: Request) -> Repo:
    return request.app.state.repo


async def viewer_dep(request: Request) -> Principal | None:
    return await resolve_principal(request)


async def user_dep(viewer: Annotated[Principal | None, Depends(viewer_dep)]) -> Principal:
    if viewer is None:
        raise unauthorized()
    return viewer


async def admin_dep(
    user: Annotated[Principal, Depends(user_dep)], repo: Annotated[Repo, Depends(repo_dep)]
) -> Principal:
    me = await repo.get_me(user)
    if not me or me.role != "admin":
        raise forbidden("Only the team can do that.")
    return user


RepoD = Annotated[Repo, Depends(repo_dep)]
Viewer = Annotated[Principal | None, Depends(viewer_dep)]
User = Annotated[Principal, Depends(user_dep)]
Admin = Annotated[Principal, Depends(admin_dep)]


def _uuid(value: str, what: str = "Post") -> str:
    try:
        return str(uuid.UUID(value))
    except ValueError as exc:
        raise not_found(what) from exc


PostId = Annotated[str, Path(description="Post UUID")]


class WriteLimiter:
    """Sliding-window budget per user for create endpoints (per instance)."""

    def __init__(self, per_minute: int) -> None:
        self.per_minute = per_minute
        self.hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> None:
        if self.per_minute <= 0:
            return
        now = time.monotonic()
        window = self.hits[key]
        while window and now - window[0] > 60:
            window.popleft()
        if len(window) >= self.per_minute:
            retry = max(1, int(60 - (now - window[0])))
            raise ApiError(
                429,
                "rate_limited",
                f"You're posting quickly. Try again in {retry} seconds.",
                headers={"Retry-After": str(retry)},
            )
        window.append(now)


def _with_permissions(post: Post, viewer: Principal | None) -> Post:
    can_edit = bool(
        viewer and post.author and post.author.id == viewer.id and post.status == "under_review"
    )
    return post.model_copy(update={"can_edit": can_edit})


# ----------------------------------------------------------------- routes
router = APIRouter(prefix="/v1")


@router.get("/me", response_model=Me, tags=["account"])
async def get_me(user: User, repo: RepoD) -> Me:
    me = await repo.get_me(user)
    if me is None:
        # Profile row is created by a trigger on sign-up; fall back gracefully.
        return Me(id=user.id, display_name=(user.email or "Member").split("@")[0], role="member")
    return me


@router.get("/posts", response_model=PostList, tags=["posts"])
async def list_posts(
    repo: RepoD,
    viewer: Viewer,
    response: Response,
    status: StatusFilter | None = None,
    category: Category | None = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    sort: Sort = "top",
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    offset: Annotated[int, Query(ge=0, le=10_000)] = 0,
    mine: Annotated[bool, Query(description="Only the caller's own posts")] = False,
) -> PostList:
    q = (q or "").strip() or None
    if mine and viewer is None:
        raise unauthorized("Sign in to see your requests.")
    items, total = await repo.list_posts(
        viewer,
        status=status,
        category=category,
        q=q,
        sort=sort,
        limit=limit,
        offset=offset,
        author_id=viewer.id if mine and viewer else None,
    )
    next_offset = offset + len(items) if offset + len(items) < total else None
    response.headers["Vary"] = "Authorization, X-Demo-User"
    return PostList(
        items=[_with_permissions(p, viewer) for p in items],
        total=total,
        limit=limit,
        offset=offset,
        next_offset=next_offset,
    )


@router.post("/posts", response_model=Post, status_code=201, tags=["posts"])
async def create_post(body: PostCreate, user: User, repo: RepoD, request: Request) -> Post:
    request.app.state.limiter.check(user.id)
    post = await repo.create_post(user, title=body.title, body=body.body, category=body.category)
    return _with_permissions(post, user)


@router.get("/posts/{post_id}", response_model=Post, tags=["posts"])
async def get_post(post_id: PostId, repo: RepoD, viewer: Viewer) -> Post:
    post = await repo.get_post(viewer, _uuid(post_id))
    if not post:
        raise not_found()
    return _with_permissions(post, viewer)


@router.patch("/posts/{post_id}", response_model=Post, tags=["posts"])
async def update_post(post_id: PostId, body: PostUpdate, user: User, repo: RepoD) -> Post:
    pid = _uuid(post_id)
    post = await repo.get_post(user, pid)
    if not post:
        raise not_found()
    if not post.author or post.author.id != user.id:
        raise forbidden("You can only edit your own posts.")
    if post.status != "under_review":
        raise ApiError(409, "locked", "This post is locked now that the team has reviewed it.")
    updated = await repo.update_post(user, pid, body.model_dump(exclude_none=True))
    if not updated:
        raise not_found()
    return _with_permissions(updated, user)


@router.delete("/posts/{post_id}", status_code=204, tags=["posts"])
async def delete_post(post_id: PostId, user: User, repo: RepoD) -> Response:
    pid = _uuid(post_id)
    post = await repo.get_post(user, pid)
    if not post:
        raise not_found()
    me = await repo.get_me(user)
    is_admin = bool(me and me.role == "admin")
    if not is_admin:
        if not post.author or post.author.id != user.id:
            raise forbidden("You can only delete your own posts.")
        if post.status != "under_review":
            raise ApiError(409, "locked", "This post is locked now that the team has reviewed it.")
    if not await repo.delete_post(user, pid):
        raise forbidden("You can't delete this post.")
    return Response(status_code=204)


@router.put("/posts/{post_id}/vote", response_model=VoteResult, tags=["votes"])
async def add_vote(post_id: PostId, user: User, repo: RepoD) -> VoteResult:
    pid = _uuid(post_id)
    post = await repo.get_post(user, pid)
    if not post:
        raise not_found()
    if post.status == "merged":
        raise ApiError(409, "post_closed", "This post was merged. Vote on the original instead.")
    return await repo.set_vote(user, pid, True)


@router.delete("/posts/{post_id}/vote", response_model=VoteResult, tags=["votes"])
async def remove_vote(post_id: PostId, user: User, repo: RepoD) -> VoteResult:
    pid = _uuid(post_id)
    if not await repo.get_post(user, pid):
        raise not_found()
    return await repo.set_vote(user, pid, False)


@router.get("/posts/{post_id}/activity", response_model=Activity, tags=["comments"])
async def get_activity(post_id: PostId, repo: RepoD, viewer: Viewer) -> Activity:
    pid = _uuid(post_id)
    if not await repo.get_post(viewer, pid):
        raise not_found()
    items = await repo.list_activity(viewer, pid)
    is_admin = False
    if viewer:
        me = await repo.get_me(viewer)
        is_admin = bool(me and me.role == "admin")
    out = []
    for item in items:
        if isinstance(item, Comment):
            mine = bool(viewer and item.author and item.author.id == viewer.id)
            item = item.model_copy(update={"can_delete": mine or is_admin})
        out.append(item)
    return Activity(items=out)


@router.post(
    "/posts/{post_id}/comments", response_model=Comment, status_code=201, tags=["comments"]
)
async def add_comment(
    post_id: PostId, body: CommentCreate, user: User, repo: RepoD, request: Request
) -> Comment:
    pid = _uuid(post_id)
    post = await repo.get_post(user, pid)
    if not post:
        raise not_found()
    if post.status == "merged":
        raise ApiError(409, "post_closed", "This post was merged. Comment on the original instead.")
    request.app.state.limiter.check(user.id)
    comment = await repo.add_comment(user, pid, body.body)
    return comment.model_copy(update={"can_delete": True})


@router.delete("/comments/{comment_id}", status_code=204, tags=["comments"])
async def delete_comment(comment_id: str, user: User, repo: RepoD) -> Response:
    cid = _uuid(comment_id, "Comment")
    comment = await repo.get_comment(user, cid)
    if not comment:
        raise not_found("Comment")
    if not comment.author or comment.author.id != user.id:
        me = await repo.get_me(user)
        if not me or me.role != "admin":
            raise forbidden("You can only delete your own comments.")
    if not await repo.delete_comment(user, cid):
        raise forbidden("You can't delete this comment.")
    return Response(status_code=204)


@router.get("/roadmap", response_model=Roadmap, tags=["roadmap"])
async def roadmap(repo: RepoD, viewer: Viewer) -> Roadmap:
    return await repo.roadmap(viewer)


@router.patch("/admin/posts/{post_id}", response_model=Post, tags=["admin"])
async def admin_update(post_id: PostId, body: AdminPostUpdate, admin: Admin, repo: RepoD) -> Post:
    pid = _uuid(post_id)
    post = await repo.get_post(admin, pid)
    if not post:
        raise not_found()
    if post.status == "merged":
        raise ApiError(409, "post_closed", "Merged posts can't be changed.")
    updated = await repo.admin_update(admin, pid, status=body.status, pinned=body.pinned)
    if not updated:
        raise not_found()
    return _with_permissions(updated, admin)


@router.post("/admin/posts/{post_id}/merge", response_model=Post, tags=["admin"])
async def merge(post_id: PostId, body: MergeRequest, admin: Admin, repo: RepoD) -> Post:
    source = _uuid(post_id)
    target = _uuid(body.target_id)
    if source == target:
        raise ApiError(400, "bad_request", "A post can't be merged into itself.")
    merged = await repo.merge(admin, source, target)
    return _with_permissions(merged, admin)


@router.get("/admin/stats", response_model=Stats, tags=["admin"])
async def stats(admin: Admin, repo: RepoD) -> Stats:
    return await repo.stats(admin)


# ----------------------------------------------------------------- app
def create_app(settings: Settings | None = None, repo: Repo | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        yield
        await app.state.repo.aclose()

    app = FastAPI(
        title="Soundings API",
        version="1.0.0",
        summary="Feedback board and public roadmap.",
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.limiter = WriteLimiter(settings.write_limit_per_minute)
    if settings.demo_mode:
        app.state.repo = repo or MemoryRepo.seeded()
    else:
        app.state.repo = repo or PostgrestRepo(settings)
        app.state.verifier = TokenVerifier(settings)

    install_error_handlers(app)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"]
        + (["X-Demo-User"] if settings.demo_mode else []),
        max_age=600,
    )

    @app.get("/healthz", response_model=Health, tags=["meta"])
    async def healthz() -> Health:
        return Health(ok=True, mode="demo" if settings.demo_mode else "supabase")

    app.include_router(router)
    return app
