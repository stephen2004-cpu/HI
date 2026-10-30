-- READ ONLY: inspects database metadata; does not read or modify personal Habit data.
-- Run in the intended Supabase project's SQL Editor. No auth.uid() simulation needed.
begin read only;
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
rollback;
