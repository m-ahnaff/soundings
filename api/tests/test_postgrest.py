"""The Supabase path: requests sent to PostgREST (mocked with respx) and responses mapped back."""

from __future__ import annotations

import json

import httpx

from .conftest import ADMIN_ID, PUBLISHABLE_KEY, SUPABASE_URL, USER_ID, Keys, bearer

REST = f"{SUPABASE_URL}/rest/v1"
POST_ID = "33333333-3333-4333-8333-333333333333"
OTHER_ID = "44444444-4444-4444-8444-444444444444"


def _row(**over):
    row = {
        "id": POST_ID,
        "number": 140,
        "title": "Dark mode",
        "body": "Please",
        "category": "feature",
        "status": "under_review",
        "pinned": False,
        "merged_into": None,
        "vote_count": 3,
        "comment_count": 1,
        "created_at": "2026-11-20T10:00:00+00:00",
        "updated_at": "2026-11-20T10:00:00+00:00",
        "author_id": USER_ID,
        "author": {"id": USER_ID, "display_name": "Sam", "role": "member"},
    }
    row.update(over)
    return row


def _list_row(**over):
    row = _row(**over)
    row.pop("author")
    row.update(
        {
            "author_name": "Sam",
            "author_role": "member",
            "has_voted": True,
            "recent_votes": 2,
            "total_count": 41,
        }
    )
    return row


async def test_anonymous_list_uses_rpc_with_only_the_publishable_key(sb, mock_supabase):
    route = mock_supabase.post(f"{REST}/rpc/list_posts").respond(json=[_list_row()])
    resp = await sb.get("/v1/posts?sort=trending&category=feature&q=dark&limit=1")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 41 and body["next_offset"] == 1
    item = body["items"][0]
    assert item["author"] == {"id": USER_ID, "display_name": "Sam", "is_team": False}
    assert item["has_voted"] is True and item["can_edit"] is False  # anon can't edit

    req = route.calls.last.request
    assert req.headers["apikey"] == PUBLISHABLE_KEY
    assert "authorization" not in req.headers
    assert json.loads(req.content) == {
        "p_status": None,
        "p_category": "feature",
        "p_q": "dark",
        "p_sort": "trending",
        "p_limit": 1,
        "p_offset": 0,
        "p_author": None,
    }


async def test_signed_in_detail_forwards_user_jwt(sb, mock_supabase, keys: Keys):
    posts = mock_supabase.get(f"{REST}/posts").respond(json=[_row()])
    votes = mock_supabase.get(f"{REST}/votes").respond(json=[{"post_id": POST_ID}])
    token = keys.token()
    resp = await sb.get(f"/v1/posts/{POST_ID}", headers=bearer(token))
    assert resp.status_code == 200
    assert resp.json()["has_voted"] is True and resp.json()["can_edit"] is True
    for route in (posts, votes):
        assert route.calls.last.request.headers["authorization"] == f"Bearer {token}"
    assert votes.calls.last.request.url.params["user_id"] == f"eq.{USER_ID}"


async def test_vote_put_is_an_ignore_duplicates_upsert(sb, mock_supabase, keys: Keys):
    mock_supabase.get(
        f"{REST}/posts",
        params={"select": "*,author:profiles!posts_author_id_fkey(id,display_name,role)"},
    ).respond(json=[_row()])
    mock_supabase.get(f"{REST}/votes").respond(json=[])
    insert = mock_supabase.post(f"{REST}/votes").respond(201)
    mock_supabase.get(f"{REST}/posts", params={"select": "vote_count"}).respond(
        json=[{"vote_count": 4}]
    )
    resp = await sb.put(f"/v1/posts/{POST_ID}/vote", headers=bearer(keys.token()))
    assert resp.json() == {"post_id": POST_ID, "voted": True, "vote_count": 4}
    req = insert.calls.last.request
    assert "resolution=ignore-duplicates" in req.headers["prefer"]
    assert req.url.params["on_conflict"] == "post_id,user_id"
    assert json.loads(req.content) == {"post_id": POST_ID, "user_id": USER_ID}


async def test_vote_delete_targets_only_own_row(sb, mock_supabase, keys: Keys):
    mock_supabase.get(
        f"{REST}/posts",
        params={"select": "*,author:profiles!posts_author_id_fkey(id,display_name,role)"},
    ).respond(json=[_row()])
    mock_supabase.get(f"{REST}/votes").respond(json=[{"post_id": POST_ID}])
    delete = mock_supabase.delete(f"{REST}/votes").respond(204)
    mock_supabase.get(f"{REST}/posts", params={"select": "vote_count"}).respond(
        json=[{"vote_count": 2}]
    )
    resp = await sb.delete(f"/v1/posts/{POST_ID}/vote", headers=bearer(keys.token()))
    assert resp.json()["voted"] is False
    params = delete.calls.last.request.url.params
    assert params["post_id"] == f"eq.{POST_ID}" and params["user_id"] == f"eq.{USER_ID}"


async def test_rls_denial_maps_to_403(sb, mock_supabase, keys: Keys):
    mock_supabase.get(f"{REST}/posts").respond(json=[_row()])
    mock_supabase.get(f"{REST}/votes").respond(json=[])
    mock_supabase.patch(f"{REST}/posts").respond(
        403, json={"code": "42501", "message": "protected_column", "details": None}
    )
    resp = await sb.patch(
        f"/v1/posts/{POST_ID}", json={"title": "New title"}, headers=bearer(keys.token())
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "forbidden"


async def test_rls_filtered_update_is_forbidden_not_silent(sb, mock_supabase, keys: Keys):
    mock_supabase.get(f"{REST}/posts").respond(json=[_row()])
    mock_supabase.get(f"{REST}/votes").respond(json=[])
    mock_supabase.patch(f"{REST}/posts").respond(200, json=[])
    resp = await sb.patch(
        f"/v1/posts/{POST_ID}", json={"title": "New title"}, headers=bearer(keys.token())
    )
    assert resp.status_code == 403


async def test_admin_endpoints_check_profile_role(sb, mock_supabase, keys: Keys):
    mock_supabase.get(f"{REST}/profiles").respond(
        json=[{"id": USER_ID, "display_name": "Sam", "role": "member"}]
    )
    stats = mock_supabase.post(f"{REST}/rpc/admin_stats").respond(json={})
    resp = await sb.get("/v1/admin/stats", headers=bearer(keys.token()))
    assert resp.status_code == 403
    assert not stats.called


async def test_admin_merge_calls_rpc_and_maps_db_errors(sb, mock_supabase, keys: Keys):
    mock_supabase.get(f"{REST}/profiles").respond(
        json=[{"id": ADMIN_ID, "display_name": "Maya", "role": "admin"}]
    )
    rpc = mock_supabase.post(f"{REST}/rpc/merge_post").mock(
        side_effect=[
            httpx.Response(204),
            httpx.Response(400, json={"code": "P0001", "message": "already_merged"}),
        ]
    )
    mock_supabase.get(f"{REST}/posts").respond(json=[_row(id=OTHER_ID)])
    mock_supabase.get(f"{REST}/votes").respond(json=[])
    token = keys.token(sub=ADMIN_ID)
    url = f"/v1/admin/posts/{POST_ID}/merge"
    ok = await sb.post(url, json={"target_id": OTHER_ID}, headers=bearer(token))
    assert ok.status_code == 200 and ok.json()["id"] == OTHER_ID
    assert json.loads(rpc.calls[0].request.content) == {"p_source": POST_ID, "p_target": OTHER_ID}
    again = await sb.post(url, json={"target_id": OTHER_ID}, headers=bearer(token))
    assert again.status_code == 409 and again.json()["error"]["code"] == "already_merged"


async def test_admin_stats_passthrough(sb, mock_supabase, keys: Keys):
    mock_supabase.get(f"{REST}/profiles").respond(
        json=[{"id": ADMIN_ID, "display_name": "Maya", "role": "admin"}]
    )
    payload = {
        "total_posts": 3,
        "total_votes": 9,
        "total_comments": 2,
        "new_posts_week": 1,
        "votes_week": 4,
        "status_breakdown": {"under_review": 3},
        "top_posts": [
            {
                "id": POST_ID,
                "number": 140,
                "title": "Dark mode",
                "category": "feature",
                "status": "under_review",
                "vote_count": 3,
                "comment_count": 1,
            }
        ],
        "posts_per_week": [{"week_start": "2026-11-16", "count": 1}],
    }
    mock_supabase.post(f"{REST}/rpc/admin_stats").respond(json=payload)
    resp = await sb.get("/v1/admin/stats", headers=bearer(keys.token(sub=ADMIN_ID)))
    assert resp.status_code == 200 and resp.json() == payload


async def test_roadmap_queries_each_column(sb, mock_supabase):
    planned = {
        "id": POST_ID,
        "number": 1,
        "title": "A plan",
        "category": "bug",
        "status": "planned",
        "vote_count": 5,
        "comment_count": 0,
    }
    done = {
        "id": OTHER_ID,
        "number": 2,
        "title": "Shipped",
        "category": "feature",
        "status": "done",
        "vote_count": 3,
        "comment_count": 2,
    }
    mock_supabase.get(f"{REST}/posts", params={"status": "eq.planned"}).respond(json=[planned])
    mock_supabase.get(f"{REST}/posts", params={"status": "eq.in_progress"}).respond(json=[])
    done_route = mock_supabase.get(f"{REST}/posts", params={"status": "eq.done"}).respond(
        json=[done]
    )
    resp = (await sb.get("/v1/roadmap")).json()
    assert [i["title"] for i in resp["planned"]] == ["A plan"]
    assert resp["in_progress"] == [] and [i["title"] for i in resp["done"]] == ["Shipped"]
    assert done_route.calls.last.request.url.params["limit"] == "50"


async def test_deadlock_is_retried_once(sb, mock_supabase):
    route = mock_supabase.post(f"{REST}/rpc/list_posts").mock(
        side_effect=[
            httpx.Response(500, json={"code": "40P01", "message": "deadlock detected"}),
            httpx.Response(200, json=[]),
        ]
    )
    resp = await sb.get("/v1/posts")
    assert resp.status_code == 200 and route.call_count == 2


async def test_db_rate_limit_maps_to_429(sb, mock_supabase, keys: Keys):
    mock_supabase.post(f"{REST}/posts").respond(
        400, json={"code": "P0001", "message": "rate_limited"}
    )
    resp = await sb.post(
        "/v1/posts", json={"title": "Another idea", "category": "bug"}, headers=bearer(keys.token())
    )
    assert resp.status_code == 429 and resp.json()["error"]["code"] == "rate_limited"


async def test_expired_session_at_postgrest_maps_to_401(sb, mock_supabase, keys: Keys):
    mock_supabase.post(f"{REST}/rpc/list_posts").respond(
        401, json={"code": "PGRST303", "message": "JWT expired"}
    )
    resp = await sb.get("/v1/posts", headers=bearer(keys.token()))
    assert resp.status_code == 401


async def test_upstream_outage_maps_to_502(sb, mock_supabase):
    mock_supabase.post(f"{REST}/rpc/list_posts").mock(side_effect=httpx.ConnectError("down"))
    resp = await sb.get("/v1/posts")
    assert resp.status_code == 502
    assert resp.json()["error"]["code"] == "upstream_unavailable"
