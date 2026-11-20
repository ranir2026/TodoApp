-- The statements added for the public launch, to run once in the Supabase SQL editor on a project
-- that already has the rest of supabase-schema.sql. Safe to run again.

-- 1. Onboarding progress (Getting started, tips seen, What's new) is saved with the account
alter table public.app_state add column if not exists prefs jsonb not null default '{}'::jsonb;

-- 2. Deleting an account from Privacy and your data. It takes no arguments, so it can only delete
--    the signed-in caller; app_state and canvas_feed_requests go with it (on delete cascade).
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = caller;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- 3. Checks, read-only. Run each and compare with the expected result.

-- Every table in public has row-level security on. Expected: no rows.
select tablename from pg_tables where schemaname = 'public' and not rowsecurity;

-- The access rules. Expected: three on app_state (select, insert, update), each limited to
-- auth.uid() = user_id, and none on canvas_feed_requests (only its function writes to it).
select tablename, policyname, cmd, qual, with_check from pg_policies where schemaname = 'public' order by tablename, cmd;

-- Who can call the two functions. Expected: authenticated (and postgres/service_role), never anon.
select routine_name, grantee from information_schema.routine_privileges
where routine_schema = 'public' and routine_name in ('canvas_feed_allow', 'delete_my_account') order by routine_name, grantee;
