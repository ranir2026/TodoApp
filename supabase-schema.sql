create table if not exists public.app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  todos jsonb not null default '[]'::jsonb,
  courses jsonb not null default '[]'::jsonb,
  quick_links jsonb not null default '[]'::jsonb,
  planner jsonb not null default '{}'::jsonb,
  canvas jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_state add column if not exists quick_links jsonb not null default '[]'::jsonb;
alter table public.app_state add column if not exists planner jsonb not null default '{}'::jsonb;
-- Canvas calendar-feed settings: feeds, course mapping, tombstones. {} means never connected.
alter table public.app_state add column if not exists canvas jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_state'
  ) then
    alter publication supabase_realtime add table public.app_state;
  end if;
end $$;

alter table public.app_state enable row level security;

create policy "Users can read their own app state"
  on public.app_state for select
  using (auth.uid() = user_id);

create policy "Users can insert their own app state"
  on public.app_state for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own app state"
  on public.app_state for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Per-user rate limit for the canvas-feed Edge Function. The function calls
-- canvas_feed_allow() with the caller's own JWT, so auth.uid() is always the caller.
-- The table has RLS on and no policies: clients can't read or write it directly.
create table if not exists public.canvas_feed_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now()
);

create index if not exists canvas_feed_requests_user_time
  on public.canvas_feed_requests (user_id, requested_at);

alter table public.canvas_feed_requests enable row level security;

-- Limits are fixed here (not parameters), so calling this directly can only spend the
-- caller's own allowance: 30 feed fetches per 10 minutes.
create or replace function public.canvas_feed_allow()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  recent integer;
begin
  if caller is null then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtext('canvas_feed_allow:' || caller::text));
  delete from public.canvas_feed_requests
    where user_id = caller and requested_at < now() - interval '1 day';
  select count(*) into recent from public.canvas_feed_requests
    where user_id = caller and requested_at > now() - interval '10 minutes';
  if recent >= 30 then
    return false;
  end if;
  insert into public.canvas_feed_requests (user_id) values (caller);
  return true;
end;
$$;

revoke all on function public.canvas_feed_allow() from public, anon;
grant execute on function public.canvas_feed_allow() to authenticated;
