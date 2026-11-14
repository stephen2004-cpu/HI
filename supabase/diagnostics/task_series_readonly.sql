-- Metadata only. Does not invoke deletion or change app data.
begin read only;
set local statement_timeout='5s';
select
 to_regprocedure('public.lbd_task_series_deletion_capabilities()') is not null as series_capability_exists,
 coalesce(has_function_privilege('authenticated',to_regprocedure('public.lbd_task_series_deletion_capabilities()'),'EXECUTE'),false) as authenticated_can_check,
 not coalesce(has_function_privilege('anon',to_regprocedure('public.lbd_task_series_deletion_capabilities()'),'EXECUTE'),true) as anon_denied,
 coalesce((select prosecdef and md5(regexp_replace(prosrc,'[[:space:]]','','g'))='ef688f79dc3bd684968ca4b2c74fbb05' from pg_proc where oid=to_regprocedure('public.lbd_guard_deleted_repeat_task()')),false) and coalesce((select prosecdef and md5(regexp_replace(prosrc,'[[:space:]]','','g'))='baeaa9b3d3a9770ad1cd3447aec2cc9e' from pg_proc where oid=to_regprocedure('public.lbd_finish_deleted_task_series()')),false)
 and (select count(*) from pg_trigger where tgrelid=to_regclass('public.lbd_tasks') and tgname in ('finish_deleted_task_series_insert','finish_deleted_task_series_update') and tgenabled in ('O','A') and tgfoid=to_regprocedure('public.lbd_finish_deleted_task_series()'))=2 as durable_series_guard,
 exists(select 1 from pg_trigger where tgrelid=to_regclass('public.lbd_calendar_blocks') and tgname='guard_deleted_task_block' and tgenabled in ('O','A') and tgfoid=to_regprocedure('public.lbd_guard_deleted_task_block()')) as calendar_guard_enabled,
 coalesce((select prosecdef and md5(regexp_replace(prosrc,'[[:space:]]','','g'))='17b37460a706835e1b28e00ed37ab4da' from pg_proc where oid=to_regprocedure('public.lbd_guard_deleted_task_block()')),false) as calendar_guard_matches,
 coalesce((select relrowsecurity and relforcerowsecurity from pg_class where oid=to_regclass('public.lbd_task_repeat_deletions')),false) as ledger_rls_forced,
 not coalesce(has_table_privilege('authenticated',to_regclass('public.lbd_task_repeat_deletions'),'INSERT,UPDATE,DELETE'),true) as client_ledger_writes_denied,
 coalesce((select not prosecdef and md5(regexp_replace(prosrc,'[[:space:]]','','g'))='3f50887f07c901afc81c32237eeb8a7e' from pg_proc where oid=to_regprocedure('public.lbd_commit_workspace(bigint,jsonb)')),false) as cpu_retry_fix_unchanged;
rollback;
