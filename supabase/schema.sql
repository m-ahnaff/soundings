-- =============================================================================
-- Soundings: feedback board + public roadmap
-- Paste into the Supabase SQL editor and run. Safe to run more than once.
--
-- Security model
--   * The API forwards each user's own JWT to PostgREST, so every rule below
--     is enforced by Postgres itself. There is no service-role key in the app.
--   * Everyone (anon included) can read posts, comments, events and profiles.
--   * Members write their own rows. Post content is editable/deletable by its
--     author only while status = 'under_review'.
--   * Status, pinning, merging and deleting others' content is admin-only,
--     checked by public.is_admin() (security definer, empty search_path).
--   * Nobody can change a role through the API. Promote admins here:
--
--   update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'you@example.com');
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  role         text not null default 'member' check (role in ('member', 'admin')),
  created_at   timestamptz not null default now()
);

create table if not exists public.posts (
  id            uuid primary key default gen_random_uuid(),
  number        bigint generated always as identity (start with 101) unique,
  author_id     uuid default auth.uid()
                constraint posts_author_id_fkey references public.profiles (id) on delete set null,
  title         text not null check (char_length(title) between 4 and 140),
  body          text not null default '' check (char_length(body) <= 5000),
  category      text not null check (category in ('feature', 'bug', 'improvement')),
  status        text not null default 'under_review'
                check (status in ('under_review', 'planned', 'in_progress', 'done', 'declined', 'merged')),
  pinned        boolean not null default false,
  merged_into   uuid constraint posts_merged_into_fkey references public.posts (id) on delete set null,
  vote_count    integer not null default 0 check (vote_count >= 0),
  comment_count integer not null default 0 check (comment_count >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint posts_merge_shape check (merged_into is null or (status = 'merged' and merged_into <> id))
);

create table if not exists public.votes (
  post_id    uuid not null constraint votes_post_id_fkey references public.posts (id) on delete cascade,
  user_id    uuid not null default auth.uid()
             constraint votes_user_id_fkey references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null constraint comments_post_id_fkey references public.posts (id) on delete cascade,
  author_id  uuid default auth.uid()
             constraint comments_author_id_fkey references public.profiles (id) on delete set null,
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.post_events (
  id              uuid primary key default gen_random_uuid(),
  post_id         uuid not null constraint post_events_post_id_fkey references public.posts (id) on delete cascade,
  actor_id        uuid constraint post_events_actor_id_fkey references public.profiles (id) on delete set null,
  kind            text not null
                  check (kind in ('status_changed', 'merged_from', 'merged_into', 'pinned', 'unpinned')),
  from_status     text,
  to_status       text,
  related_post_id uuid constraint post_events_related_post_id_fkey references public.posts (id) on delete set null,
  created_at      timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Indexes for the list, roadmap, trending and dashboard queries
-- -----------------------------------------------------------------------------
create index if not exists posts_status_votes_idx  on public.posts (status, vote_count desc, created_at desc);
create index if not exists posts_votes_idx         on public.posts (vote_count desc, created_at desc);
create index if not exists posts_created_idx       on public.posts (created_at desc);
create index if not exists posts_category_idx      on public.posts (category);
create index if not exists posts_author_idx        on public.posts (author_id);
create index if not exists posts_merged_into_idx   on public.posts (merged_into) where merged_into is not null;
create index if not exists posts_title_trgm_idx    on public.posts using gin (title extensions.gin_trgm_ops);
create index if not exists posts_body_trgm_idx     on public.posts using gin (body extensions.gin_trgm_ops);
create index if not exists votes_user_idx          on public.votes (user_id);
create index if not exists votes_created_idx       on public.votes (created_at desc, post_id);
create index if not exists comments_post_idx       on public.comments (post_id, created_at);
create index if not exists comments_author_idx     on public.comments (author_id);
create index if not exists post_events_post_idx    on public.post_events (post_id, created_at);
create index if not exists post_events_actor_idx   on public.post_events (actor_id);
create index if not exists post_events_related_idx on public.post_events (related_post_id);

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;

-- True when the statement comes from an API user (PostgREST roles), false when
-- it comes from a security-definer function/trigger owned by postgres or from
-- the SQL editor.
create or replace function public.is_api_role()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user in ('anon', 'authenticated');
$$;

-- -----------------------------------------------------------------------------
-- Profiles: created on sign-up, role is never writable through the API
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      -- Never derive a public name from the email address.
      'Member ' || left(replace(new.id::text, '-', ''), 4)
    ), 60)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_api_role() and (new.role is distinct from old.role or new.id <> old.id) then
    raise exception 'protected_column' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.profiles_guard();

-- -----------------------------------------------------------------------------
-- Posts: column guard, author auto-vote, activity log
-- -----------------------------------------------------------------------------
create or replace function public.posts_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_api_role() then
    return new;  -- counters, merge_post() and the SQL editor
  end if;

  if tg_op = 'INSERT' then
    new.author_id     := auth.uid();
    new.status        := 'under_review';
    new.pinned        := false;
    new.merged_into   := null;
    new.vote_count    := 0;
    new.comment_count := 0;
    new.created_at    := now();
    new.updated_at    := now();
    return new;
  end if;

  if new.id <> old.id
     or new.number <> old.number
     or new.author_id is distinct from old.author_id
     or new.created_at <> old.created_at
     or new.vote_count <> old.vote_count
     or new.comment_count <> old.comment_count
     or new.merged_into is distinct from old.merged_into then
    raise exception 'protected_column' using errcode = '42501';
  end if;

  if (new.status <> old.status or new.pinned <> old.pinned) and not public.is_admin() then
    raise exception 'protected_column' using errcode = '42501';
  end if;

  if old.status = 'merged' and new is distinct from old then
    raise exception 'post_closed' using errcode = 'P0001';
  end if;

  if new.status = 'merged' and old.status <> 'merged' then
    raise exception 'use_merge_post' using errcode = 'P0001';
  end if;

  new.updated_at := now();  -- content, status or pin changed through the API
  return new;
end;
$$;

drop trigger if exists posts_guard on public.posts;
create trigger posts_guard
  before insert or update on public.posts
  for each row execute function public.posts_guard();

-- Deleting a post that others were merged into would silently drop the moved
-- votes and orphan the duplicates, so only admins may do it, and the
-- duplicates are reopened as declined instead of pointing nowhere.
create or replace function public.posts_before_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.posts c where c.merged_into = old.id) then
    if not public.is_admin() and auth.uid() is not null then
      raise exception 'has_merges' using errcode = 'P0001';
    end if;
    update public.posts set status = 'declined', merged_into = null where merged_into = old.id;
  end if;
  return old;
end;
$$;

drop trigger if exists posts_before_delete on public.posts;
create trigger posts_before_delete
  before delete on public.posts
  for each row execute function public.posts_before_delete();

-- Write budget enforced in the database (the API's limiter is per instance and
-- members could call PostgREST directly): 5 posts / 10 comments per minute.
create or replace function public.write_budget()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
begin
  if (select auth.uid()) is null or public.is_admin() then
    return new;
  end if;
  if tg_table_name = 'posts' then
    select count(*) into recent from public.posts
     where author_id = (select auth.uid()) and created_at > now() - interval '1 minute';
    if recent >= 5 then raise exception 'rate_limited' using errcode = 'P0001'; end if;
  else
    select count(*) into recent from public.comments
     where author_id = (select auth.uid()) and created_at > now() - interval '1 minute';
    if recent >= 10 then raise exception 'rate_limited' using errcode = 'P0001'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists posts_write_budget on public.posts;
create trigger posts_write_budget
  before insert on public.posts
  for each row execute function public.write_budget();

drop trigger if exists comments_write_budget on public.comments;
create trigger comments_write_budget
  before insert on public.comments
  for each row execute function public.write_budget();

create or replace function public.posts_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.author_id is not null then
    insert into public.votes (post_id, user_id) values (new.id, new.author_id)
    on conflict do nothing;
  end if;
  return null;
end;
$$;

drop trigger if exists posts_after_insert on public.posts;
create trigger posts_after_insert
  after insert on public.posts
  for each row execute function public.posts_after_insert();

create or replace function public.posts_log_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'merged' then
    return null;  -- merge_post() writes its own events
  end if;
  if new.status is distinct from old.status then
    insert into public.post_events (post_id, actor_id, kind, from_status, to_status)
    values (new.id, auth.uid(), 'status_changed', old.status, new.status);
  end if;
  if new.pinned is distinct from old.pinned then
    insert into public.post_events (post_id, actor_id, kind)
    values (new.id, auth.uid(), case when new.pinned then 'pinned' else 'unpinned' end);
  end if;
  return null;
end;
$$;

drop trigger if exists posts_log_changes on public.posts;
create trigger posts_log_changes
  after update of status, pinned on public.posts
  for each row execute function public.posts_log_changes();

-- -----------------------------------------------------------------------------
-- Votes: closed posts reject votes, counter kept by trigger
-- -----------------------------------------------------------------------------
create or replace function public.votes_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_status text;
begin
  -- Row lock waits for a concurrent merge_post() holding FOR UPDATE, then
  -- re-reads the committed status, so no vote can land on a merged post.
  -- FOR NO KEY UPDATE (not FOR SHARE) so two concurrent voters queue instead of
  -- deadlocking when votes_sync_count() updates the same row.
  select p.status into post_status from public.posts p where p.id = new.post_id for no key update;
  if post_status = 'merged' then
    raise exception 'post_closed' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists votes_guard on public.votes;
create trigger votes_guard
  before insert on public.votes
  for each row execute function public.votes_guard();

create or replace function public.votes_sync_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set vote_count = vote_count + 1 where id = new.post_id;
  else
    update public.posts set vote_count = greatest(vote_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$;

drop trigger if exists votes_sync_count on public.votes;
create trigger votes_sync_count
  after insert or delete on public.votes
  for each row execute function public.votes_sync_count();

-- -----------------------------------------------------------------------------
-- Comments: counter kept by trigger, author forced to the caller
-- -----------------------------------------------------------------------------
create or replace function public.comments_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_api_role() then
    if tg_op = 'INSERT' then
      new.author_id  := auth.uid();
      new.created_at := now();
    elsif new.post_id <> old.post_id or new.author_id is distinct from old.author_id then
      raise exception 'protected_column' using errcode = '42501';
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists comments_guard on public.comments;
create trigger comments_guard
  before insert or update on public.comments
  for each row execute function public.comments_guard();

create or replace function public.comments_sync_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- A new comment counts as activity for "Recently updated".
    update public.posts set comment_count = comment_count + 1, updated_at = now() where id = new.post_id;
  else
    update public.posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$;

drop trigger if exists comments_sync_count on public.comments;
create trigger comments_sync_count
  after insert or delete on public.comments
  for each row execute function public.comments_sync_count();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles    enable row level security;
alter table public.posts       enable row level security;
alter table public.votes       enable row level security;
alter table public.comments    enable row level security;
alter table public.post_events enable row level security;

-- profiles
drop policy if exists "profiles are public" on public.profiles;
create policy "profiles are public" on public.profiles
  for select to anon, authenticated using (true);

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- posts
drop policy if exists "posts are public" on public.posts;
create policy "posts are public" on public.posts
  for select to anon, authenticated using (true);

drop policy if exists "members create own posts" on public.posts;
create policy "members create own posts" on public.posts
  for insert to authenticated
  with check (author_id = (select auth.uid()) and status = 'under_review');

drop policy if exists "authors edit while under review, admins always" on public.posts;
create policy "authors edit while under review, admins always" on public.posts
  for update to authenticated
  using (
    (select public.is_admin())
    or (author_id = (select auth.uid()) and status = 'under_review')
  )
  with check (
    (select public.is_admin())
    or (author_id = (select auth.uid()) and status = 'under_review')
  );

drop policy if exists "authors delete while under review, admins always" on public.posts;
create policy "authors delete while under review, admins always" on public.posts
  for delete to authenticated
  using (
    (select public.is_admin())
    or (author_id = (select auth.uid()) and status = 'under_review')
  );

-- votes: who-voted-for-what stays private; counts are public on posts.vote_count
drop policy if exists "users see own votes" on public.votes;
create policy "users see own votes" on public.votes
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "users cast own votes" on public.votes;
create policy "users cast own votes" on public.votes
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "users remove own votes" on public.votes;
create policy "users remove own votes" on public.votes
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- comments
drop policy if exists "comments are public" on public.comments;
create policy "comments are public" on public.comments
  for select to anon, authenticated using (true);

drop policy if exists "members comment on open posts" on public.comments;
create policy "members comment on open posts" on public.comments
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (select 1 from public.posts p where p.id = post_id and p.status <> 'merged')
  );

drop policy if exists "authors edit own comments" on public.comments;
create policy "authors edit own comments" on public.comments
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

drop policy if exists "authors or admins delete comments" on public.comments;
create policy "authors or admins delete comments" on public.comments
  for delete to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()));

-- post_events: read-only to everyone; written only by security-definer code
drop policy if exists "events are public" on public.post_events;
create policy "events are public" on public.post_events
  for select to anon, authenticated using (true);

-- -----------------------------------------------------------------------------
-- Grants: anon is read-only, authenticated gets only the columns it may write
-- -----------------------------------------------------------------------------
revoke all on public.profiles, public.posts, public.votes, public.comments, public.post_events
  from anon, authenticated;

grant select on public.profiles, public.posts, public.comments, public.post_events
  to anon, authenticated;

grant update (display_name) on public.profiles to authenticated;
grant insert (title, body, category) on public.posts to authenticated;
grant update (title, body, category, status, pinned) on public.posts to authenticated;
grant delete on public.posts to authenticated;
grant select, delete on public.votes to authenticated;
grant insert (post_id, user_id) on public.votes to authenticated;
grant insert (post_id, body) on public.comments to authenticated;
grant update (body) on public.comments to authenticated;
grant delete on public.comments to authenticated;

-- -----------------------------------------------------------------------------
-- RPCs
-- -----------------------------------------------------------------------------

-- Votes cast in the last N days per post (aggregate only, no voter identities).
create or replace function public.recent_vote_counts(p_days integer default 7)
returns table (post_id uuid, n bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select v.post_id, count(*)::bigint
  from public.votes v
  where v.created_at >= now() - make_interval(days => least(greatest(p_days, 1), 90))
  group by v.post_id;
$$;

-- Earlier versions had no p_author parameter; drop that signature so the
-- function isn't left overloaded when re-running this script.
drop function if exists public.list_posts(text, text, text, text, integer, integer);

-- Board listing: filter, search, sort (top | new | trending | updated), paginate.
-- Runs as the caller, so RLS applies; has_voted uses the caller's own votes.
create or replace function public.list_posts(
  p_status   text    default null,
  p_category text    default null,
  p_q        text    default null,
  p_sort     text    default 'top',
  p_limit    integer default 20,
  p_offset   integer default 0,
  p_author   uuid    default null
)
returns table (
  id uuid, number bigint, title text, body text, category text, status text,
  pinned boolean, vote_count integer, comment_count integer,
  created_at timestamptz, updated_at timestamptz,
  author_id uuid, author_name text, author_role text, merged_into uuid,
  has_voted boolean, recent_votes bigint, total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with args as (
    select
      nullif(trim(p_q), '') as q,
      '%' || replace(replace(replace(coalesce(trim(p_q), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern,
      substring(coalesce(trim(p_q), '') from '^#?([0-9]{1,12})$')::bigint as num
  ),
  filtered as (
    select p.*
    from public.posts p, args a
    where case
            when p_status is null then p.status <> 'merged'
            when p_status = 'open' then p.status in ('under_review', 'planned', 'in_progress')
            else p.status = p_status
          end
      and (p_category is null or p.category = p_category)
      and (p_author is null or p.author_id = p_author)
      and (a.q is null or p.title ilike a.pattern or p.body ilike a.pattern or p.number = a.num)
  ),
  scored as (
    select f.*, coalesce(r.n, 0)::bigint as recent_votes, count(*) over ()::bigint as total_count
    from filtered f
    left join public.recent_vote_counts(7) r on r.post_id = f.id
  )
  select
    s.id, s.number, s.title, left(s.body, 300), s.category, s.status, s.pinned, s.vote_count,
    s.comment_count, s.created_at, s.updated_at,
    s.author_id, pr.display_name, pr.role, s.merged_into,
    exists (
      select 1 from public.votes v where v.post_id = s.id and v.user_id = (select auth.uid())
    ),
    s.recent_votes, s.total_count
  from scored s
  left join public.profiles pr on pr.id = s.author_id
  cross join args a
  order by
    case when a.q is null and p_sort <> 'updated' and s.pinned then 0 else 1 end,
    case when p_sort = 'trending' then s.recent_votes end desc nulls last,
    case when p_sort = 'new' then s.created_at end desc nulls last,
    case when p_sort = 'updated' then s.updated_at end desc nulls last,
    s.vote_count desc,
    s.created_at desc,
    s.number
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- Merge a duplicate into another post. Moves votes without double counting,
-- closes the duplicate with a link, and logs both sides. Admins only.
create or replace function public.merge_post(p_source uuid, p_target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  src public.posts;
  dst public.posts;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if p_source = p_target then
    raise exception 'same_post' using errcode = 'P0001';
  end if;

  -- Lock both rows in a fixed order so concurrent merges can't deadlock.
  perform 1 from public.posts where id in (p_source, p_target) order by id for update;

  select * into src from public.posts where id = p_source;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into dst from public.posts where id = p_target;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if src.status = 'merged' then raise exception 'already_merged' using errcode = 'P0001'; end if;
  if dst.status = 'merged' then raise exception 'target_merged' using errcode = 'P0001'; end if;

  insert into public.votes (post_id, user_id, created_at)
  select p_target, v.user_id, v.created_at from public.votes v where v.post_id = p_source
  on conflict (post_id, user_id) do nothing;

  delete from public.votes where post_id = p_source;

  update public.posts
     set status = 'merged', merged_into = p_target, pinned = false, updated_at = now()
   where id = p_source;

  -- Anything previously merged into the source now points at the new target.
  update public.posts set merged_into = p_target where merged_into = p_source;

  insert into public.post_events (post_id, actor_id, kind, related_post_id)
  values (p_source, auth.uid(), 'merged_into', p_target),
         (p_target, auth.uid(), 'merged_from', p_source);
end;
$$;

-- Dashboard numbers in one round trip. Admins only.
create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'total_posts',    (select count(*) from public.posts where status <> 'merged'),
    'total_votes',    (select count(*) from public.votes),
    'total_comments', (select count(*) from public.comments),
    'new_posts_week', (select count(*) from public.posts where created_at >= now() - interval '7 days'),
    'votes_week',     (select count(*) from public.votes where created_at >= now() - interval '7 days'),
    'status_breakdown', coalesce(
      (select jsonb_object_agg(s.status, s.n)
         from (select status, count(*) as n from public.posts group by status) s),
      '{}'::jsonb),
    'top_posts', coalesce(
      (select jsonb_agg(t order by t.vote_count desc, t.number)
         from (select id, number, title, category, status, vote_count, comment_count
                 from public.posts
                where status <> 'merged'
                order by vote_count desc, number
                limit 10) t),
      '[]'::jsonb),
    'posts_per_week', (
      select jsonb_agg(
               jsonb_build_object(
                 'week_start', to_char(w, 'YYYY-MM-DD'),
                 'count', (select count(*) from public.posts p
                            where p.created_at >= w and p.created_at < w + interval '7 days'))
               order by w)
        from generate_series(
               date_trunc('week', now()) - interval '7 weeks',
               date_trunc('week', now()),
               interval '1 week') as w)
  ) into result;

  return result;
end;
$$;

-- -----------------------------------------------------------------------------
-- Function privileges
-- -----------------------------------------------------------------------------
revoke execute on function
  public.handle_new_user(), public.profiles_guard(), public.posts_guard(),
  public.posts_after_insert(), public.posts_log_changes(), public.votes_guard(),
  public.votes_sync_count(), public.comments_guard(), public.comments_sync_count(),
  public.posts_before_delete(), public.write_budget()
  from public, anon, authenticated;

revoke execute on function public.merge_post(uuid, uuid), public.admin_stats() from public, anon;
grant execute on function public.merge_post(uuid, uuid), public.admin_stats() to authenticated;

grant execute on function
  public.is_admin(), public.is_api_role(), public.recent_vote_counts(integer),
  public.list_posts(text, text, text, text, integer, integer, uuid)
  to anon, authenticated;

-- Make PostgREST pick up the new/changed function signatures immediately.
notify pgrst, 'reload schema';
