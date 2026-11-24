# Soundings

A feedback board and public roadmap: members post and vote on requests, the team triages them on a Kanban board, and everyone can follow the roadmap.

- `web/` Next.js 16 (App Router, TypeScript, Tailwind v4), deploys as its own Vercel project
- `api/` FastAPI (Python 3.12), deploys as its own Vercel project
- `supabase/schema.sql` Postgres schema, Row Level Security, triggers and RPCs
- `docs/` documentation (to come)

## Run locally (demo mode, no Supabase needed)

```bash
# API on :8800 with a seeded in-memory store
cd api && uv sync && uv run uvicorn index:app --port 8800

# Web on :3100
cd web && npm install && npm run dev
```

Use the "View as" control in the demo bar to act as a signed-out visitor, a member or an admin.

Full documentation will follow.
