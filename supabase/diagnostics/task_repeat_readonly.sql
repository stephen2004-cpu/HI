-- Read metadata only. No Task content or user data is returned.
begin read only;
select
 to_regclass('public.lbd_task_repeat_deletions') is not null as task_deletion_ledger_exists,
 to_regprocedure('public.lbd_task_repeat_capabilities()') is not null as task_capability_rpc_exists,
 to_regprocedure('public.lbd_read_task_deletions()') is not null as task_tombstone_read_rpc_exists,
 coalesce((select relrowsecurity and relforcerowsecurity from pg_class where oid=to_regclass('public.lbd_task_repeat_deletions')),false) as task_ledger_rls_forced,
 exists(select 1 from pg_trigger where tgrelid=to_regclass('public.lbd_tasks') and tgname='guard_deleted_repeat_task' and not tgisinternal and tgenabled in('O','A')) as task_guard_enabled,
 coalesce(has_function_privilege('authenticated',to_regprocedure('public.lbd_read_task_deletions()'),'EXECUTE'),false) as authenticated_can_read_task_tombstones;
select policyname,cmd,roles,qual from pg_policies where schemaname='public' and tablename='lbd_task_repeat_deletions';
rollback;
