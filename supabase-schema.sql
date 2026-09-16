create table if not exists public.app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  todos jsonb not null default '[]'::jsonb,
  courses jsonb not null default '[]'::jsonb,
  quick_links jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_state add column if not exists quick_links jsonb not null default '[]'::jsonb;

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
