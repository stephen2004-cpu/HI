"""Tests only random databases in lbd-auth-pg. Never connects to managed Supabase."""
from pathlib import Path
import subprocess, uuid, json, time
ROOT=Path(__file__).resolve().parent.parent
context={'__file__':str(ROOT/'scripts/test-deletion-installers.py')}
source=(ROOT/'scripts/test-deletion-installers.py').read_text()
exec(source[:source.index('def sql(')],context)
INSTALL=(ROOT/'supabase/manual/install_workspace_incremental_sync_safe.sql').read_text()
ROLLBACK=(ROOT/'supabase/manual/rollback_workspace_incremental_sync_safe.sql').read_text()
USER='11111111-1111-4111-8111-111111111111'
def sql(db,query,ok=True):
 p=subprocess.run(['docker','exec','-i','lbd-auth-pg','psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U','postgres','-d',db],input=query,text=True,capture_output=True)
 if ok and p.returncode: raise AssertionError(p.stderr)
 if not ok and not p.returncode: raise AssertionError('Expected rejection')
 return p

def run(label,check):
 db='lbd_incremental_'+uuid.uuid4().hex
 sql('postgres','create database '+db)
 try:
  sql(db,context['SETUP']+context['BASE']+context['DATA']+context['HABIT']+context['TASK'])
  check(db)
  print('PASS:',label,flush=True)
 finally:
  assert db.startswith('lbd_incremental_') and len(db)==48
  sql('postgres','drop database '+db)

AUTH=f"set local role authenticated; set local request.jwt.claim.sub='{USER}';"
MEASURE="""
select json_build_object('inserted',coalesce(sum(n_tup_ins),0),'updated',coalesce(sum(n_tup_upd),0),'deleted',coalesce(sum(n_tup_del),0))
from pg_stat_xact_user_tables where relname in ('lbd_tasks','lbd_calendar_blocks','lbd_habits','lbd_focus_sessions','lbd_reviews');
"""
def commit(w,rev=0):
 return "select public.lbd_commit_workspace(%s,'%s'::jsonb);"%(rev,json.dumps(w,ensure_ascii=False).replace("'","''"))
def snapshot(db):
 lines=sql(db,f"begin;{AUTH}select public.lbd_read_workspace()->'payload';rollback;").stdout.strip().splitlines()
 return json.loads(lines[-1])

def no_op(db):
 sql(db,"begin;"+AUTH+"insert into public.lbd_tasks(user_id,id,payload) select '11111111-1111-4111-8111-111111111111','bench-'||i,jsonb_build_object('id','bench-'||i,'title','Unchanged task') from generate_series(1,1000) i;commit;")
 # Warm ledger-derived cancelled block normalization before comparing no-op writes.
 sql(db,f"begin;{AUTH}select public.lbd_commit_workspace(0,public.lbd_read_workspace()->'payload');commit;")
 before=sql(db,f"begin;{AUTH}select public.lbd_commit_workspace(1,public.lbd_read_workspace()->'payload');{MEASURE}rollback;").stdout.strip().splitlines()
 before=json.loads(before[-1]); assert before['inserted']>0 and before['deleted']>0,before
 sql(db,INSTALL)
 after=sql(db,f"begin;{AUTH}select public.lbd_commit_workspace(1,public.lbd_read_workspace()->'payload');{MEASURE}rollback;").stdout.strip().splitlines()
 after=json.loads(after[-1]); assert after=={'inserted':0,'updated':0,'deleted':0},after
 print('METRICS unchanged snapshot:',json.dumps({'old':before,'incremental':after}),flush=True)
 sql(db,ROLLBACK)
 result=sql(db,f"begin;{AUTH}select public.lbd_commit_workspace(1,public.lbd_read_workspace()->'payload');{MEASURE}rollback;").stdout.strip().splitlines()
 assert json.loads(result[-1])['inserted']>0

def changes(db):
 sql(db,INSTALL);w=snapshot(db)
 for t in w['tasks']['tasks']:
  if t['id']=='independent':t['title']='A real change';t['checklist']=[{'id':'s','text':'Keep document','done':True,'documents':[{'id':'d','name':'Doc','url':'https://example.com'}]}]
 w['tasks']['tasks'].append({'id':'new','title':'New','notes':'','group':'do','color':'','completed':False})
 out=sql(db,f"begin;{AUTH}{commit(w)}{MEASURE}commit;").stdout.strip().splitlines()
 metric=json.loads(out[-1]);assert metric['inserted']==1 and metric['updated']==1 and metric['deleted']==0,metric
 after=snapshot(db);assert sorted(after['tasks']['tasks'],key=lambda t:t['id'])==sorted(w['tasks']['tasks'],key=lambda t:t['id']) and after['timer']['snapshot']['history']==w['timer']['snapshot']['history']
 w['tasks']['tasks']=[t for t in w['tasks']['tasks'] if t['id']!='new']
 sql(db,f"begin;{AUTH}{commit(w,1)}commit;")
 assert all(t['id']!='new' for t in snapshot(db)['tasks']['tasks'])

def guards(db):
 sql(db,INSTALL);w=snapshot(db);stale=json.loads(json.dumps(w))
 for h in w['habits']['habits']:h['deletedAt']=1800000000000;h['archived']=True
 for t in w['tasks']['tasks']:
  if t['id']=='qwqr':t['deletedAt']=1800000000000
 sql(db,f"begin;{AUTH}{commit(w)}commit;")
 sql(db,f"begin;{AUTH}{commit(stale,1)}commit;")
 current=snapshot(db)
 assert current['habits']['habits'][0]['deletedAt']==1800000000000
 assert next(t for t in current['tasks']['tasks'] if t['id']=='qwqr')['deletedAt']==1800000000000
 assert current['planner']['blocks'][0]['cancelled'] is True
 assert current['timer']['snapshot']['history']==w['timer']['snapshot']['history']
 assert next(t for t in current['tasks']['tasks'] if t['id']=='independent')==next(t for t in w['tasks']['tasks'] if t['id']=='independent')
 sql(db,f"begin;set local role authenticated;set local request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';do $$begin if exists(select 1 from public.lbd_tasks) or exists(select 1 from public.lbd_habit_deletions) or exists(select 1 from public.lbd_task_repeat_deletions) then raise exception 'RLS leak';end if;end$$;rollback;")

def rejected(db):
 sql(db,INSTALL);w=snapshot(db)
 assert 'revision conflict' in sql(db,f"begin;{AUTH}{commit(w,55)}commit;",False).stderr
 duplicate=json.loads(json.dumps(w));duplicate['tasks']['tasks'].append(duplicate['tasks']['tasks'][0])
 assert 'Duplicate record id' in sql(db,f"begin;{AUTH}{commit(duplicate)}commit;",False).stderr
 broken=json.loads(json.dumps(w));broken['reviews']=[{'runId':'changed'},{'runId':'changed'}];next(t for t in broken['tasks']['tasks'] if t['id']=='independent')['title']='Must roll back'
 assert 'Duplicate record id' in sql(db,f"begin;{AUTH}{commit(broken)}commit;",False).stderr
 assert snapshot(db)==w

def install_atomic(db):
 assert 'division by zero' in sql(db,INSTALL.replace("notify pgrst, 'reload schema';",'select 1/0;'),False).stderr
 altered=INSTALL.replace('do $postflight$', "set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';update public.lbd_tasks set payload=payload||'{\"title\":\"Unexpected mutation\"}'::jsonb where id='independent';do $postflight$")
 assert 'Existing app rows changed' in sql(db,altered,False).stderr
 sql(db,INSTALL)
 assert 'differs from the reviewed source' in sql(db,INSTALL,False).stderr
 sql(db,ROLLBACK)
 assert 'differs from the reviewed source' in sql(db,ROLLBACK,False).stderr

def preflight(db):
 sql(db,'alter table public.lbd_tasks disable row level security;')
 assert 'RLS' in sql(db,INSTALL,False).stderr
 sql(db,'alter table public.lbd_tasks enable row level security;')
 sql(db,"create or replace function public.lbd_commit_workspace(expected_revision bigint,payload jsonb) returns bigint language sql as $$select 0::bigint$$;")
 assert 'differs from the reviewed source' in sql(db,INSTALL,False).stderr


def stale_no_lock(db):
 sql(db,INSTALL);w=snapshot(db)
 app='lbd_lock_'+uuid.uuid4().hex
 worker=subprocess.Popen(['docker','exec','-i','-e','PGAPPNAME='+app,'lbd-auth-pg','psql','-X','-q','-v','ON_ERROR_STOP=1','-U','postgres','-d',db],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 try:
  worker.stdin.write("begin;select revision from public.lbd_workspaces where user_id='"+USER+"' for update;select pg_sleep(3);rollback;");worker.stdin.close()
  for _ in range(30):
   if sql(db,"select exists(select 1 from pg_stat_activity where application_name='"+app+"' and wait_event='PgSleep');").stdout.strip()=='t':break
   time.sleep(.05)
  else:raise AssertionError('Local lock fixture did not start')
  result=sql(db,f"begin;set local lock_timeout='100ms';{AUTH}{commit(w,99)}rollback;",False)
  assert 'revision conflict' in result.stderr,result.stderr
 finally:
  worker.wait(timeout=5)

for label,check in [('unchanged snapshots write zero child rows and function rollback restores original behavior',no_op),('real changes affect only changed rows and preserve documents/history',changes),('stale snapshots cannot undo Habit/Task deletions, block guards and owner RLS remain enforced',guards),('stale revisions, duplicate IDs and late payload errors roll back all changes',rejected),('installer and rollback are atomic and refuse accidental reruns',install_atomic),('unexpected RLS or unknown function body refuses installation',preflight),('known-stale revision rejects before waiting on a workspace row lock',stale_no_lock)]:run(label,check)
