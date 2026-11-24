# Security

## Keys in this repository

The only Supabase key Soundings uses is the **publishable** key (`sb_publishable_…`). It is designed to be public, and on its own it can only do what Row Level Security allows a signed-out visitor to do, which is read public data.

There is **no secret or service-role key and no database password** anywhere in this project: not in the API, the web app, CI or this repository. The FastAPI service forwards each user's own JWT to the database instead of using a privileged key.

## How data is protected

- **Row Level Security on every table.** Members can only create and change their own rows. Status changes, pinning, merging and deleting other people's content are admin-only, checked by a `security definer` function with an empty `search_path`.
- **Column-level grants and guard triggers.** The API roles can only write specific columns. Authors, counters and merge links can't be forged, and nobody can change a role through the API.
- **Private votes.** Vote counts are public, but who voted for what is only visible to the voter and admins.
- **Rate limits** on writes, enforced both in the API and in the database.
- **Strict token verification** in the API:
  - Asymmetric algorithms only, checked against the project's JWKS.
  - Expiry, audience and issuer are checked.
  - `HS256` and `none` are refused.
  - JWKS refetches are capped.
- **Locked-down CORS.** Only the configured web origin can call the API from a browser.
- **Demo mode** (no auth, in-memory data) can't run when Supabase is configured, and the API refuses to start in demo mode on Vercel production.
- **Safe redirects.** The sign-in callback only redirects to same-site paths.

## Reporting a vulnerability

Please don't open a public issue with exploit details. Use GitHub's **Report a vulnerability** button on this repository's Security tab, or open an issue asking for a private contact.
