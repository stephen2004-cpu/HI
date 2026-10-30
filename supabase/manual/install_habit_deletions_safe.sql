-- LBD Focus V2: guarded ONE-TIME installer for the missing Habit deletion migration.
-- Paste this WHOLE file into the intended Supabase SQL Editor, as postgres.
-- No Habit is deleted by this installer. No existing app row is updated/deleted.
-- Stop app editing on all devices until this transaction finishes.
-- Fails closed on partial installs, unexpected schema/policies or changed workspace RPCs.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
declare t text; expected text[]; actual text[]; policy_row record; compact text;
begin
 if current_user <> 'postgres' then
  raise exception 'Use the Supabase SQL Editor postgres role; no changes installed.';
 end if;
 if not exists(select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then
  raise exception 'Installer role must support RLS-protected security-definer guards. No changes installed.';
 end if;
 if to_regclass('auth.users') is null or to_regprocedure('auth.uid()') is null then
  raise exception 'Supabase Auth schema is missing; no changes installed.';
 end if;
 if to_regclass('public.lbd_habit_deletions') is not null
  or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('lbd_guard_deleted_habit','lbd_guard_deleted_habit_block','lbd_habit_deletion_capabilities'))
  or exists(select 1 from pg_trigger where tgname in ('guard_deleted_habit','guard_deleted_habit_block')
    and tgrelid in (to_regclass('public.lbd_habits'),to_regclass('public.lbd_calendar_blocks'))) then
  raise exception 'Deletion protection is already or partly installed. Stop; run read-only diagnostics. Do not drop existing objects.';
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
 -- Compare implementation bodies with the repository base migration, ignoring whitespace only.
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.lbd_read_workspace()')
   and not prosecdef and prorettype='jsonb'::regtype
   and md5(regexp_replace(prosrc,'[[:space:]]','','g'))='ae47fcf0da04a341b16d6818eae008ea')
  or not exists(select 1 from pg_proc where oid=to_regprocedure('public.lbd_commit_workspace(bigint,jsonb)')
   and not prosecdef and prorettype='bigint'::regtype
   and md5(regexp_replace(prosrc,'[[:space:]]','','g'))='dcbb2c53e074c882117725609945812d') then
  raise exception 'Workspace RPC differs from the known base migration. No changes installed; review its definition before proceeding.';
 end if;
end $preflight$;

-- A short write lock avoids concurrent sync writes during installation. Reads remain possible.
lock table public.lbd_workspaces, public.lbd_tasks, public.lbd_calendar_blocks,
 public.lbd_habits, public.lbd_focus_sessions, public.lbd_reviews in share row exclusive mode;

-- Only hash/count snapshots in a temporary table, removed at commit; no personal payload output.
create temporary table lbd_habit_install_before(table_name text primary key, row_count bigint, digest text) on commit drop;
do $snapshot$
declare t text; n bigint; d text; ordering text;
begin
 foreach t in array array['lbd_workspaces','lbd_tasks','lbd_calendar_blocks','lbd_habits','lbd_focus_sessions','lbd_reviews'] loop
  ordering := case when t='lbd_workspaces' then 'user_id' else 'user_id,id' end;
  execute format($query$select count(*),md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' order by %s),'')) from public.%I r$query$,ordering,t) into n,d;
  insert into lbd_habit_install_before values(t,n,d);
 end loop;
 if exists(select 1 from public.lbd_habits where payload ? 'deletedAt' and
  case when jsonb_typeof(payload->'deletedAt')='number' then
   (payload->>'deletedAt')::numeric <= 0 or (payload->>'deletedAt')::numeric > 9007199254740991
   or trunc((payload->>'deletedAt')::numeric) <> (payload->>'deletedAt')::numeric
  else true end) then
  raise exception 'An existing Habit has an invalid deletion marker. No changes installed; review without deleting data.';
 end if;
end $snapshot$;

-- BEGIN original migration, embedded verbatim (no psql include commands needed).
-- Additive V2 migration: test on an isolated database first. No existing rows are deleted.
-- Permanent IDs cannot be restored by old/offline clients or whole-workspace replacement.
create table public.lbd_habit_deletions (
 user_id uuid not null references auth.users(id) on delete cascade,
 id text not null,
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 primary key(user_id,id)
);
alter table public.lbd_habit_deletions enable row level security;
alter table public.lbd_habit_deletions force row level security;
revoke all on public.lbd_habit_deletions from public,anon,authenticated;
grant select on public.lbd_habit_deletions to authenticated;
create policy owner_read on public.lbd_habit_deletions for select to authenticated
 using ((select auth.uid()) = user_id);

create function public.lbd_guard_deleted_habit() returns trigger language plpgsql
 security definer set search_path='' as $$
declare dead jsonb;
begin
 if auth.uid() is null or new.user_id <> auth.uid() then
  raise exception 'Owner required' using errcode='42501';
 end if;
 select payload into dead from public.lbd_habit_deletions where user_id=new.user_id and id=new.id;
 if dead is not null then new.payload := dead; return new; end if;
 if new.payload ? 'deletedAt' then
  if jsonb_typeof(new.payload->'deletedAt') is distinct from 'number'
   or (new.payload->>'deletedAt')::numeric <= 0
   or (new.payload->>'deletedAt')::numeric > 9007199254740991 then
   raise exception 'Invalid deletion' using errcode='22023';
  end if;
  new.payload := new.payload || '{"archived":true,"resumeAfterArchive":false}'::jsonb;
  if new.payload->>'deletedHistory' = 'true' then
   new.payload := new.payload || '{"logs":{}}'::jsonb;
  end if;
  insert into public.lbd_habit_deletions(user_id,id,payload)
   values(new.user_id,new.id,new.payload) on conflict do nothing;
  select payload into new.payload from public.lbd_habit_deletions where user_id=new.user_id and id=new.id;
  update public.lbd_calendar_blocks set payload=payload || '{"cancelled":true}'::jsonb
   where user_id=new.user_id and (payload->>'recurringHabitId'=new.id or starts_with(id,'habit-block:' || new.id || ':'))
     and (payload->>'start')::numeric >= (new.payload->>'deletedAt')::numeric;
 end if;
 return new;
end $$;
revoke all on function public.lbd_guard_deleted_habit() from public,anon,authenticated;
create trigger guard_deleted_habit before insert or update on public.lbd_habits
 for each row execute function public.lbd_guard_deleted_habit();

create function public.lbd_guard_deleted_habit_block() returns trigger language plpgsql
 security definer set search_path='' as $$
declare dead jsonb;
begin
 if auth.uid() is null or new.user_id <> auth.uid() then
  raise exception 'Owner required' using errcode='42501';
 end if;
 select payload into dead from public.lbd_habit_deletions
  where user_id=new.user_id and (id=new.payload->>'recurringHabitId' or starts_with(new.id,'habit-block:' || id || ':'));
 if dead is not null and (new.payload->>'start')::numeric >= (dead->>'deletedAt')::numeric then
  new.payload := new.payload || '{"cancelled":true}'::jsonb;
 end if;
 return new;
end $$;
revoke all on function public.lbd_guard_deleted_habit_block() from public,anon,authenticated;
create trigger guard_deleted_habit_block before insert or update on public.lbd_calendar_blocks
 for each row execute function public.lbd_guard_deleted_habit_block();

-- Always return durable tombstones even when an old client omits the habit row.
create or replace function public.lbd_read_workspace() returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.lbd_workspaces; uid uuid := auth.uid(); result jsonb;
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into w from public.lbd_workspaces where user_id=uid;
 if not found then return jsonb_build_object('revision',0,'payload',null); end if;
 select jsonb_build_object('revision',w.revision,'payload',jsonb_build_object(
  'timer',jsonb_build_object('version',1,'settings',w.settings,'snapshot',jsonb_build_object('run',w.run,'history',coalesce((select jsonb_agg(payload order by (payload->>'end')::numeric desc) from public.lbd_focus_sessions where user_id=uid),'[]'::jsonb))),
  'tasks',jsonb_build_object('version',1,'tasks',coalesce((select jsonb_agg(payload order by id) from public.lbd_tasks where user_id=uid),'[]'::jsonb)),
  'planner',jsonb_build_object('version',1,'preferences',w.preferences,'blocks',coalesce((select jsonb_agg(payload order by id) from public.lbd_calendar_blocks where user_id=uid),'[]'::jsonb)),
  'habits',jsonb_build_object('version',1,'habits',coalesce((select jsonb_agg(x.payload order by x.id) from (select id,payload from public.lbd_habit_deletions where user_id=uid union all select h.id,h.payload from public.lbd_habits h where h.user_id=uid and not exists(select 1 from public.lbd_habit_deletions d where d.user_id=h.user_id and d.id=h.id)) x),'[]'::jsonb)),
  'reviews',coalesce((select jsonb_agg(payload order by id) from public.lbd_reviews where user_id=uid),'[]'::jsonb)
 )) into result;
 return result;
end $$;

-- Adopt any already-saved V2 deletion markers without changing unrelated rows.
insert into public.lbd_habit_deletions(user_id,id,payload)
 select user_id,id,payload from public.lbd_habits
 where jsonb_typeof(payload->'deletedAt')='number' and (payload->>'deletedAt')::numeric > 0
 on conflict do nothing;
create function public.lbd_habit_deletion_capabilities() returns integer
 language sql stable security invoker set search_path='' as $$
 select case when auth.uid() is not null then 1 else 0 end
$$;
revoke all on function public.lbd_habit_deletion_capabilities() from public,anon;
grant execute on function public.lbd_habit_deletion_capabilities() to authenticated;

-- END original migration.
-- Fail the entire transaction if any existing app row has changed.
do $postflight$
declare s record; n bigint; d text; ordering text;
begin
 for s in select * from lbd_habit_install_before loop
  ordering := case when s.table_name='lbd_workspaces' then 'user_id' else 'user_id,id' end;
  execute format($query$select count(*),md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' order by %s),'')) from public.%I r$query$,ordering,s.table_name) into n,d;
  if n is distinct from s.row_count or d is distinct from s.digest then
   raise exception 'Existing data changed in %. Rolling back installation.',s.table_name;
  end if;
 end loop;
 if not exists(select 1 from pg_class where oid='public.lbd_habit_deletions'::regclass and relrowsecurity and relforcerowsecurity)
  or not has_function_privilege('authenticated','public.lbd_habit_deletion_capabilities()','EXECUTE')
  or has_table_privilege('authenticated','public.lbd_habit_deletions','INSERT,UPDATE,DELETE') then
  raise exception 'Deletion protection permissions are unexpected. Rolling back installation.';
 end if;
end $postflight$;
-- Delivered only if COMMIT succeeds. Does not change Supabase Auth/project settings.
notify pgrst, 'reload schema';
commit;
select 'Habit deletion protection installed; existing app rows unchanged. Reload V2 and verify sync before deleting a Habit.' as result;
