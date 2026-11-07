begin read only;
set local statement_timeout='8s';
select
 to_regprocedure('public.lbd_commit_workspace(bigint,jsonb)') is not null as commit_rpc_exists,
 coalesce((select md5(regexp_replace(prosrc,'[[:space:]]','','g'))='668421235f9dc67cc75cf459a10d045d' from pg_proc where oid=to_regprocedure('public.lbd_commit_workspace(bigint,jsonb)')),false) as incremental_body_matches,
 coalesce((select not prosecdef from pg_proc where oid=to_regprocedure('public.lbd_commit_workspace(bigint,jsonb)')),false) as security_invoker,
 coalesce(has_function_privilege('authenticated',to_regprocedure('public.lbd_commit_workspace(bigint,jsonb)'),'EXECUTE'),false) as authenticated_can_commit,
 not coalesce(has_function_privilege('anon',to_regprocedure('public.lbd_commit_workspace(bigint,jsonb)'),'EXECUTE'),true) as anon_commit_denied,
 (select count(*)=6 and bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid in (to_regclass('public.lbd_workspaces'),to_regclass('public.lbd_tasks'),to_regclass('public.lbd_calendar_blocks'),to_regclass('public.lbd_habits'),to_regclass('public.lbd_focus_sessions'),to_regclass('public.lbd_reviews'))) as base_owner_rls_forced,
 coalesce((select relrowsecurity and relforcerowsecurity from pg_class where oid=to_regclass('public.lbd_habit_deletions')),false) as habit_ledger_rls_forced,
 coalesce((select relrowsecurity and relforcerowsecurity from pg_class where oid=to_regclass('public.lbd_task_repeat_deletions')),false) as task_ledger_rls_forced,
 exists(select 1 from pg_trigger where tgrelid=to_regclass('public.lbd_habits') and tgname='guard_deleted_habit' and tgenabled in ('O','A') and not tgisinternal) as habit_guard_enabled,
 exists(select 1 from pg_trigger where tgrelid=to_regclass('public.lbd_tasks') and tgname='guard_deleted_repeat_task' and tgenabled in ('O','A') and not tgisinternal) as task_guard_enabled,
 exists(select 1 from pg_trigger where tgrelid=to_regclass('public.lbd_calendar_blocks') and tgname='guard_deleted_habit_block' and tgenabled in ('O','A') and not tgisinternal) as block_guard_enabled;
rollback;
