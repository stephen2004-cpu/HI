"""Local disposable SQL tests; never reads a managed URL or modifies a real Supabase project."""
from pathlib import Path
import subprocess,uuid
ROOT=Path(__file__).resolve().parent.parent
BASE=(ROOT/'supabase/migrations/202610270001_auth_workspace.sql').read_text()
TASK=(ROOT/'supabase/migrations/202610310002_task_repeat_deletions.sql').read_text()
HABIT=(ROOT/'supabase/manual/install_habit_deletions_safe.sql').read_text()
SETUP="""
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth,public to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
"""
SEED="""
insert into auth.users values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
insert into public.lbd_tasks values('11111111-1111-4111-8111-111111111111','one','{"id":"one","title":"Keep Task","repeatSeriesId":"series","repeatDate":"2026-11-02","checklist":[{"id":"s","text":"Keep checklist","done":true}]}');
"""
def sql(db,query,ok=True):
 p=subprocess.run(['docker','exec','-i','lbd-auth-pg','psql','-X','-q','-v','ON_ERROR_STOP=1','-U','postgres','-d',db],input=query,text=True,capture_output=True)
 if ok and p.returncode:raise AssertionError(p.stderr)
 if not ok and not p.returncode:raise AssertionError('Expected safe rejection')
 return p

def run(name,test):
 db='lbd_task_repeat_test_'+uuid.uuid4().hex
 sql('postgres','create database '+db)
 try:sql(db,SETUP+BASE+SEED);test(db);print('PASS:',name,flush=True)
 finally:
  assert db.startswith('lbd_task_repeat_test_') and len(db)==53
  sql('postgres','drop database '+db)

def access(db):
 sql(db,TASK)
 # Task protection intentionally leaves the base workspace RPC unchanged, so Habit installer still applies.
 sql(db,HABIT)
 sql(db,"""
do $$begin if (select payload->>'title' from public.lbd_tasks where id='one')<>'Keep Task' then raise exception 'Existing data changed'; end if;end$$;
set role authenticated;set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $$begin if public.lbd_task_repeat_capabilities()<>1 then raise exception 'Capability failed';end if;end$$;
update public.lbd_tasks set payload=payload||'{"deletedAt":1800000000000}'::jsonb where id='one';
update public.lbd_tasks set payload='{"id":"one","title":"stale active write"}'::jsonb where id='one';
do $$begin if not exists(select 1 from public.lbd_tasks where id='one' and payload?'deletedAt' and payload->'checklist'->0->>'text'='Keep checklist') then raise exception 'Tombstone resurrected or metadata lost';end if;end$$;
delete from public.lbd_tasks where id='one';
do $$begin if jsonb_array_length(public.lbd_read_task_deletions())<>1 then raise exception 'Ledger lost after omitted Task';end if;end$$;
insert into public.lbd_tasks values('11111111-1111-4111-8111-111111111111','one','{"id":"one","title":"legacy restore"}');
do $$begin if not exists(select 1 from public.lbd_tasks where id='one' and payload?'deletedAt') then raise exception 'Legacy insert resurrected Task';end if;end$$;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$begin if jsonb_array_length(public.lbd_read_task_deletions())<>0 then raise exception 'Cross-owner read';end if;end$$;
reset role;
""")
 assert 'already or partly installed' in sql(db,TASK,False).stderr
 sql(db,"do $$begin if(select count(*) from public.lbd_task_repeat_deletions)<>1 then raise exception 'Rerun changed ledger';end if;end$$;")

def rollback(db):
 sql(db,TASK.replace("notify pgrst,'reload schema';",'select 1/0;'),False)
 sql(db,"do $$begin if to_regclass('public.lbd_task_repeat_deletions') is not null or to_regprocedure('public.lbd_task_repeat_capabilities()') is not null then raise exception 'Partial installation survived rollback';end if;end$$;")

def rls(db):
 sql(db,'alter table public.lbd_tasks disable row level security;')
 assert 'RLS' in sql(db,TASK,False).stderr
 sql(db,"do $$begin if(select count(*) from public.lbd_tasks)<>1 then raise exception 'Old data changed';end if;end$$;")

for name,test in [('durable Task tombstones, stale/legacy writes, owner RLS, rerun rejection and subsequent Habit installer compatibility',access),('late SQL error rolls back all new objects',rollback),('missing RLS aborts without changing old data',rls)]:run(name,test)
