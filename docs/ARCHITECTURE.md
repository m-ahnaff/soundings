# Architecture

Soundings is split into three parts, each with one job:

| Part | Responsibility |
|---|---|
| **`web/`** (Next.js on Vercel) | UI, routing, sign-in and session refresh with Supabase Auth |
| **`api/`** (FastAPI on Vercel) | A typed, versioned HTTP API: validation, token checks, a clean error contract, and shaping data for the UI |
| **Supabase** (Postgres) | Data, plus the **rules about who may do what**, enforced by Row Level Security and triggers |

```
┌──────────┐  1. sign in (email+password / magic link)   ┌────────────────┐
│ Browser  │ ───────────────────────────────────────────►│ Supabase Auth  │
│          │ ◄── access token (JWT, ES256) ──────────────│                │
│          │                                              └────────────────┘
│          │  2. GET /v1/posts   Authorization: Bearer <JWT>
│          │ ─────────────────────────► ┌──────────────┐
└──────────┘                            │   FastAPI    │ 3. verify JWT with the project's JWKS
                                        │              │    (signature, exp, aud, iss)
                                        │              │ 4. call PostgREST with the SAME JWT
                                        └──────┬───────┘
                                               ▼
                                   ┌───────────────────────┐
                                   │ Postgres + RLS        │ 5. policies use auth.uid();
                                   │ triggers, RPCs        │    triggers guard columns
                                   └───────────────────────┘
```

## Why the API forwards the user's token

A common setup gives the backend a **service-role key** that bypasses all database security, so one API bug can expose or change any row. Soundings avoids that:

- FastAPI only has the **publishable** key, which is public and grants nothing on its own.
- Each request carries the **user's own JWT** through to PostgREST, so Postgres evaluates RLS as that user.
- The API's own checks (for example "admins only") are a fast first line with friendly error messages. Even if one were wrong, the database would still refuse.

## Authentication

- **Frontend:** `@supabase/ssr` keeps the session in cookies, and `src/proxy.ts` refreshes it on navigation. Magic links and email confirmations return through `/auth/callback`, which only redirects to same-site paths, so it can't be used as an open redirect.
- **API** (`app/auth.py`):
  - Fetches the signing keys from `{SUPABASE_URL}/auth/v1/.well-known/jwks.json` with PyJWT's `PyJWKClient` and caches them. An unknown key id triggers at most one refetch every 30 seconds, so junk tokens can't hammer the endpoint.
  - Accepts only asymmetric algorithms (ES256, RS256, EdDSA). `HS256` and `none` are refused.
  - Checks `aud=authenticated`, the expiry, the issuer, and that the token's algorithm matches its key. Anonymous-user tokens are rejected.

## Data model

| Table | Purpose |
|---|---|
| `profiles` | One row per user, created by a trigger at sign-up. `role` is `member` or `admin`; the display name never comes from the email address. |
| `posts` | Requests. `number` gives the `FB-<n>` key. Has `status`, `category`, `pinned`, `merged_into`, and trigger-maintained `vote_count` / `comment_count`. |
| `votes` | Primary key `(post_id, user_id)`, so at most one vote per person. |
| `comments` | Comments on a request. |
| `post_events` | Activity history: status changes, pins, merges. |

### Rules enforced in the database
- **Column guard:** on insert, the author, status and counters are forced to safe values. On update, only admins can change status or pin, and nobody can change the author, the counters or `merged_into` through the API.
- **Author auto-vote:** creating a request automatically adds the author's vote.
- **Vote guard:** `SELECT … FOR NO KEY UPDATE` on the post means votes can't land on a post that is being merged, and two people voting at once queue instead of deadlocking.
- **Merge (`merge_post` RPC):** admin-only. It locks both posts in a fixed order, moves votes with `ON CONFLICT DO NOTHING` so nobody is counted twice, re-points earlier merges, and logs both sides.
- **Write budget:** at most 5 posts and 10 comments per minute per user, enforced in Postgres, so calling PostgREST directly can't get around it.
- **Privacy:** vote counts are public, but who voted for what is only visible to that voter (and admins).

## The API

- Routes live under `/v1`, and `/docs` serves interactive OpenAPI docs. See [API.md](API.md).
- Requests and responses are pydantic models. Unknown fields are rejected, so a typo can't be silently ignored.
- Every error uses one shape: `{"error": {"code", "message", "details"}}`. Database errors (RLS denials, trigger exceptions, constraint violations) are translated into clear, human-readable messages.
- CORS only allows the origins listed in `CORS_ORIGINS`.

### Data layer
`app/repo/base.py` defines the interface, with two implementations:
- `postgrest.py` is the real Supabase implementation (httpx). It retries once on a deadlock.
- `memory.py` + `seed.py` is the demo-mode store with about 25 realistic requests. It's used automatically when `SUPABASE_URL` is unset, and the API refuses to start in that mode on Vercel production unless explicitly allowed.

## Frontend

- **Next.js App Router** with server components for data fetching, and client components for interactive parts like voting, drag-and-drop and dialogs.
- **URL as state:** filters, sorting, search and the open request (`?selectedIssue=`) live in the URL, so views can be shared and the browser's Back button behaves as expected.
- **Optimistic updates:** votes and status moves update instantly and roll back if the server refuses.
- **Accessibility:** semantic tables and landmarks, live announcements for votes and toasts, focus returning to the card you came from, keyboard alternatives for drag-and-drop, and AA contrast in both themes.

## Testing

- **API:** a pytest suite of 66 tests.
  - Auth: valid, expired, wrong audience, wrong issuer, unknown key, `HS256`/`none`, JWKS caching and outage.
  - Permissions for signed-out users, members and admins.
  - Votes, including idempotent and concurrent votes.
  - Merge rules, pagination, the error shape, and demo mode being impossible in production.
  - The PostgREST request and error contracts, mocked with respx.
- **Web:** ESLint, strict TypeScript and a production build.
- **CI:** GitHub Actions runs both on every push and pull request (`.github/workflows/ci.yml`).
- **Against the real database:** the schema was run on a real Supabase project, and the API was exercised against it before release. That caught one issue the mocks couldn't: signed-out listing needed table-level read access on `votes`. RLS still returns no rows, so who voted stays private.
