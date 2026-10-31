"""Exercise the exact Storage policy migration in disposable LOCAL PostgreSQL DBs.
Storage API/file transport is tested separately; this harness never contacts managed Supabase.
"""
from pathlib import Path
import subprocess
import uuid
ROOT = Path(__file__).resolve().parent.parent
MIGRATION = (ROOT / 'supabase/migrations/202610310001_checklist_storage.sql').read_text()
SETUP = """
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
alter table storage.objects enable row level security;
grant usage on schema auth,storage to authenticated,anon;
grant select,insert,update,delete on storage.objects to authenticated,anon;
grant execute on function auth.uid(),storage.foldername(text) to authenticated,anon;
insert into storage.buckets values('existing','existing',false,1000);
insert into storage.objects(bucket_id,name) values('existing','keep-original');
"""
def sql(db, body, success=True):
    p = subprocess.run(['docker','exec','-i','lbd-auth-pg','psql','-X','-q','-v','ON_ERROR_STOP=1','-U','postgres','-d',db],input=body,text=True,capture_output=True)
    if success and p.returncode: raise AssertionError(p.stderr)
    if not success and not p.returncode: raise AssertionError('Expected rejection')
    return p

def run(label, test):
    name = 'lbd_checklist_storage_test_' + uuid.uuid4().hex
    sql('postgres','create database ' + name)
    try:
        sql(name,SETUP)
        test(name)
        print('PASS:',label,flush=True)
    finally:
        assert name.startswith('lbd_checklist_storage_test_') and len(name)==59
        sql('postgres','drop database ' + name)

def access(db):
    sql(db,MIGRATION)
    sql(db,"""
do $$ begin
 if not exists(select 1 from storage.buckets where id='lbd-checklist-files' and not public and file_size_limit=20971520) then raise exception 'Wrong bucket'; end if;
 if not exists(select 1 from storage.objects where name='keep-original') then raise exception 'Existing object lost'; end if;
end $$;
set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
insert into storage.objects(bucket_id,name) values('lbd-checklist-files','11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
do $$ begin
 if (select count(*) from storage.objects) <> 1 then raise exception 'Owner cannot read own object'; end if;
 begin
  insert into storage.objects(bucket_id,name) values('lbd-checklist-files','22222222-2222-4222-8222-222222222222/foreign');
  raise exception 'Foreign upload accepted';
 exception when insufficient_privilege then null; end;
 begin
  insert into storage.objects(bucket_id,name) values('lbd-checklist-files','11111111-1111-4111-8111-111111111111/nested/invalid');
  raise exception 'Nested path accepted';
 exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$ begin
 if exists(select 1 from storage.objects) then raise exception 'Cross-user read'; end if;
end $$;
delete from storage.objects;
reset role;
set role anon;
do $$ begin if exists(select 1 from storage.objects) then raise exception 'Anonymous read'; end if; end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $$ begin if (select count(*) from storage.objects) <> 1 then raise exception 'Other user deleted owner object'; end if; end $$;
update storage.objects set name='overwritten';
do $$ begin if exists(select 1 from storage.objects where name='overwritten') then raise exception 'Overwrite was permitted'; end if; end $$;
delete from storage.objects;
reset role;
do $$ begin if exists(select 1 from storage.objects where bucket_id='lbd-checklist-files') then raise exception 'Own cleanup failed'; end if; end $$;
""")
    sql(db,MIGRATION,False)
    sql(db,"do $$ begin if (select count(*) from pg_policies where schemaname='storage')<>3 then raise exception 'Rerun changed policies'; end if; end $$;")

def public_bucket(db):
    sql(db,"insert into storage.buckets values('lbd-checklist-files','lbd-checklist-files',true,20971520);")
    assert 'unexpected settings' in sql(db,MIGRATION,False).stderr
    sql(db,"do $$ begin if exists(select 1 from pg_policies where schemaname='storage') then raise exception 'Partial install'; end if; end $$;")

def broad_policy(db):
    sql(db,'create policy existing_broad on storage.objects for select to authenticated using(true);')
    assert 'overlapping access' in sql(db,MIGRATION,False).stderr
    sql(db,"do $$ begin if exists(select 1 from storage.buckets where id='lbd-checklist-files') then raise exception 'Bucket escaped rollback'; end if; end $$;")

def rollback(db):
    sql(db,MIGRATION.replace("notify pgrst, 'reload schema';",'select 1/0;'),False)
    sql(db,"do $$ begin if exists(select 1 from storage.buckets where id='lbd-checklist-files') or exists(select 1 from pg_policies where schemaname='storage') then raise exception 'DDL escaped rollback'; end if; end $$;")

for label,test in [('private bucket, per-owner insert/read/delete, cross-owner/anonymous denial, no overwrite, existing data and rerun safety',access),('unexpected public bucket rejected',public_bucket),('overlapping existing policy rejected',broad_policy),('late failure rolls back bucket and policies',rollback)]:
    run(label,test)
