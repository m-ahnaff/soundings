"""Request and response models. These are the public contract of /v1."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Status = Literal["under_review", "planned", "in_progress", "done", "declined", "merged"]
SettableStatus = Literal["under_review", "planned", "in_progress", "done", "declined"]
Category = Literal["feature", "bug", "improvement"]
Sort = Literal["top", "new", "trending", "updated"]
Role = Literal["member", "admin"]

ROADMAP_STATUSES: tuple[Status, ...] = ("planned", "in_progress", "done")

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=4, max_length=140)]
Body = Annotated[str, StringConstraints(strip_whitespace=True, max_length=5000)]
CommentBody = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)
]


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Author(_Model):
    id: str
    display_name: str
    is_team: bool = False


class PostRef(_Model):
    id: str
    number: int
    title: str


class Post(_Model):
    id: str
    number: int
    title: str
    body: str
    category: Category
    status: Status
    pinned: bool
    vote_count: int
    comment_count: int
    created_at: datetime
    updated_at: datetime
    author: Author | None
    merged_into: PostRef | None = None
    has_voted: bool = False
    can_edit: bool = False


class PostList(_Model):
    items: list[Post]
    total: int
    limit: int
    offset: int
    next_offset: int | None


class PostCreate(_Model):
    title: Title
    body: Body = ""
    category: Category


class PostUpdate(_Model):
    title: Title | None = None
    body: Body | None = None
    category: Category | None = None

    @model_validator(mode="after")
    def _not_empty(self) -> PostUpdate:
        if self.title is None and self.body is None and self.category is None:
            raise ValueError("Nothing to update")
        return self


class AdminPostUpdate(_Model):
    status: SettableStatus | None = None
    pinned: bool | None = None

    @model_validator(mode="after")
    def _not_empty(self) -> AdminPostUpdate:
        if self.status is None and self.pinned is None:
            raise ValueError("Nothing to update")
        return self


class MergeRequest(_Model):
    target_id: str = Field(min_length=1)


class VoteResult(_Model):
    post_id: str
    voted: bool
    vote_count: int


class CommentCreate(_Model):
    body: CommentBody


class Comment(_Model):
    type: Literal["comment"] = "comment"
    id: str
    post_id: str
    body: str
    created_at: datetime
    author: Author | None
    can_delete: bool = False


EventKind = Literal["status_changed", "merged_from", "merged_into", "pinned", "unpinned"]


class Event(_Model):
    type: Literal["event"] = "event"
    id: str
    post_id: str
    kind: EventKind
    from_status: Status | None = None
    to_status: Status | None = None
    related: PostRef | None = None
    actor: Author | None = None
    created_at: datetime


class Activity(_Model):
    items: list[Annotated[Comment | Event, Field(discriminator="type")]]


class Me(_Model):
    id: str
    display_name: str
    role: Role


class RoadmapItem(_Model):
    id: str
    number: int
    title: str
    category: Category
    status: Status
    vote_count: int
    comment_count: int


class Roadmap(_Model):
    planned: list[RoadmapItem]
    in_progress: list[RoadmapItem]
    done: list[RoadmapItem]


class WeekCount(_Model):
    week_start: date
    count: int


class Stats(_Model):
    total_posts: int
    total_votes: int
    total_comments: int
    new_posts_week: int
    votes_week: int
    status_breakdown: dict[str, int]
    top_posts: list[RoadmapItem]
    posts_per_week: list[WeekCount]


class Health(_Model):
    ok: bool
    mode: Literal["demo", "supabase"]
