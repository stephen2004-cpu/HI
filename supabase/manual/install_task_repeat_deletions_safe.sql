-- LBD Focus V2: ONE-TIME safe installer for the existing Task repeat deletion migration.
-- Same objects as 202610310002_task_repeat_deletions.sql; NOT a second schema.
-- Review and approve, back up DATABASE, pause app writes on all devices first.
-- Paste this WHOLE file in the intended Supabase SQL Editor as postgres.
-- No Task/Habit/Focus/Calendar row is deleted or updated. Any error aborts the transaction.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
do $structure$
declare t text; expected text[]; actual text[]; policy_row record; compact text;
begin
 if current_user <> 'postgres' or not exists(select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then
  raise exception 'Use postgres SQL Editor role with RLS bypass for security-definer guards. No changes installed.';
 end if;
 if to_regclass('auth.users') is null or to_regprocedure('auth.uid()') is null then
  raise exception 'Supabase Auth schema missing. No changes installed.';
 end if;
 foreach t in array array['lbd_workspaces','lbd_tasks','lbd_calendar_blocks','lbd_habits','lbd_focus_sessions','lbd_reviews'] loop
  if to_regclass('public.' || t) is null then raise exception 'Missing base table %. No changes installed.',t; end if;
  if t='lbd_workspaces' then
   expected := array['preferences:jsonb:required','revision:bigint:required','run:jsonb:nullable','settings:jsonb:required','updated_at:timestamp with time zone:required','user_id:uuid:required'];
  else
   expected := array['id:text:required','payload:jsonb:required','user_id:uuid:required'];
  end if;
  select array_agg(attname || ':' || format_type(atttypid,atttypmod) || ':' || case when attnotnull then 'required' else 'nullable' end order by attname)
   into actual from pg_attribute where attrelid=to_regclass('public.' || t) and attnum>0 and not attisdropped;
  if actual is distinct from expected then raise exception 'Unexpected columns/types in %. No changes installed.',t; end if;
  if not exists(select 1 from pg_constraint where conrelid=to_regclass('public.' || t) and contype='p'
   and pg_get_constraintdef(oid)=case when t='lbd_workspaces' then 'PRIMARY KEY (user_id)' else 'PRIMARY KEY (user_id, id)' end) then
   raise exception 'Unexpected primary key in %. No changes installed.',t;
  end if;
  if not exists(select 1 from pg_constraint where conrelid=to_regclass('public.' || t) and contype='f'
    and confrelid=to_regclass('auth.users') and pg_get_constraintdef(oid)='FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE') then
   raise exception 'Unexpected Auth foreign key in %. No changes installed.',t;
  end if;
  if not exists(select 1 from pg_class where oid=to_regclass('public.' || t) and relrowsecurity and relforcerowsecurity)
    or (select count(*) from pg_policy where polrelid=to_regclass('public.' || t)) <> 1 then
   raise exception 'Unexpected RLS configuration in %. No changes installed.',t;
  end if;
  select * into policy_row from pg_policy where polrelid=to_regclass('public.' || t);
  if policy_row.polname <> 'owner_access' or policy_row.polcmd <> '*' or not policy_row.polpermissive
    or policy_row.polroles <> array[(select oid from pg_roles where rolname='authenticated')] then
   raise exception 'Unexpected owner policy in %. No changes installed.',t;
  end if;
  compact := lower(regexp_replace(pg_get_expr(policy_row.polqual,policy_row.polrelid),'[[:space:]()]','','g'));
  if compact is null or compact not in ('auth.uid=user_id','selectauth.uidasuid=user_id') then
   raise exception 'Unexpected RLS USING in %. No changes installed.',t;
  end if;
  compact := lower(regexp_replace(pg_get_expr(policy_row.polwithcheck,policy_row.polrelid),'[[:space:]()]','','g'));
  if compact is null or compact not in ('auth.uid=user_id','selectauth.uidasuid=user_id') then
   raise exception 'Unexpected RLS WITH CHECK in %. No changes installed.',t;
  end if;
 end loop;
 -- This migration never replaces workspace RPCs; both base and Habit-protected reads are compatible.
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.lbd_read_workspace()') and not prosecdef and prorettype='jsonb'::regtype)
  or not exists(select 1 from pg_proc where oid=to_regprocedure('public.lbd_commit_workspace(bigint,jsonb)') and not prosecdef and prorettype='bigint'::regtype) then
  raise exception 'Unexpected workspace RPC signature/security. No changes installed.';
 end if;
 if exists(select 1 from pg_trigger where tgrelid=to_regclass('public.lbd_tasks') and tgname='guard_deleted_repeat_task') then
  raise exception 'Task deletion protection already or partly installed. Stop and run diagnostics; do not drop objects.';
 end if;
 -- Reject name/overload collisions too; never treat partial installation as success.
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname in ('lbd_guard_deleted_repeat_task','lbd_task_repeat_capabilities','lbd_read_task_deletions')) then
  raise exception 'Task deletion protection already or partly installed. Stop and run diagnostics.';
 end if;
end $structure$;

-- A short write lock avoids concurrent sync writes during installation. Reads remain possible.
lock table public.lbd_workspaces, public.lbd_tasks, public.lbd_calendar_blocks,
 public.lbd_habits, public.lbd_focus_sessions, public.lbd_reviews in share row exclusive mode;

-- Only hash/count snapshots in a temporary table, removed at commit; no personal payload output.
create temporary table lbd_task_install_before(table_name text primary key, row_count bigint, digest text) on commit drop;
do $snapshot$
declare t text; n bigint; d text; ordering text;
begin
 foreach t in array array['lbd_workspaces','lbd_tasks','lbd_calendar_blocks','lbd_habits','lbd_focus_sessions','lbd_reviews'] loop
  ordering := case when t='lbd_workspaces' then 'user_id' else 'user_id,id' end;
  execute format($query$select count(*),md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' order by %s),'')) from public.%I r$query$,ordering,t) into n,d;
  insert into lbd_task_install_before values(t,n,d);
 end loop;
 if exists(select 1 from public.lbd_tasks where payload ? 'deletedAt' and
  (jsonb_typeof(payload->'repeatSeriesId') is distinct from 'string' or length(payload->>'repeatSeriesId')=0
   or payload->>'id' is distinct from id)) then
  raise exception 'An existing Task tombstone has invalid series/id metadata. No changes installed.';
 end if;
end $snapshot$;

-- BEGIN existing reviewed Task migration body (transaction wrapper handled here).
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
-- END existing Task migration body.
do $postflight$
declare s record; n bigint; d text; ordering text;
begin
 for s in select * from lbd_task_install_before loop
  ordering := case when s.table_name='lbd_workspaces' then 'user_id' else 'user_id,id' end;
  execute format($query$select count(*),md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' order by %s),'')) from public.%I r$query$,ordering,s.table_name) into n,d;
  if n is distinct from s.row_count or d is distinct from s.digest then
   raise exception 'Existing data changed in %. Rolling back installation.',s.table_name;
  end if;
 end loop;
 if not exists(select 1 from pg_class where oid='public.lbd_task_repeat_deletions'::regclass and relrowsecurity and relforcerowsecurity)
  or not has_function_privilege('authenticated','public.lbd_task_repeat_capabilities()','EXECUTE')
  or has_table_privilege('authenticated','public.lbd_task_repeat_deletions','INSERT,UPDATE,DELETE') then
  raise exception 'Task deletion protection permissions are unexpected. Rolling back installation.';
 end if;
 if not has_function_privilege('authenticated','public.lbd_read_task_deletions()','EXECUTE')
  or has_function_privilege('anon','public.lbd_read_task_deletions()','EXECUTE')
  or has_function_privilege('anon','public.lbd_task_repeat_capabilities()','EXECUTE')
  or has_table_privilege('anon','public.lbd_task_repeat_deletions','SELECT,INSERT,UPDATE,DELETE') then
  raise exception 'Task RPC/ledger permissions are unexpected. Rolling back installation.';
 end if;
 if (select count(*) from public.lbd_task_repeat_deletions) <> (select count(*) from public.lbd_tasks where payload?'deletedAt') then
  raise exception 'Task tombstone backfill is incomplete. Rolling back installation.';
 end if;
end $postflight$;

notify pgrst, 'reload schema';
commit;
select 'Task deletion protection installed; app rows unchanged. Run read-only diagnostics and test a temporary Task before deleting real work.' as result;
