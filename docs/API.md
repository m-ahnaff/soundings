# API reference

- **Base URL:** `https://soundings-api.vercel.app`
- **Interactive docs (OpenAPI):** https://soundings-api.vercel.app/docs

## Authentication

Send the Supabase access token of the signed-in user:

```
Authorization: Bearer <supabase access token>
```

Read endpoints work without a token. Write endpoints return `401` without one, and admin endpoints return `403` for members.

## Errors

Every error has the same shape:

```json
{ "error": { "code": "locked", "message": "This post is locked now that the team has reviewed it.", "details": null } }
```

| Status | Typical `code` |
|---|---|
| 400 | `bad_request` (e.g. merging a post into itself) |
| 401 | `unauthorized` (missing, expired or foreign token) |
| 403 | `forbidden` (member calling an admin endpoint, editing someone else's post) |
| 404 | `not_found` |
| 409 | `locked`, `post_closed` (editing a reviewed post, voting on a merged one) |
| 422 | `validation_error`, with per-field `details` |
| 429 | `rate_limited` |

## Endpoints

### Meta
| Method | Path | Description |
|---|---|---|
| GET | `/healthz` | `{ "ok": true, "mode": "supabase" \| "demo" }` |

### Account
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/v1/me` | user | The signed-in user's profile and role |

### Posts
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/v1/posts` | — | List requests (see query parameters below) |
| POST | `/v1/posts` | user | Create a request: `{ "title", "body", "category" }` |
| GET | `/v1/posts/{id}` | — | One request |
| PATCH | `/v1/posts/{id}` | author | Edit `title` / `body` / `category` (only while under review) |
| DELETE | `/v1/posts/{id}` | author / admin | Delete (authors only while under review) |

`GET /v1/posts` query parameters:

| Param | Values |
|---|---|
| `status` | `open` (under review + planned + in progress), or one of `under_review`, `planned`, `in_progress`, `done`, `declined`, `merged` |
| `category` | `feature`, `bug`, `improvement` |
| `q` | Text search over title and description; `#119` or `119` matches the request number |
| `sort` | `top` (default), `new`, `trending` (votes in the last 7 days), `updated` |
| `mine` | `true` limits the list to the caller's own requests |
| `limit`, `offset` | Pagination (`limit` ≤ 50). The response includes `total` and `next_offset`. |

### Votes
| Method | Path | Auth | Description |
|---|---|---|---|
| PUT | `/v1/posts/{id}/vote` | user | Vote (idempotent) → `{ post_id, voted, vote_count }` |
| DELETE | `/v1/posts/{id}/vote` | user | Remove your vote (idempotent) |

### Comments and activity
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/v1/posts/{id}/activity` | — | Comments and history events, oldest first |
| POST | `/v1/posts/{id}/comments` | user | Add a comment: `{ "body" }` |
| DELETE | `/v1/comments/{id}` | author / admin | Delete a comment |

### Roadmap
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/v1/roadmap` | — | `{ planned: [...], in_progress: [...], done: [...] }`, ordered by votes |

### Admin
| Method | Path | Auth | Description |
|---|---|---|---|
| PATCH | `/v1/admin/posts/{id}` | admin | Change `status` and/or `pinned` |
| POST | `/v1/admin/posts/{id}/merge` | admin | Merge this post into another: `{ "target_id" }` |
| GET | `/v1/admin/stats` | admin | Dashboard numbers: totals, status breakdown, top 10, posts per week |

## Example

```bash
# Public: top open requests
curl "https://soundings-api.vercel.app/v1/posts?status=open&sort=top&limit=5"

# Signed in: vote on a request
curl -X PUT "https://soundings-api.vercel.app/v1/posts/<id>/vote" \
  -H "Authorization: Bearer $TOKEN"
```
