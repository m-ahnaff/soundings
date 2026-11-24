# Deployment

The live setup is two Vercel projects plus one Supabase project:

| Piece | Where | Live URL |
|---|---|---|
| `web/` | Vercel project `soundings` | https://soundings-m-ahnaff.vercel.app |
| `api/` | Vercel project `soundings-api` (Python runtime) | https://soundings-api.vercel.app |
| Database + Auth | Supabase project | — |

## 1. Supabase

1. Create a project at [supabase.com](https://supabase.com). The free plan is enough.
2. Open **SQL Editor → New query**, paste the whole of [`supabase/schema.sql`](../supabase/schema.sql), and click **Run**.
   - Supabase warns about "destructive operations". The script only drops and recreates its own policies and triggers so it can be re-run safely.
   - You should see *Success. No rows returned*.
3. Under **Project Settings → API Keys**, copy the **Project URL** and the **Publishable key** (`sb_publishable_…`).
   - Never use the secret key. Nothing in this project needs it.
4. The project must use the default **asymmetric JWT signing keys**, so that `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json` lists at least one key. The API verifies tokens against it.

## 2. API on Vercel

```bash
cd api
vercel link --project soundings-api
printf '%s' 'https://<ref>.supabase.co'       | vercel env add SUPABASE_URL production
printf '%s' 'sb_publishable_…'                | vercel env add SUPABASE_PUBLISHABLE_KEY production
printf '%s' 'https://<your-web-domain>'       | vercel env add CORS_ORIGINS production
vercel deploy --prod
```

- `vercel.json` builds `index.py` with `@vercel/python` and sends every path to the FastAPI app.
- `requirements.txt` is generated from `uv.lock` (`uv export --no-dev --no-hashes -o requirements.txt`).
- Check: `curl https://<api>/healthz` should return `{"ok":true,"mode":"supabase"}`.

## 3. Web on Vercel

```bash
cd web
vercel link --project soundings
printf '%s' 'https://<ref>.supabase.co'  | vercel env add NEXT_PUBLIC_SUPABASE_URL production
printf '%s' 'sb_publishable_…'           | vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY production
printf '%s' 'https://<your-api-domain>'  | vercel env add NEXT_PUBLIC_API_URL production
printf '%s' 'Soundings'                  | vercel env add NEXT_PUBLIC_BOARD_NAME production   # optional
vercel deploy --prod
```

`NEXT_PUBLIC_*` values are baked in at build time, so redeploy after changing them.

## 4. Connect auth

In Supabase, go to **Authentication → URL Configuration**:

| Setting | Value |
|---|---|
| Site URL | `https://<your-web-domain>` |
| Redirect URLs | `https://<your-web-domain>/**` and `http://localhost:3100/**` |

Then make sure the API's `CORS_ORIGINS` contains the exact web origin.

## 5. Make yourself an admin

Sign up on the site, confirm your email, then run this in the SQL Editor:

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'you@example.com');
```

Roles can only be changed this way. The API and the database both block users from changing their own role.

## Automatic deploys from GitHub (optional)

In each Vercel project, go to **Settings → Git**, connect this repository, and set the **Root Directory** to `web` or `api` respectively. Every push to `main` then redeploys, and pull requests get preview URLs. If you use preview URLs, add them to `CORS_ORIGINS` and to the Supabase redirect URLs.

## Email limits

Supabase's built-in email sender is for testing and only sends a few emails per hour. For real use, set up custom SMTP under **Authentication → Emails → SMTP Settings**.
