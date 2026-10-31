-- OPTIONAL: apply only after review and explicit approval on the intended Supabase project.
-- Does not change Task tables, payloads, existing objects or other buckets.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $preflight$
begin
 if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
  raise exception 'Supabase Storage schema is missing. Enable Storage before running this migration.';
 end if;
 if not exists(select 1 from pg_class where oid='storage.objects'::regclass and relrowsecurity) then
  raise exception 'Storage object RLS must already be enabled; refusing to change global Storage configuration.';
 end if;
 if exists(select 1 from storage.buckets where id='lbd-checklist-files'
    and (public is distinct from false or file_size_limit is distinct from 20971520::bigint)) then
  raise exception 'Existing checklist bucket has unexpected settings. Review it; no settings or files changed.';
 end if;
 if exists(select 1 from pg_policies where schemaname='storage' and tablename='objects'
   and policyname in ('lbd_checklist_files_owner_select','lbd_checklist_files_owner_insert','lbd_checklist_files_owner_delete')) then
  raise exception 'Checklist policies already or partly installed. Review existing policies; do not drop them blindly.';
 end if;
 if exists(select 1 from pg_policies where schemaname='storage' and tablename='objects') then
  raise exception 'Existing Storage policies need review for overlapping access before installing checklist policies. No policies changed; do not drop existing policies.';
 end if;
end $preflight$;
insert into storage.buckets(id,name,public,file_size_limit)
 values('lbd-checklist-files','lbd-checklist-files',false,20971520) on conflict(id) do nothing;
create policy lbd_checklist_files_owner_select on storage.objects for select to authenticated
 using(bucket_id='lbd-checklist-files' and (storage.foldername(name))[1]=(select auth.uid())::text
   and array_length(storage.foldername(name),1)=1);
create policy lbd_checklist_files_owner_insert on storage.objects for insert to authenticated
 with check(bucket_id='lbd-checklist-files' and (storage.foldername(name))[1]=(select auth.uid())::text
   and array_length(storage.foldername(name),1)=1);
-- Cleanup only for failed new attachments; saved references are removed without deleting their blob.
create policy lbd_checklist_files_owner_delete on storage.objects for delete to authenticated
 using(bucket_id='lbd-checklist-files' and (storage.foldername(name))[1]=(select auth.uid())::text
   and array_length(storage.foldername(name),1)=1);
-- No UPDATE/upsert policy: objects use fresh UUIDs, never overwrite a saved file.
notify pgrst, 'reload schema';
commit;
