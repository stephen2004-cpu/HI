-- OPTIONAL REQUIRED HARDENING for account deletion of recurring Task instances.
-- Review/approve and back up the target database BEFORE applying. No real data is deleted.
-- Independent of Habit deletion migration: does not replace lbd_read_workspace/commit.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $preflight$
begin
 if current_user<>'postgres' or not exists(select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then raise exception 'Use the postgres SQL Editor role with RLS bypass for security-definer guards.'; end if;
 if to_regclass('public.lbd_tasks') is null or to_regprocedure('auth.uid()') is null then raise exception 'Base Task/Auth schema missing.'; end if;
 if not exists(select 1 from pg_class where oid='public.lbd_tasks'::regclass and relrowsecurity and relforcerowsecurity) then raise exception 'Task owner RLS must already be enabled and forced.'; end if;
 if not exists(select 1 from pg_attribute where attrelid='public.lbd_tasks'::regclass and attname='payload' and atttypid='jsonb'::regtype and not attisdropped) then raise exception 'Unexpected Task payload schema.'; end if;
 if to_regclass('public.lbd_task_repeat_deletions') is not null or to_regprocedure('public.lbd_task_repeat_capabilities()') is not null or to_regprocedure('public.lbd_guard_deleted_repeat_task()') is not null or to_regprocedure('public.lbd_read_task_deletions()') is not null then raise exception 'Task deletion protection already or partly installed. Review, do not drop objects.'; end if;
 if exists(select 1 from public.lbd_tasks where payload?'deletedAt' and case when jsonb_typeof(payload->'deletedAt')='number' then (payload->>'deletedAt')::numeric<=0 or (payload->>'deletedAt')::numeric>9007199254740991 or trunc((payload->>'deletedAt')::numeric)<>(payload->>'deletedAt')::numeric else true end) then raise exception 'Invalid existing Task tombstone. Stop and review data.'; end if;
end $preflight$;
create table public.lbd_task_repeat_deletions(
 user_id uuid not null references auth.users(id) on delete cascade,
 id text not null,
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 primary key(user_id,id)
);
alter table public.lbd_task_repeat_deletions enable row level security;
alter table public.lbd_task_repeat_deletions force row level security;
revoke all on public.lbd_task_repeat_deletions from public,anon,authenticated;
grant select on public.lbd_task_repeat_deletions to authenticated;
create policy owner_read on public.lbd_task_repeat_deletions for select to authenticated using((select auth.uid())=user_id);
create function public.lbd_guard_deleted_repeat_task() returns trigger language plpgsql security definer set search_path='' as $$
declare dead jsonb;
begin
 if auth.uid() is null or new.user_id<>auth.uid() then raise exception 'Owner required' using errcode='42501'; end if;
 select payload into dead from public.lbd_task_repeat_deletions where user_id=new.user_id and id=new.id;
 if dead is not null then new.payload:=dead; return new; end if;
 if new.payload?'deletedAt' then
  if jsonb_typeof(new.payload->'deletedAt') is distinct from 'number' or (new.payload->>'deletedAt')::numeric<=0 or (new.payload->>'deletedAt')::numeric>9007199254740991 or trunc((new.payload->>'deletedAt')::numeric)<>(new.payload->>'deletedAt')::numeric or jsonb_typeof(new.payload->'repeatSeriesId') is distinct from 'string' or length(new.payload->>'repeatSeriesId')=0 then raise exception 'Invalid Task tombstone' using errcode='22023'; end if;
  insert into public.lbd_task_repeat_deletions(user_id,id,payload) values(new.user_id,new.id,new.payload) on conflict do nothing;
  select payload into new.payload from public.lbd_task_repeat_deletions where user_id=new.user_id and id=new.id;
 end if;
 return new;
end $$;
revoke all on function public.lbd_guard_deleted_repeat_task() from public,anon,authenticated;
create trigger guard_deleted_repeat_task before insert or update on public.lbd_tasks for each row execute function public.lbd_guard_deleted_repeat_task();
insert into public.lbd_task_repeat_deletions(user_id,id,payload) select user_id,id,payload from public.lbd_tasks where payload?'deletedAt' and jsonb_typeof(payload->'repeatSeriesId')='string' on conflict do nothing;
create function public.lbd_read_task_deletions() returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(payload order by id) from public.lbd_task_repeat_deletions where user_id=auth.uid()),'[]'::jsonb);
end $$;
revoke all on function public.lbd_read_task_deletions() from public,anon;
grant execute on function public.lbd_read_task_deletions() to authenticated;
create function public.lbd_task_repeat_capabilities() returns integer language sql stable security invoker set search_path='' as $$ select case when auth.uid() is not null then 1 else 0 end $$;
revoke all on function public.lbd_task_repeat_capabilities() from public,anon;
grant execute on function public.lbd_task_repeat_capabilities() to authenticated;
notify pgrst,'reload schema';
commit;
