-- Reviewed fix for repeated revision-conflict transactions on PostgREST 14.18.
-- Do NOT run without owner approval. Pause app writes; run this WHOLE file.
-- SQLSTATE PGRST avoids automatic retries; HTTP 409 preserves JSON code "40001".
-- Replaces only the existing commit RPC body. No app rows are changed by installation.
-- Pause app writes first; run this WHOLE file in SQL Editor as postgres.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
do $preflight$
begin
 if current_user<>'postgres' or not exists(select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then raise exception 'Use postgres SQL Editor role. No changes installed.'; end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.lbd_commit_workspace(bigint,jsonb)') and not prosecdef and prorettype='bigint'::regtype and md5(regexp_replace(prosrc,'[[:space:]]','','g'))='668421235f9dc67cc75cf459a10d045d') then raise exception 'Commit RPC differs from the reviewed source. Stop; no changes installed.'; end if;
 if not has_function_privilege('authenticated','public.lbd_commit_workspace(bigint,jsonb)','EXECUTE') or has_function_privilege('anon','public.lbd_commit_workspace(bigint,jsonb)','EXECUTE') then raise exception 'Unexpected commit RPC permissions. Stop.'; end if;
 if to_regclass('public.lbd_habit_deletions') is null or to_regclass('public.lbd_task_repeat_deletions') is null then raise exception 'Install the reviewed deletion protections first. Stop.'; end if;
 if (select count(*) from pg_class where oid in (to_regclass('public.lbd_habit_deletions'),to_regclass('public.lbd_task_repeat_deletions')) and relrowsecurity and relforcerowsecurity)<>2 or has_table_privilege('authenticated','public.lbd_habit_deletions','INSERT,UPDATE,DELETE') or has_table_privilege('authenticated','public.lbd_task_repeat_deletions','INSERT,UPDATE,DELETE') then raise exception 'Unexpected deletion ledger RLS/permissions. Stop.'; end if;
 if not exists(select 1 from pg_trigger where tgrelid='public.lbd_calendar_blocks'::regclass and tgname='guard_deleted_habit_block' and tgenabled in ('O','A')) or not exists(select 1 from pg_trigger where tgrelid='public.lbd_habits'::regclass and tgname='guard_deleted_habit' and tgenabled in ('O','A')) or not exists(select 1 from pg_trigger where tgrelid='public.lbd_tasks'::regclass and tgname='guard_deleted_repeat_task' and tgenabled in ('O','A')) then raise exception 'Required deletion guard is not enabled. Stop.'; end if;
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


create temporary table lbd_sync_rpc_before on commit drop as
 select oid,proowner as owner_oid,proacl::text as acl,proconfig as config
 from pg_proc where oid='public.lbd_commit_workspace(bigint,jsonb)'::regprocedure;
create or replace function public.lbd_commit_workspace(expected_revision bigint,payload jsonb) returns bigint language plpgsql security invoker set search_path='' as $$
declare uid uuid := auth.uid(); rev bigint; items jsonb; table_name text; key_name text; arr jsonb; n int;
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if expected_revision < 0 or jsonb_typeof(payload) <> 'object' or payload->'timer'->>'version' is distinct from '1' or payload->'tasks'->>'version' is distinct from '1' or payload->'planner'->>'version' is distinct from '1' or payload->'habits'->>'version' is distinct from '1' then raise exception 'Invalid workspace' using errcode='22023'; end if;
 if jsonb_typeof(payload->'timer'->'settings') is distinct from 'object' or jsonb_typeof(payload->'planner'->'preferences') is distinct from 'object' then raise exception 'Invalid settings' using errcode='22023'; end if;
 -- Reject known-stale callers before competing for the workspace write lock.
 select revision into rev from public.lbd_workspaces where user_id=uid;
 if found then
  if rev <> expected_revision then raise sqlstate 'PGRST' using message = '{"code":"40001","message":"Workspace revision conflict","details":null,"hint":null}', detail = '{"status":409,"headers":{}}'; end if;
 else
  insert into public.lbd_workspaces(user_id) values(uid) on conflict do nothing;
 end if;
 select revision into rev from public.lbd_workspaces where user_id=uid for update;
 if rev <> expected_revision then raise sqlstate 'PGRST' using message = '{"code":"40001","message":"Workspace revision conflict","details":null,"hint":null}', detail = '{"status":409,"headers":{}}'; end if;
 for n in 1..5 loop
  table_name := (array['lbd_tasks','lbd_calendar_blocks','lbd_habits','lbd_focus_sessions','lbd_reviews'])[n];
  key_name := case when n=5 then 'runId' else 'id' end;
  arr := case n when 1 then payload->'tasks'->'tasks' when 2 then payload->'planner'->'blocks' when 3 then payload->'habits'->'habits' when 4 then payload->'timer'->'snapshot'->'history' else payload->'reviews' end;
  if jsonb_typeof(arr) is distinct from 'array' then raise exception 'Invalid records' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(arr) e where jsonb_typeof(e) <> 'object' or jsonb_typeof(e->key_name) is distinct from 'string' or length(e->>key_name)=0) then raise exception 'Invalid record id' using errcode='22023'; end if;
  if (select count(*) <> count(distinct e->>key_name) from jsonb_array_elements(arr) e) then
   raise exception 'Duplicate record id' using errcode='23505';
  end if;
  -- Remove only omitted IDs, preserving the existing snapshot-replacement contract.
  execute format('delete from public.%I d where d.user_id=$1 and not exists (select 1 from jsonb_array_elements($2) e where e->>$3=d.id)',table_name) using uid,arr,key_name;
  if table_name='lbd_calendar_blocks' then
   -- BEFORE INSERT still runs on every supplied block: its protection depends on
   -- the separate Habit deletion ledger, even when the block JSON is unchanged.
   execute format('insert into public.%I as target(user_id,id,payload) select $1,e->>$3,e from jsonb_array_elements($2) e on conflict(user_id,id) do update set payload=excluded.payload where target.payload is distinct from excluded.payload',table_name) using uid,arr,key_name;
  else
   execute format('insert into public.%I as target(user_id,id,payload) select $1,e->>$3,e from jsonb_array_elements($2) e left join public.%I old on old.user_id=$1 and old.id=e->>$3 where old.payload is distinct from e on conflict(user_id,id) do update set payload=excluded.payload where target.payload is distinct from excluded.payload',table_name,table_name) using uid,arr,key_name;
  end if;
 end loop;
 update public.lbd_workspaces set revision=rev+1,settings=payload->'timer'->'settings',run=nullif(payload->'timer'->'snapshot'->'run','null'::jsonb),preferences=payload->'planner'->'preferences',updated_at=now() where user_id=uid;
 return rev+1;
end $$;

do $postflight$
declare s record; n bigint; d text; ordering text;
begin
 for s in select * from lbd_sync_install_before loop
  ordering := case when s.table_name='lbd_workspaces' then 'user_id' else 'user_id,id' end;
  execute format($query$select count(*),md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' order by %s),'')) from public.%I r$query$,ordering,s.table_name) into n,d;
  if n is distinct from s.row_count or d is distinct from s.digest then raise exception 'Existing app rows changed. Rolling back.'; end if;
 end loop;
 if not exists(select 1 from pg_proc p join lbd_sync_rpc_before b on p.oid=b.oid where p.proowner=b.owner_oid and p.proacl::text is not distinct from b.acl and p.proconfig is not distinct from b.config and not p.prosecdef and md5(regexp_replace(p.prosrc,'[[:space:]]','','g'))='3f50887f07c901afc81c32237eeb8a7e') then raise exception 'Unexpected RPC body/security or permissions. Rolling back.'; end if;
end $postflight$;
notify pgrst, 'reload schema';
commit;
select 'Workspace conflict retry protection installed. Existing app rows unchanged. Verify API recovery, sync and deletion in V2.' as result;
