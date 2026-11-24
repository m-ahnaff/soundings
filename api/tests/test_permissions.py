"""Who can do what: anonymous vs member vs admin (demo store, same rules as RLS)."""

from __future__ import annotations

from .conftest import ADMIN, MEMBER


async def _new_post(client, headers=MEMBER, **extra):
    payload = {
        "title": "Weekly plan templates",
        "body": "Save a week as a template.",
        "category": "feature",
        **extra,
    }
    resp = await client.post("/v1/posts", json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _someone_elses_post(client):
    items = (await client.get("/v1/posts?status=under_review&limit=50")).json()["items"]
    me = (await client.get("/v1/me", headers=MEMBER)).json()
    return next(p for p in items if p["author"]["id"] != me["id"])


async def test_anonymous_can_read_everything_public(demo):
    listing = (await demo.get("/v1/posts")).json()
    assert listing["total"] > 20
    post = listing["items"][0]
    assert post["has_voted"] is False and post["can_edit"] is False
    assert (await demo.get(f"/v1/posts/{post['id']}")).status_code == 200
    assert (await demo.get(f"/v1/posts/{post['id']}/activity")).status_code == 200
    roadmap = (await demo.get("/v1/roadmap")).json()
    assert set(roadmap) == {"planned", "in_progress", "done"}
    assert all(i["status"] == "planned" for i in roadmap["planned"])


async def test_anonymous_cannot_write(demo):
    post = (await demo.get("/v1/posts")).json()["items"][0]
    checks = [
        await demo.post("/v1/posts", json={"title": "Hello there", "category": "bug"}),
        await demo.put(f"/v1/posts/{post['id']}/vote"),
        await demo.post(f"/v1/posts/{post['id']}/comments", json={"body": "hi"}),
        await demo.patch(f"/v1/admin/posts/{post['id']}", json={"status": "planned"}),
        await demo.get("/v1/admin/stats"),
    ]
    assert [r.status_code for r in checks] == [401] * len(checks)


async def test_member_creates_post_with_own_vote(demo):
    post = await _new_post(demo)
    assert post["status"] == "under_review"
    assert post["vote_count"] == 1 and post["has_voted"] is True
    assert post["can_edit"] is True
    assert post["author"]["display_name"] == "Sam Lindqvist"


async def test_member_cannot_smuggle_status_or_pin(demo):
    resp = await demo.post(
        "/v1/posts",
        json={"title": "Pin me", "category": "bug", "status": "done", "pinned": True},
        headers=MEMBER,
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "validation_error"


async def test_member_edits_own_post_only_while_under_review(demo):
    post = await _new_post(demo)
    resp = await demo.patch(
        f"/v1/posts/{post['id']}", json={"title": "Weekly templates"}, headers=MEMBER
    )
    assert resp.status_code == 200 and resp.json()["title"] == "Weekly templates"

    await demo.patch(f"/v1/admin/posts/{post['id']}", json={"status": "planned"}, headers=ADMIN)
    resp = await demo.patch(
        f"/v1/posts/{post['id']}", json={"title": "Too late now"}, headers=MEMBER
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "locked"
    resp = await demo.delete(f"/v1/posts/{post['id']}", headers=MEMBER)
    assert resp.status_code == 409


async def test_member_cannot_edit_or_delete_others_posts(demo):
    other = await _someone_elses_post(demo)
    resp = await demo.patch(
        f"/v1/posts/{other['id']}", json={"title": "Hijacked title"}, headers=MEMBER
    )
    assert resp.status_code == 403
    assert (await demo.delete(f"/v1/posts/{other['id']}", headers=MEMBER)).status_code == 403


async def test_member_cannot_use_admin_endpoints(demo):
    post = await _new_post(demo)
    other = await _someone_elses_post(demo)
    r1 = await demo.patch(f"/v1/admin/posts/{post['id']}", json={"status": "done"}, headers=MEMBER)
    r2 = await demo.post(
        f"/v1/admin/posts/{post['id']}/merge", json={"target_id": other["id"]}, headers=MEMBER
    )
    r3 = await demo.get("/v1/admin/stats", headers=MEMBER)
    assert [r1.status_code, r2.status_code, r3.status_code] == [403, 403, 403]


async def test_member_deletes_own_post_while_under_review(demo):
    post = await _new_post(demo)
    assert (await demo.delete(f"/v1/posts/{post['id']}", headers=MEMBER)).status_code == 204
    assert (await demo.get(f"/v1/posts/{post['id']}")).status_code == 404


async def test_admin_changes_status_and_it_lands_in_the_timeline(demo):
    post = await _new_post(demo)
    resp = await demo.patch(
        f"/v1/admin/posts/{post['id']}",
        json={"status": "in_progress", "pinned": True},
        headers=ADMIN,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "in_progress" and resp.json()["pinned"] is True
    items = (await demo.get(f"/v1/posts/{post['id']}/activity")).json()["items"]
    kinds = [(i["type"], i.get("kind")) for i in items]
    assert ("event", "status_changed") in kinds and ("event", "pinned") in kinds
    change = next(i for i in items if i.get("kind") == "status_changed")
    assert change["from_status"] == "under_review" and change["to_status"] == "in_progress"
    assert change["actor"]["is_team"] is True


async def test_admin_cannot_set_merged_status_directly(demo):
    post = await _new_post(demo)
    resp = await demo.patch(
        f"/v1/admin/posts/{post['id']}", json={"status": "merged"}, headers=ADMIN
    )
    assert resp.status_code == 422


async def test_admin_deletes_any_post_and_comment(demo):
    other = await _someone_elses_post(demo)
    c = await demo.post(
        f"/v1/posts/{other['id']}/comments", json={"body": "Me too"}, headers=MEMBER
    )
    assert c.status_code == 201 and c.json()["can_delete"] is True
    assert (await demo.delete(f"/v1/comments/{c.json()['id']}", headers=ADMIN)).status_code == 204
    assert (await demo.delete(f"/v1/posts/{other['id']}", headers=ADMIN)).status_code == 204


async def test_comments_permissions_and_counts(demo):
    other = await _someone_elses_post(demo)
    before = other["comment_count"]
    c = (
        await demo.post(
            f"/v1/posts/{other['id']}/comments", json={"body": "  Useful!  "}, headers=MEMBER
        )
    ).json()
    assert c["body"] == "Useful!"
    after = (await demo.get(f"/v1/posts/{other['id']}")).json()["comment_count"]
    assert after == before + 1
    # An admin's comment can't be deleted by a member.
    ac = (
        await demo.post(f"/v1/posts/{other['id']}/comments", json={"body": "On it"}, headers=ADMIN)
    ).json()
    assert (await demo.delete(f"/v1/comments/{ac['id']}", headers=MEMBER)).status_code == 403
    activity = (await demo.get(f"/v1/posts/{other['id']}/activity", headers=MEMBER)).json()
    mine = next(i for i in activity["items"] if i.get("id") == c["id"])
    theirs = next(i for i in activity["items"] if i.get("id") == ac["id"])
    assert mine["can_delete"] is True and theirs["can_delete"] is False


async def test_empty_comment_is_rejected(demo):
    post = (await demo.get("/v1/posts")).json()["items"][0]
    resp = await demo.post(f"/v1/posts/{post['id']}/comments", json={"body": "   "}, headers=MEMBER)
    assert resp.status_code == 422


async def test_rate_limit_on_create(memory_repo):
    import httpx

    from app.config import Settings
    from app.main import create_app

    app = create_app(Settings(write_limit_per_minute=2), memory_repo)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as c:
        codes = [
            (
                await c.post(
                    "/v1/posts",
                    json={"title": f"Idea number {i}", "category": "feature"},
                    headers=MEMBER,
                )
            ).status_code
            for i in range(3)
        ]
    assert codes == [201, 201, 429]
