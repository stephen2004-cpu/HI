-- Metadata only: verifies the non-retrying transport without calling a write RPC.
begin read only;
set local statement_timeout='5s';
select
 to_regprocedure('public.lbd_commit_workspace(bigint,jsonb)') is not null as commit_rpc_exists,
 coalesce((select md5(regexp_replace(prosrc,'[[:space:]]','','g'))='3f50887f07c901afc81c32237eeb8a7e' from pg_proc where oid=to_regprocedure('public.lbd_commit_workspace(bigint,jsonb)')),false) as conflict_retry_fix_matches,
 coalesce((select not prosecdef from pg_proc where oid=to_regprocedure('public.lbd_commit_workspace(bigint,jsonb)')),false) as security_invoker,
 coalesce(has_function_privilege('authenticated',to_regprocedure('public.lbd_commit_workspace(bigint,jsonb)'),'EXECUTE'),false) as authenticated_can_commit,
 not coalesce(has_function_privilege('anon',to_regprocedure('public.lbd_commit_workspace(bigint,jsonb)'),'EXECUTE'),true) as anon_commit_denied;
rollback;
