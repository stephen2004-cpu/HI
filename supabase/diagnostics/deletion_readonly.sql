-- Both deletion systems, same read-only metadata snapshot. No personal rows read.
-- Nine primary flags for EACH system, plus permission results, must all be true after install.
begin isolation level repeatable read read only;

-- Habit protection
select
 to_regclass('public.lbd_workspaces') is not null as base_workspace_exists,
 to_regclass('public.lbd_habits') is not null as base_habits_exist,
 to_regclass('public.lbd_habit_deletions') is not null as deletion_ledger_exists,
 to_regprocedure('public.lbd_habit_deletion_capabilities()') is not null as capability_rpc_exists,
 coalesce(has_function_privilege('authenticated', to_regprocedure('public.lbd_habit_deletion_capabilities()'), 'EXECUTE'), false) as authenticated_can_check_capability,
 coalesce((select relrowsecurity and relforcerowsecurity from pg_class where oid=to_regclass('public.lbd_habit_deletions')), false) as ledger_rls_forced,
 exists(select 1 from pg_trigger t join pg_proc p on p.oid=t.tgfoid
   where t.tgrelid=to_regclass('public.lbd_habits') and t.tgname='guard_deleted_habit'
     and not t.tgisinternal and t.tgenabled in ('O','A') and p.proname='lbd_guard_deleted_habit') as habit_guard_enabled,
 exists(select 1 from pg_trigger t join pg_proc p on p.oid=t.tgfoid
   where t.tgrelid=to_regclass('public.lbd_calendar_blocks') and t.tgname='guard_deleted_habit_block'
     and not t.tgisinternal and t.tgenabled in ('O','A') and p.proname='lbd_guard_deleted_habit_block') as block_guard_enabled,
 exists(select 1 from pg_proc p where p.oid=to_regprocedure('public.lbd_read_workspace()')
   and position('lbd_habit_deletions' in pg_get_functiondef(p.oid)) > 0) as workspace_reads_durable_tombstones;

select policyname, cmd, roles, qual, with_check
 from pg_policies where schemaname='public' and tablename='lbd_habit_deletions';
-- Expected owner_read / SELECT / authenticated / auth.uid() = user_id.
-- No INSERT/UPDATE/DELETE policy should grant clients access to the ledger.
select
 not coalesce(has_table_privilege('authenticated',to_regclass('public.lbd_habit_deletions'),'INSERT,UPDATE,DELETE'),true) as habit_ledger_client_writes_denied,
 not coalesce(has_table_privilege('anon',to_regclass('public.lbd_habit_deletions'),'SELECT,INSERT,UPDATE,DELETE'),true) as habit_ledger_anon_access_denied,
 not coalesce(has_function_privilege('anon',to_regprocedure('public.lbd_habit_deletion_capabilities()'),'EXECUTE'),true) as habit_capability_anon_denied;

-- Task protection
select
 to_regclass('public.lbd_tasks') is not null as base_tasks_exist,
 to_regclass('public.lbd_task_repeat_deletions') is not null as task_deletion_ledger_exists,
 to_regprocedure('public.lbd_task_repeat_capabilities()') is not null as task_capability_rpc_exists,
 coalesce(has_function_privilege('authenticated',to_regprocedure('public.lbd_task_repeat_capabilities()'),'EXECUTE'),false) as authenticated_can_check_task_capability,
 to_regprocedure('public.lbd_read_task_deletions()') is not null as task_tombstone_read_rpc_exists,
 coalesce(has_function_privilege('authenticated',to_regprocedure('public.lbd_read_task_deletions()'),'EXECUTE'),false) as authenticated_can_read_task_tombstones,
 coalesce((select relrowsecurity and relforcerowsecurity from pg_class where oid=to_regclass('public.lbd_task_repeat_deletions')),false) as task_ledger_rls_forced,
 exists(select 1 from pg_trigger t join pg_proc p on p.oid=t.tgfoid
   where t.tgrelid=to_regclass('public.lbd_tasks') and t.tgname='guard_deleted_repeat_task' and not t.tgisinternal and t.tgenabled in('O','A')
     and p.oid=to_regprocedure('public.lbd_guard_deleted_repeat_task()') and p.prosecdef) as task_guard_enabled,
 (select count(*)=1 and coalesce(bool_and(polname='owner_read' and polcmd='r' and polpermissive
   and polroles=array[(select oid from pg_roles where rolname='authenticated')]
   and lower(regexp_replace(pg_get_expr(polqual,polrelid),'[[:space:]()]','','g')) in ('auth.uid=user_id','selectauth.uidasuid=user_id')),false)
  from pg_policy where polrelid=to_regclass('public.lbd_task_repeat_deletions')) as task_owner_policy_safe;

select
 not coalesce(has_table_privilege('authenticated',to_regclass('public.lbd_task_repeat_deletions'),'INSERT,UPDATE,DELETE'),true) as task_ledger_client_writes_denied,
 not coalesce(has_table_privilege('anon',to_regclass('public.lbd_task_repeat_deletions'),'SELECT,INSERT,UPDATE,DELETE'),true) as task_ledger_anon_access_denied,
 not coalesce(has_function_privilege('anon',to_regprocedure('public.lbd_task_repeat_capabilities()'),'EXECUTE'),true) as task_capability_anon_denied,
 not coalesce(has_function_privilege('anon',to_regprocedure('public.lbd_read_task_deletions()'),'EXECUTE'),true) as task_tombstone_rpc_anon_denied;
select policyname,cmd,roles,qual from pg_policies where schemaname='public' and tablename='lbd_task_repeat_deletions';
-- Nine primary flags and four permission flags must all be true AFTER installation.
-- Any partial state means STOP and review, not DROP/CREATE or IF NOT EXISTS.
rollback;
