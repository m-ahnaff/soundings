from __future__ import annotations

from .conftest import ADMIN, MEMBER


async def test_pagination_walks_every_post_once(demo):
    seen: list[str] = []
    offset: int | None = 0
    pages = 0
    while offset is not None:
        page = (await demo.get(f"/v1/posts?limit=7&offset={offset}")).json()
        assert page["limit"] == 7 and page["offset"] == offset
        seen += [p["id"] for p in page["items"]]
        offset = page["next_offset"]
        pages += 1
    assert len(seen) == len(set(seen)) == page["total"]
    assert pages == -(-page["total"] // 7)


async def test_past_the_end_is_empty_not_an_error(demo):
    page = (await demo.get("/v1/posts?offset=5000")).json()
    assert page["items"] == [] and page["next_offset"] is None and page["total"] > 0


async def test_sorts(demo):
    top = (await demo.get("/v1/posts?sort=top&limit=50")).json()["items"]
    unpinned = [p for p in top if not p["pinned"]]
    assert [p["vote_count"] for p in unpinned] == sorted(
        (p["vote_count"] for p in unpinned), reverse=True
    )
    assert top[0]["pinned"] is True  # pinned posts lead the default view

    new = (await demo.get("/v1/posts?sort=new&limit=50")).json()["items"]
    unpinned_new = [p["created_at"] for p in new if not p["pinned"]]
    assert unpinned_new == sorted(unpinned_new, reverse=True)

    trending = (await demo.get("/v1/posts?sort=trending&limit=50")).json()
    assert trending["total"] == len(top)


async def test_filters_and_search(demo):
    bugs = (await demo.get("/v1/posts?category=bug&limit=50")).json()["items"]
    assert bugs and all(p["category"] == "bug" for p in bugs)
    planned = (await demo.get("/v1/posts?status=planned&limit=50")).json()["items"]
    assert planned and all(p["status"] == "planned" for p in planned)
    open_ = (await demo.get("/v1/posts?status=open&limit=50")).json()["items"]
    assert {p["status"] for p in open_} <= {"under_review", "planned", "in_progress"}

    hits = (await demo.get("/v1/posts?q=CHICKPEA")).json()["items"]
    assert len(hits) == 1 and "ingredient" in hits[0]["title"]
    by_number = (await demo.get(f"/v1/posts?q=%23{hits[0]['number']}")).json()["items"]
    assert [p["id"] for p in by_number] == [hits[0]["id"]]
    none = (await demo.get("/v1/posts?q=zzzz-nothing")).json()
    assert none == {"items": [], "total": 0, "limit": 20, "offset": 0, "next_offset": None}


async def test_validation_error_shape(demo):
    resp = await demo.get("/v1/posts?limit=500&sort=hot")
    assert resp.status_code == 422
    err = resp.json()["error"]
    assert err["code"] == "validation_error"
    fields = {d["field"] for d in err["details"]}
    assert {"query.limit", "query.sort"} <= fields

    resp = await demo.post("/v1/posts", json={"title": "no", "category": "idea"}, headers=MEMBER)
    assert resp.status_code == 422
    assert {d["field"] for d in resp.json()["error"]["details"]} == {"title", "category"}


async def test_not_found_and_method_shapes(demo):
    resp = await demo.get("/v1/posts/00000000-0000-4000-8000-000000000000")
    assert resp.status_code == 404
    assert resp.json() == {
        "error": {
            "code": "not_found",
            "message": "Post not found. It may have been deleted or merged.",
            "details": None,
        }
    }
    resp = await demo.get("/v1/nope")
    assert resp.status_code == 404 and resp.json()["error"]["code"] == "not_found"
    resp = await demo.post("/v1/roadmap")
    assert resp.status_code == 405 and resp.json()["error"]["code"] == "method_not_allowed"


async def test_stats_shape(demo):
    stats = (await demo.get("/v1/admin/stats", headers=ADMIN)).json()
    assert len(stats["posts_per_week"]) == 8
    assert len(stats["top_posts"]) == 10
    tops = [p["vote_count"] for p in stats["top_posts"]]
    assert tops == sorted(tops, reverse=True)
    assert sum(stats["status_breakdown"].values()) == stats["total_posts"] + stats[
        "status_breakdown"
    ].get("merged", 0)


async def test_openapi_docs_are_served(demo):
    assert (await demo.get("/docs")).status_code == 200
    spec = (await demo.get("/openapi.json")).json()
    assert "/v1/posts/{post_id}/vote" in spec["paths"]


async def test_mine_filter_and_updated_sort(demo):
    from .conftest import MEMBER

    assert (await demo.get("/v1/posts?mine=true")).status_code == 401
    mine = (await demo.get("/v1/posts?mine=true&limit=50", headers=MEMBER)).json()["items"]
    assert mine and {p["author"]["display_name"] for p in mine} == {"Sam Lindqvist"}

    created = (
        await demo.post("/v1/posts", json={"title": "Fresh one", "category": "bug"}, headers=MEMBER)
    ).json()
    updated = (await demo.get("/v1/posts?sort=updated&limit=50")).json()["items"]
    assert updated[0]["id"] == created["id"]  # no pinned boost for "Recently updated"
    stamps = [p["updated_at"] for p in updated]
    assert stamps == sorted(stamps, reverse=True)
