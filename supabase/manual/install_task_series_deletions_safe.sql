-- Add whole-series deletion protection using the EXISTING Task tombstone ledger.
-- Owner approval required before running on managed Supabase. Pause app writes.
-- No app rows are modified at install. Does NOT replace workspace/read RPCs or the conflict-retry fix.
-- Run this WHOLE file as postgres; unexpected source/schema/security refuses safely.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
do $preflight$
begin
 if current_user<>'postgres' or not exists(select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then raise exception 'Use postgres SQL Editor role. No changes installed.'; end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.lbd_commit_workspace(bigint,jsonb)') and not prosecdef and prorettype='bigint'::regtype and md5(regexp_replace(prosrc,'[[:space:]]','','g'))='3f50887f07c901afc81c32237eeb8a7e') then raise exception 'Commit RPC differs from the reviewed source. Stop; no changes installed.'; end if;
 if not has_function_privilege('authenticated','public.lbd_commit_workspace(bigint,jsonb)','EXECUTE') or has_function_privilege('anon','public.lbd_commit_workspace(bigint,jsonb)','EXECUTE') then raise exception 'Unexpected commit RPC permissions. Stop.'; end if;
 if to_regclass('public.lbd_habit_deletions') is null or to_regclass('public.lbd_task_repeat_deletions') is null then raise exception 'Install the reviewed deletion protections first. Stop.'; end if;
 if (select count(*) from pg_class where oid in (to_regclass('public.lbd_habit_deletions'),to_regclass('public.lbd_task_repeat_deletions')) and relrowsecurity and relforcerowsecurity)<>2 or has_table_privilege('authenticated','public.lbd_habit_deletions','INSERT,UPDATE,DELETE') or has_table_privilege('authenticated','public.lbd_task_repeat_deletions','INSERT,UPDATE,DELETE') then raise exception 'Unexpected deletion ledger RLS/permissions. Stop.'; end if;
 if not exists(select 1 from pg_trigger where tgrelid='public.lbd_calendar_blocks'::regclass and tgname='guard_deleted_habit_block' and tgenabled in ('O','A')) or not exists(select 1 from pg_trigger where tgrelid='public.lbd_habits'::regclass and tgname='guard_deleted_habit' and tgenabled in ('O','A')) or not exists(select 1 from pg_trigger where tgrelid='public.lbd_tasks'::regclass and tgname='guard_deleted_repeat_task' and tgenabled in ('O','A')) then raise exception 'Required deletion guard is not enabled. Stop.'; end if;

 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('lbd_task_series_deletion_capabilities','lbd_guard_deleted_task_block','lbd_finish_deleted_task_series')) or exists(select 1 from pg_trigger where tgrelid='public.lbd_calendar_blocks'::regclass and tgname='guard_deleted_task_block') or exists(select 1 from pg_trigger where tgrelid='public.lbd_tasks'::regclass and tgname in ('finish_deleted_task_series_insert','finish_deleted_task_series_update')) then raise exception 'Series deletion already or partly installed. Stop and run diagnostics.'; end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.lbd_guard_deleted_repeat_task()') and prosecdef and md5(regexp_replace(prosrc,'[[:space:]]','','g'))='f04848bd7dfa9b7f2fad1a27d21df44d') then raise exception 'Unexpected existing Task guard. Stop; no changes installed.'; end if;
end $preflight$;
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

end $structure$;
-- A short write lock avoids concurrent sync writes during installation. Reads remain possible.
lock table public.lbd_workspaces, public.lbd_tasks, public.lbd_calendar_blocks,
 public.lbd_habits, public.lbd_focus_sessions, public.lbd_reviews in share row exclusive mode;

-- Only hash/count snapshots in a temporary table, removed at commit; no personal payload output.
create temporary table lbd_sync_install_before(table_name text primary key, row_count bigint, digest text) on commit drop;
do $snapshot$
declare t text; n bigint; d text; ordering text;
begin
 foreach t in array array['lbd_workspaces','lbd_tasks','lbd_calendar_blocks','lbd_habits','lbd_focus_sessions','lbd_reviews','lbd_habit_deletions','lbd_task_repeat_deletions'] loop
  ordering := case when t='lbd_workspaces' then 'user_id' else 'user_id,id' end;
  execute format($query$select count(*),md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' order by %s),'')) from public.%I r$query$,ordering,t) into n,d;
  insert into lbd_sync_install_before values(t,n,d);
 end loop;
 if exists(select 1 from public.lbd_tasks where payload ? 'deletedAt' and
  (jsonb_typeof(payload->'repeatSeriesId') is distinct from 'string' or length(payload->>'repeatSeriesId')=0
   or payload->>'id' is distinct from id)) then
  raise exception 'An existing Task tombstone has invalid series/id metadata. No changes installed.';
 end if;
end $snapshot$;


create temporary table lbd_series_rpc_before on commit drop as
 select oid,proname,proowner,proacl::text as acl,proconfig,prosecdef,md5(regexp_replace(prosrc,'[[:space:]]','','g')) as body
 from pg_proc where oid in (
 'public.lbd_commit_workspace(bigint,jsonb)'::regprocedure,'public.lbd_read_workspace()'::regprocedure,
 'public.lbd_read_task_deletions()'::regprocedure,'public.lbd_task_repeat_capabilities()'::regprocedure,
 'public.lbd_guard_deleted_repeat_task()'::regprocedure,'public.lbd_guard_deleted_habit()'::regprocedure,
 'public.lbd_guard_deleted_habit_block()'::regprocedure);
create or replace function public.lbd_guard_deleted_repeat_task() returns trigger language plpgsql
security definer set search_path='' as $$
declare dead jsonb; series_dead jsonb; root_marker boolean;
begin
 if auth.uid() is null or new.user_id<>auth.uid() then raise exception 'Owner required' using errcode='42501'; end if;
 select payload into dead from public.lbd_task_repeat_deletions where user_id=new.user_id and id=new.id;
 if dead is not null then new.payload:=dead; return new; end if;
 if jsonb_typeof(new.payload->'repeatSeriesId')='string' then
  select payload into series_dead from public.lbd_task_repeat_deletions
   where user_id=new.user_id and id=new.payload->>'repeatSeriesId' and jsonb_typeof(payload->'repeat')='object' and payload?'deletedAt';
  if series_dead is not null then
   new.payload:=new.payload || jsonb_build_object('deletedAt',series_dead->'deletedAt');
  end if;
 end if;
 if new.payload?'deletedAt' then
  if jsonb_typeof(new.payload->'deletedAt') is distinct from 'number'
   or (new.payload->>'deletedAt')::numeric<=0 or (new.payload->>'deletedAt')::numeric>9007199254740991
   or trunc((new.payload->>'deletedAt')::numeric)<>(new.payload->>'deletedAt')::numeric
   or new.payload->>'id' is distinct from new.id then raise exception 'Invalid Task tombstone' using errcode='22023'; end if;
  root_marker:=jsonb_typeof(new.payload->'repeat')='object' and not (new.payload?'repeatSeriesId');
  if root_marker then
   if jsonb_typeof(new.payload->'repeat'->'rules') is distinct from 'array' or jsonb_array_length(new.payload->'repeat'->'rules')=0 then
    raise exception 'Invalid Task series tombstone' using errcode='22023';
   end if;
  elsif jsonb_typeof(new.payload->'repeatSeriesId') is distinct from 'string' or length(new.payload->>'repeatSeriesId')=0 then
   raise exception 'Invalid Task tombstone' using errcode='22023';
  end if;
  insert into public.lbd_task_repeat_deletions(user_id,id,payload) values(new.user_id,new.id,new.payload) on conflict do nothing;
  select payload into new.payload from public.lbd_task_repeat_deletions where user_id=new.user_id and id=new.id;
  -- Whole-series reconciliation runs AFTER the Task upsert statement. Updating
  -- sibling Tasks here would collide with the same multi-row ON CONFLICT write.
  if not root_marker and series_dead is null then
  update public.lbd_calendar_blocks b set payload=b.payload || '{"cancelled":true}'::jsonb
   where b.user_id=new.user_id and b.payload->>'cancelled' is distinct from 'true' and (
    b.payload->>'taskId'=new.id or b.payload->>'automaticTaskId'=new.id
    or (root_marker and (b.payload->>'recurringTaskId'=new.id or exists(
     select 1 from public.lbd_tasks child where child.user_id=new.user_id and child.payload->>'repeatSeriesId'=new.id
      and child.id in (b.payload->>'taskId',b.payload->>'automaticTaskId')
    )))
   );
  end if;
 end if;
 return new;
end $$;

create function public.lbd_guard_deleted_task_block() returns trigger language plpgsql
security definer set search_path='' as $$
begin
 if auth.uid() is null or new.user_id<>auth.uid() then raise exception 'Owner required' using errcode='42501'; end if;
 if exists(
  select 1 from public.lbd_task_repeat_deletions d where d.user_id=new.user_id
   and d.id in (new.payload->>'taskId',new.payload->>'automaticTaskId',new.payload->>'recurringTaskId')
   and d.payload?'deletedAt' and (
    d.id in (new.payload->>'taskId',new.payload->>'automaticTaskId') or jsonb_typeof(d.payload->'repeat')='object'
   )
 ) or exists(
  select 1 from public.lbd_tasks t join public.lbd_task_repeat_deletions d
   on d.user_id=t.user_id and d.id=t.payload->>'repeatSeriesId'
  where t.user_id=new.user_id and t.id in (new.payload->>'taskId',new.payload->>'automaticTaskId')
   and d.payload?'deletedAt' and jsonb_typeof(d.payload->'repeat')='object'
 ) then new.payload:=new.payload || '{"cancelled":true}'::jsonb; end if;
 return new;
end $$;
revoke all on function public.lbd_guard_deleted_task_block() from public,anon,authenticated;
create trigger guard_deleted_task_block before insert or update on public.lbd_calendar_blocks
 for each row execute function public.lbd_guard_deleted_task_block();

-- Transition tables restrict work to deleted series actually touched by this
-- statement. Nested sibling reconciliation does not recurse or rescan Calendar.
create function public.lbd_finish_deleted_task_series() returns trigger language plpgsql
security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
 if pg_trigger_depth()>1 then return null; end if;
 if uid is null then raise exception 'Owner required' using errcode='42501'; end if;
 with roots as (select distinct d.id,d.payload from new_task_rows r
   join public.lbd_task_repeat_deletions d on d.user_id=r.user_id
    and d.id=case when jsonb_typeof(r.payload->'repeat')='object' then r.id else r.payload->>'repeatSeriesId' end
   where r.user_id=uid and d.payload?'deletedAt' and jsonb_typeof(d.payload->'repeat')='object' )
 update public.lbd_tasks t set payload=t.payload || jsonb_build_object('deletedAt',d.payload->'deletedAt')
  from roots d where t.user_id=uid and t.payload->>'repeatSeriesId'=d.id and not (t.payload?'deletedAt');
 with roots as (select distinct d.id,d.payload from new_task_rows r
   join public.lbd_task_repeat_deletions d on d.user_id=r.user_id
    and d.id=case when jsonb_typeof(r.payload->'repeat')='object' then r.id else r.payload->>'repeatSeriesId' end
   where r.user_id=uid and d.payload?'deletedAt' and jsonb_typeof(d.payload->'repeat')='object' )
 update public.lbd_calendar_blocks b set payload=b.payload || '{"cancelled":true}'::jsonb
  where b.user_id=uid and b.payload->>'cancelled' is distinct from 'true' and (
   exists(select 1 from roots d where d.id=b.payload->>'recurringTaskId') or exists(
    select 1 from public.lbd_tasks t join roots d on d.id=t.payload->>'repeatSeriesId'
     where t.user_id=uid and t.id in (b.payload->>'taskId',b.payload->>'automaticTaskId')
   )
  );
 return null;
end $$;
revoke all on function public.lbd_finish_deleted_task_series() from public,anon,authenticated;
create trigger finish_deleted_task_series_insert after insert on public.lbd_tasks
 referencing new table as new_task_rows for each statement execute function public.lbd_finish_deleted_task_series();
create trigger finish_deleted_task_series_update after update on public.lbd_tasks
 referencing new table as new_task_rows for each statement execute function public.lbd_finish_deleted_task_series();

create function public.lbd_task_series_deletion_capabilities() returns integer
language sql stable security invoker set search_path='' as $$
 select case when auth.uid() is not null then 1 else 0 end
$$;
revoke all on function public.lbd_task_series_deletion_capabilities() from public,anon;
grant execute on function public.lbd_task_series_deletion_capabilities() to authenticated;

do $postflight$
declare s record; n bigint; d text; ordering text;
begin
 for s in select * from lbd_sync_install_before loop
  ordering := case when s.table_name='lbd_workspaces' then 'user_id' else 'user_id,id' end;
  execute format($query$select count(*),md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' order by %s),'')) from public.%I r$query$,ordering,s.table_name) into n,d;
  if n is distinct from s.row_count or d is distinct from s.digest then raise exception 'Existing app rows changed. Rolling back.'; end if;
 end loop;
 if exists(select 1 from lbd_series_rpc_before b left join pg_proc p on p.oid=b.oid
 where p.oid is null or p.proowner<>b.proowner or p.proacl::text is distinct from b.acl
 or p.proconfig is distinct from b.proconfig or p.prosecdef<>b.prosecdef
 or md5(regexp_replace(p.prosrc,'[[:space:]]','','g')) <> case when b.proname='lbd_guard_deleted_repeat_task' then 'ef688f79dc3bd684968ca4b2c74fbb05' else b.body end) then raise exception 'Unexpected existing RPC/security change. Rolling back.'; end if;
 if not exists(select 1 from pg_proc where oid='public.lbd_guard_deleted_task_block()'::regprocedure and prosecdef and md5(regexp_replace(prosrc,'[[:space:]]','','g'))='17b37460a706835e1b28e00ed37ab4da')
 or not exists(select 1 from pg_trigger where tgrelid='public.lbd_calendar_blocks'::regclass and tgname='guard_deleted_task_block' and tgenabled in ('O','A') and tgfoid='public.lbd_guard_deleted_task_block()'::regprocedure)
 or not has_function_privilege('authenticated','public.lbd_task_series_deletion_capabilities()','EXECUTE')
 or has_function_privilege('anon','public.lbd_task_series_deletion_capabilities()','EXECUTE')
 or has_function_privilege('authenticated','public.lbd_guard_deleted_task_block()','EXECUTE')
 or has_function_privilege('anon','public.lbd_guard_deleted_task_block()','EXECUTE') or not exists(select 1 from pg_proc where oid='public.lbd_finish_deleted_task_series()'::regprocedure and prosecdef and md5(regexp_replace(prosrc,'[[:space:]]','','g'))='baeaa9b3d3a9770ad1cd3447aec2cc9e')
 or (select count(*) from pg_trigger where tgrelid='public.lbd_tasks'::regclass and tgname in ('finish_deleted_task_series_insert','finish_deleted_task_series_update') and tgenabled in ('O','A') and tgfoid='public.lbd_finish_deleted_task_series()'::regprocedure)<>2
 or has_function_privilege('authenticated','public.lbd_finish_deleted_task_series()','EXECUTE')
 or has_function_privilege('anon','public.lbd_finish_deleted_task_series()','EXECUTE') then raise exception 'Unexpected series deletion protection or grants. Rolling back.'; end if;
end $postflight$;
notify pgrst, 'reload schema';
commit;
select 'Task series deletion protection installed. Existing app rows unchanged. Verify read-only diagnostics and test temporary Tasks in V2.' as result;
