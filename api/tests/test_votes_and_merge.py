from __future__ import annotations

import asyncio

from app.auth import Principal
from app.errors import ApiError
from app.repo.memory import MemoryRepo

from .conftest import ADMIN, MEMBER


async def _unvoted_post(client):
    items = (await client.get("/v1/posts?limit=50", headers=MEMBER)).json()["items"]
    return next(p for p in items if not p["has_voted"] and p["status"] != "merged")


async def test_vote_is_idempotent_both_ways(demo):
    post = await _unvoted_post(demo)
    start = post["vote_count"]
    url = f"/v1/posts/{post['id']}/vote"

    first = (await demo.put(url, headers=MEMBER)).json()
    second = (await demo.put(url, headers=MEMBER)).json()
    assert first == {"post_id": post["id"], "voted": True, "vote_count": start + 1}
    assert second == first

    off = (await demo.delete(url, headers=MEMBER)).json()
    off_again = (await demo.delete(url, headers=MEMBER)).json()
    assert off == {"post_id": post["id"], "voted": False, "vote_count": start}
    assert off_again == off

    detail = (await demo.get(f"/v1/posts/{post['id']}", headers=MEMBER)).json()
    assert detail["has_voted"] is False and detail["vote_count"] == start


async def test_concurrent_votes_count_once(demo):
    post = await _unvoted_post(demo)
    url = f"/v1/posts/{post['id']}/vote"
    results = await asyncio.gather(*(demo.put(url, headers=MEMBER) for _ in range(12)))
    assert {r.status_code for r in results} == {200}
    detail = (await demo.get(f"/v1/posts/{post['id']}")).json()
    assert detail["vote_count"] == post["vote_count"] + 1


async def test_votes_from_two_users_add_up(demo):
    post = await _unvoted_post(demo)
    url = f"/v1/posts/{post['id']}/vote"
    await demo.put(url, headers=MEMBER)
    admin_res = (await demo.put(url, headers=ADMIN)).json()
    # The admin may already have voted in the seed; either way the member adds exactly one.
    assert admin_res["vote_count"] >= post["vote_count"] + 1


async def test_vote_on_missing_or_invalid_post(demo):
    r1 = await demo.put("/v1/posts/00000000-0000-4000-8000-000000000999/vote", headers=MEMBER)
    r2 = await demo.put("/v1/posts/not-a-uuid/vote", headers=MEMBER)
    assert r1.status_code == 404 and r2.status_code == 404
    assert r2.json()["error"]["code"] == "not_found"


async def test_merge_moves_votes_without_double_counting():
    repo = MemoryRepo.seeded()
    admin = Principal(id="00000000-0000-4000-8000-00000000a001")
    a, b, c = (Principal(id=f"00000000-0000-4000-8000-00000000e00{i}") for i in range(3))
    src = await repo.create_post(a, title="Duplicate idea", body="", category="feature")
    dst = await repo.create_post(c, title="Original idea", body="", category="feature")
    await repo.set_vote(b, src.id, True)  # src voters: a (author), b
    await repo.set_vote(b, dst.id, True)  # dst voters: c (author), b
    merged = await repo.merge(admin, src.id, dst.id)

    assert merged.id == dst.id
    assert merged.vote_count == 3  # a, b, c (b counted once)
    voters = {u for (pid, u) in repo.votes if pid == dst.id}
    assert voters == {a.id, b.id, c.id}
    source = await repo.get_post(None, src.id)
    assert source.status == "merged" and source.vote_count == 0
    assert source.merged_into.id == dst.id and source.merged_into.number == dst.number

    src_events = [e.kind for e in await repo.list_activity(None, src.id) if e.type == "event"]
    dst_events = [e.kind for e in await repo.list_activity(None, dst.id) if e.type == "event"]
    assert src_events == ["merged_into"] and dst_events == ["merged_from"]


async def test_merge_endpoint_rules(demo):
    async def make(title):
        r = await demo.post("/v1/posts", json={"title": title, "category": "bug"}, headers=MEMBER)
        return r.json()

    one, two, three = (
        await make("Crash on save"),
        await make("App crashes saving"),
        await make("Saving crashes"),
    )
    url = "/v1/admin/posts/{}/merge"
    self_merge = await demo.post(
        url.format(one["id"]), json={"target_id": one["id"]}, headers=ADMIN
    )
    assert self_merge.status_code == 400

    ok = await demo.post(url.format(two["id"]), json={"target_id": one["id"]}, headers=ADMIN)
    assert ok.status_code == 200 and ok.json()["id"] == one["id"]

    again = await demo.post(url.format(two["id"]), json={"target_id": one["id"]}, headers=ADMIN)
    assert again.status_code == 409 and again.json()["error"]["code"] == "already_merged"

    into_merged = await demo.post(
        url.format(three["id"]), json={"target_id": two["id"]}, headers=ADMIN
    )
    assert into_merged.status_code == 409 and into_merged.json()["error"]["code"] == "target_merged"

    # The duplicate is closed: hidden from the board, no voting or commenting.
    listing = (await demo.get("/v1/posts?limit=50&sort=new")).json()["items"]
    assert two["id"] not in {p["id"] for p in listing}
    merged_only = (await demo.get("/v1/posts?status=merged")).json()["items"]
    assert two["id"] in {p["id"] for p in merged_only}
    assert (await demo.put(f"/v1/posts/{two['id']}/vote", headers=ADMIN)).status_code == 409
    resp = await demo.post(f"/v1/posts/{two['id']}/comments", json={"body": "hm"}, headers=ADMIN)
    assert resp.status_code == 409
    detail = (await demo.get(f"/v1/posts/{two['id']}")).json()
    assert detail["merged_into"]["id"] == one["id"]


async def test_merge_target_cannot_be_deleted_by_its_author():
    repo = MemoryRepo.seeded()
    admin = Principal(id="00000000-0000-4000-8000-00000000a001")
    author, other = (Principal(id=f"00000000-0000-4000-8000-00000000f00{i}") for i in range(2))
    original = await repo.create_post(author, title="Original idea", body="", category="feature")
    dup = await repo.create_post(other, title="Same idea again", body="", category="feature")
    await repo.merge(admin, dup.id, original.id)
    try:
        await repo.delete_post(author, original.id)
        raise AssertionError("author deleted a merge target")
    except ApiError as err:
        assert err.code == "has_merges"
    assert await repo.delete_post(admin, original.id)
    reopened = await repo.get_post(None, dup.id)
    assert reopened.status == "declined" and reopened.merged_into is None


async def test_merge_chains_are_repointed():
    repo = MemoryRepo.seeded()
    admin = Principal(id="00000000-0000-4000-8000-00000000a001")
    u = Principal(id="00000000-0000-4000-8000-00000000f009")
    a, s_, t = [
        await repo.create_post(u, title=f"Chain post {n}", body="", category="bug") for n in "ast"
    ]
    await repo.merge(admin, a.id, s_.id)
    await repo.merge(admin, s_.id, t.id)
    assert (await repo.get_post(None, a.id)).merged_into.id == t.id
