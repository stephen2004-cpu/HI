"""Disposable local Docker databases only. Never reads managed project URLs or credentials."""
from pathlib import Path
import subprocess
import uuid
ROOT=Path(__file__).resolve().parent.parent
BASE=(ROOT/'supabase/migrations/202610270001_auth_workspace.sql').read_text()
HABIT=(ROOT/'supabase/manual/install_habit_deletions_safe.sql').read_text()
TASK=(ROOT/'supabase/manual/install_task_repeat_deletions_safe.sql').read_text()
MIGRATION=(ROOT/'supabase/migrations/202610310002_task_repeat_deletions.sql').read_text()
assert MIGRATION[MIGRATION.index('do $preflight$'):MIGRATION.index("notify pgrst,'reload schema';")] in TASK
DIAG=(ROOT/'supabase/diagnostics/deletion_readonly.sql').read_text()
SETUP="""
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth,public to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
insert into auth.users values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
"""
DATA="""
insert into public.lbd_workspaces(user_id,settings) values('11111111-1111-4111-8111-111111111111','{"keep":true}');
insert into public.lbd_tasks values
 ('11111111-1111-4111-8111-111111111111','qwqr','{"id":"qwqr","title":"qwqr","repeatSeriesId":"series","repeatDate":"2026-11-03","checklist":[{"id":"s","text":"Keep","done":true}]}'),
 ('11111111-1111-4111-8111-111111111111','independent','{"id":"independent","title":"Keep independent"}'),
 ('11111111-1111-4111-8111-111111111111','past-deleted','{"id":"past-deleted","repeatSeriesId":"series","repeatDate":"2026-11-06","deletedAt":1700000000000}');
insert into public.lbd_habits values('11111111-1111-4111-8111-111111111111','gym','{"id":"gym","name":"GYM","logs":{"2026-10-26":"done"}}');
insert into public.lbd_calendar_blocks values('11111111-1111-4111-8111-111111111111','gym-future','{"id":"gym-future","recurringHabitId":"gym","start":2000000000000,"end":2000003600000}');
insert into public.lbd_focus_sessions values('11111111-1111-4111-8111-111111111111','history','{"id":"history","end":1700000000000,"actual":123}');
insert into public.lbd_reviews values('11111111-1111-4111-8111-111111111111','review','{"runId":"review","outcome":"Keep"}');
"""
def sql(db, query, ok=True):
 p=subprocess.run(['docker','exec','-i','lbd-auth-pg','psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U','postgres','-d',db],input=query,text=True,capture_output=True)
 if ok and p.returncode:raise AssertionError(p.stderr)
 if not ok and not p.returncode:raise AssertionError('Expected safe rejection')
 return p

def run(name,check):
 db='lbd_delete_install_'+uuid.uuid4().hex
 sql('postgres','create database '+db)
 try:sql(db,SETUP+BASE+DATA);check(db);print('PASS:',name,flush=True)
 finally:
  assert db.startswith('lbd_delete_install_') and len(db)==51
  sql('postgres','drop database '+db)

def diagnostics(db):
 result=sql(db,DIAG).stdout.splitlines()
 assert sum(line=='|'.join(['t']*9) for line in result)==2, result
 assert '|'.join(['t']*4) in result and '|'.join(['t']*3) in result, result

def both(db,first):
 before=sql(db,DIAG).stdout
 assert 't|t|f|f|f|f|f|f|f' in before and 't|f|f|f|f|f|f|f|f' in before,before
 sql(db,HABIT if first=='habit' else TASK)
 sql(db,TASK if first=='habit' else HABIT)
 diagnostics(db)
 sql(db,"""
set role authenticated; set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $$begin if public.lbd_task_repeat_capabilities()<>1 or public.lbd_habit_deletion_capabilities()<>1 then raise exception 'Capability';end if;end$$;
update public.lbd_tasks set payload=payload||'{"deletedAt":1800000000000}'::jsonb where id='qwqr';
update public.lbd_habits set payload=payload||'{"deletedAt":1800000000000,"archived":true}'::jsonb where id='gym';
-- Offline clients and full-workspace replacement cannot erase durable deletion intent.
delete from public.lbd_tasks where id='qwqr';
insert into public.lbd_tasks values('11111111-1111-4111-8111-111111111111','qwqr','{"id":"qwqr","title":"stale"}');
update public.lbd_habits set payload='{"id":"gym","name":"stale","logs":{}}' where id='gym';
do $$begin
 if not exists(select 1 from public.lbd_tasks where id='qwqr' and payload?'deletedAt' and payload->'checklist'->0->>'text'='Keep') then raise exception 'Task resurrected or Checklist lost';end if;
 if not exists(select 1 from public.lbd_habits where id='gym' and payload?'deletedAt' and payload->'logs'->>'2026-10-26'='done') then raise exception 'Habit resurrected/history lost';end if;
 if (select payload->>'title' from public.lbd_tasks where id='independent')<>'Keep independent' or (select count(*) from public.lbd_focus_sessions)<>1 then raise exception 'Unrelated data changed';end if;
end$$;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$begin
 if jsonb_array_length(public.lbd_read_task_deletions())<>0 or exists(select 1 from public.lbd_habit_deletions) then raise exception 'Cross-owner ledger read';end if;
end$$;
reset role;
""")
 assert 'already or partly installed' in sql(db,TASK,False).stderr
 sql(db,"do $$begin if (select count(*) from public.lbd_task_repeat_deletions)<>2 then raise exception 'Rerun changed ledger';end if;end$$;")

def no_task_objects(db):
 sql(db,"do $$begin if to_regclass('public.lbd_task_repeat_deletions') is not null or to_regprocedure('public.lbd_task_repeat_capabilities()') is not null then raise exception 'Partial installation';end if;if (select payload->>'title' from public.lbd_tasks where id='qwqr')<>'qwqr' then raise exception 'Data changed';end if;end$$;")
def partial(db):
 sql(db,'create function public.lbd_read_task_deletions(integer) returns jsonb language sql as $$select \'[]\'::jsonb$$;')
 assert 'partly installed' in sql(db,TASK,False).stderr
 no_task_objects(db)
 sql(db,"do $$begin if to_regprocedure('public.lbd_read_task_deletions(integer)') is null then raise exception 'Existing function dropped';end if;end$$;")
def rls(db):
 sql(db,"alter policy owner_access on public.lbd_tasks using(true);")
 assert 'RLS USING' in sql(db,TASK,False).stderr;no_task_objects(db)
def columns(db):
 sql(db,'alter table public.lbd_tasks add column unexpected text;')
 assert 'columns/types' in sql(db,TASK,False).stderr;no_task_objects(db)
def late_failure(db):
 sql(db,TASK.replace("notify pgrst, 'reload schema';",'select 1/0;'),False);no_task_objects(db)
def mutation(db):
 changed=TASK.replace('do $postflight$',"set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';\nupdate public.lbd_tasks set payload=payload||'{\"title\":\"unexpected\"}'::jsonb where id='qwqr';\ndo $postflight$")
 assert 'Existing data changed' in sql(db,changed,False).stderr;no_task_objects(db)
def marker(db):
 sql(db,"update public.lbd_tasks set payload=payload||'{\"repeatSeriesId\":\"\"}'::jsonb where id='past-deleted';")
 assert 'invalid series/id' in sql(db,TASK,False).stderr;no_task_objects(db)
for name,check in [
 ('Habit then Task installers: diagnostics, backfill, owner RLS, stale clients and preserved history',lambda db:both(db,'habit')),
 ('Task then Habit installers: compatible without replacing duplicate objects',lambda db:both(db,'task')),
 ('partial/overloaded RPC refuses install without dropping existing function',partial),
 ('unsafe owner policy refuses install',rls),
 ('unexpected Task columns refuse install',columns),
 ('late SQL error rolls back all Task DDL',late_failure),
 ('postflight catches data mutation and rolls it back',mutation),
 ('invalid Task marker refuses install without erasing it',marker),
]:run(name,check)
