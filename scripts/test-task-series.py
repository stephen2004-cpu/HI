"""Task series SQL tests in random local Docker databases only; no managed DB access."""
from pathlib import Path
import json
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parent.parent
context = {'__file__': str(ROOT / 'scripts/test-deletion-installers.py')}
source = (ROOT / 'scripts/test-deletion-installers.py').read_text()
exec(source[:source.index('def sql(')], context)
INC = (ROOT / 'supabase/manual/install_workspace_incremental_sync_safe.sql').read_text()
RETRY = (ROOT / 'supabase/manual/fix_workspace_conflict_retry_safe.sql').read_text()
INSTALL = (ROOT / 'supabase/manual/install_task_series_deletions_safe.sql').read_text()
DIAG = (ROOT / 'supabase/diagnostics/task_series_readonly.sql').read_text()
UID = '11111111-1111-4111-8111-111111111111'
OTHER = '22222222-2222-4222-8222-222222222222'
AUTH = f"set local role authenticated;set local request.jwt.claim.sub='{UID}';"
BASE = {'id': 'root', 'title': 'Ăn sáng', 'notes': 'Giữ ghi chú', 'group': 'eliminate', 'color': '#ff77aa', 'completed': False, 'checklist': [{'id': 's', 'text': 'Bước', 'done': True}]}
ROOT_TASK = {**BASE, 'repeat': {'rules': [{'id': 'rule', 'effectiveDate': '2026-11-14', 'startDate': '2026-11-14', 'days': [0,1,2,3,4,5,6], 'enabled': True, 'template': {k:v for k,v in BASE.items() if k!='id'}}]}}
CHILD = {**BASE, 'id': 'child', 'repeatSeriesId': 'root', 'repeatDate': '2026-11-14', 'completed': True}
NEXT = {**CHILD, 'id': 'next', 'repeatDate': '2026-11-15', 'completed': False}


def sql(db, query, ok=True):
    result = subprocess.run(['docker','exec','-i','lbd-auth-pg','psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U','postgres','-d',db], input=query, text=True, capture_output=True)
    if ok and result.returncode: raise AssertionError(result.stderr)
    if not ok and not result.returncode: raise AssertionError('Expected rejection')
    return result


def lit(value):
    return "'" + json.dumps(value, ensure_ascii=False).replace("'", "''") + "'::jsonb"


def insert_task(t, user=UID):
    return f"insert into public.lbd_tasks values('{user}','{t['id']}',{lit(t)});"


def snapshot(db):
    return json.loads(sql(db, 'begin;' + AUTH + 'select public.lbd_read_workspace();rollback;').stdout)


def run(label, check):
    db = 'lbd_series_' + uuid.uuid4().hex
    sql('postgres', 'create database ' + db)
    try:
        sql(db, context['SETUP']+context['BASE']+context['DATA']+context['HABIT']+context['TASK']+INC+RETRY)
        sql(db, 'begin;'+AUTH+insert_task(ROOT_TASK)+insert_task(CHILD)+insert_task(NEXT)+"""
insert into public.lbd_calendar_blocks values
 ('11111111-1111-4111-8111-111111111111','child-block','{"id":"child-block","taskId":"child","recurringTaskId":"root","start":1800000000000,"end":1800003600000}'),
 ('11111111-1111-4111-8111-111111111111','manual','{"id":"manual","taskId":"next","start":1800000000000,"end":1800003600000}'),
 ('11111111-1111-4111-8111-111111111111','keep','{"id":"keep","taskId":"independent","start":1800000000000,"end":1800003600000}');
commit;
""")
        check(db)
        print('PASS:', label, flush=True)
    finally:
        assert db.startswith('lbd_series_') and len(db)==43
        sql('postgres', 'drop database ' + db)


def installed(db):
    before=snapshot(db)
    sql(db, INSTALL)
    assert snapshot(db)==before
    assert sql(db, DIAG).stdout.strip()=='|'.join(['t']*9)
    sql(db, 'begin;'+AUTH+"do $$begin if public.lbd_task_repeat_capabilities()<>1 or public.lbd_task_series_deletion_capabilities()<>1 then raise exception 'Capability changed';end if;end$$;rollback;")
    assert 'already or partly installed' in sql(db, INSTALL, False).stderr


def delete_root(db):
    sql(db, "begin;"+AUTH+"update public.lbd_tasks set payload=payload||'{\"deletedAt\":1800000000000}'::jsonb where id='root';commit;")


def cascade(db, root_last=False):
    sql(db, INSTALL)
    before=snapshot(db)['payload']
    sql(db, f"begin;set local role authenticated;set local request.jwt.claim.sub='{OTHER}';"+insert_task(ROOT_TASK,OTHER)+insert_task(CHILD,OTHER)+'commit;')
    outgoing=snapshot(db)['payload']
    for task in outgoing['tasks']['tasks']:
        if task['id']=='root' or task.get('repeatSeriesId')=='root': task['deletedAt']=1800000000000
    outgoing['tasks']['tasks'].sort(key=lambda t: (t['id']=='root') if root_last else (t['id']!='root'))
    sql(db, f"begin;{AUTH}select public.lbd_commit_workspace(0,{lit(outgoing)});commit;")
    current=snapshot(db)['payload']
    for identifier in ('root','child','next'):
        assert next(t for t in current['tasks']['tasks'] if t['id']==identifier)['deletedAt']==1800000000000
    assert next(t for t in current['tasks']['tasks'] if t['id']=='child')['checklist']==CHILD['checklist']
    blocks={b['id']:b for b in current['planner']['blocks']}
    assert blocks['child-block']['cancelled'] and blocks['manual']['cancelled']
    assert blocks['keep']==next(b for b in before['planner']['blocks'] if b['id']=='keep')
    assert current['timer']==before['timer'] and current['habits']==before['habits'] and current['reviews']==before['reviews']
    assert next(t for t in current['tasks']['tasks'] if t['id']=='independent')==next(t for t in before['tasks']['tasks'] if t['id']=='independent')
    sql(db, f"begin;set local role authenticated;set local request.jwt.claim.sub='{OTHER}';do $$begin if exists(select 1 from public.lbd_tasks where payload?'deletedAt') or jsonb_array_length(public.lbd_read_task_deletions())<>0 then raise exception 'Cross-owner cascade';end if;end$$;rollback;")


def stale(db):
    sql(db, INSTALL)
    original=snapshot(db)['payload']
    delete_root(db)
    future={**CHILD, 'id':'unseen-2030', 'repeatDate':'2030-01-01', 'completed':False}
    original['tasks']['tasks'].append(future)
    original['planner']['blocks'].append({'id':'unseen-block','taskId':'unseen-2030','recurringTaskId':'root','start':1893456000000,'end':1893459600000})
    sql(db, f"begin;{AUTH}select public.lbd_commit_workspace(0,{lit(original)});commit;")
    current=snapshot(db)['payload']
    assert all(t.get('deletedAt')==1800000000000 for t in current['tasks']['tasks'] if t['id']=='root' or t.get('repeatSeriesId')=='root')
    assert next(b for b in current['planner']['blocks'] if b['id']=='unseen-block')['cancelled']
    # Even after an old snapshot omits root/instances, durable ledger blocks recreation.
    sql(db, f"begin;{AUTH}delete from public.lbd_tasks where id in ('root','child','next','unseen-2030');"+insert_task(ROOT_TASK)+insert_task(future)+"update public.lbd_calendar_blocks set payload=payload||'{\"cancelled\":false}'::jsonb where id='unseen-block';commit;")
    current=snapshot(db)['payload']
    assert next(t for t in current['tasks']['tasks'] if t['id']=='root')['deletedAt']==1800000000000
    assert next(t for t in current['tasks']['tasks'] if t['id']=='unseen-2030')['deletedAt']==1800000000000
    assert next(b for b in current['planner']['blocks'] if b['id']=='unseen-block')['cancelled']


def single(db):
    sql(db, INSTALL)
    before=snapshot(db)['payload']
    sql(db, 'begin;'+AUTH+"update public.lbd_tasks set payload=payload||'{\"deletedAt\":1700000000000}'::jsonb where id='child';commit;")
    current=snapshot(db)['payload']
    assert next(t for t in current['tasks']['tasks'] if t['id']=='root')==ROOT_TASK
    assert next(t for t in current['tasks']['tasks'] if t['id']=='next')==NEXT
    assert next(b for b in current['planner']['blocks'] if b['id']=='child-block')['cancelled']
    assert next(b for b in current['planner']['blocks'] if b['id']=='manual')==next(b for b in before['planner']['blocks'] if b['id']=='manual')
    delete_root(db)
    current=snapshot(db)['payload']
    assert next(t for t in current['tasks']['tasks'] if t['id']=='child')['deletedAt']==1700000000000


def atomic(db):
    before=snapshot(db)
    assert 'division by zero' in sql(db, INSTALL.replace("notify pgrst, 'reload schema';", 'select 1/0;'), False).stderr
    assert snapshot(db)==before
    assert sql(db, "select to_regprocedure('public.lbd_task_series_deletion_capabilities()') is null;").stdout.strip()=='t'
    mutated=INSTALL.replace('do $postflight$', "update public.lbd_focus_sessions set payload=payload||'{\"unexpected\":true}'::jsonb;do $postflight$")
    assert 'Existing app rows changed' in sql(db, mutated, False).stderr
    assert snapshot(db)==before
    sql(db, 'alter table public.lbd_tasks disable row level security;')
    assert 'RLS' in sql(db, INSTALL, False).stderr
    sql(db, 'alter table public.lbd_tasks enable row level security;')
    sql(db, 'alter function public.lbd_guard_deleted_repeat_task() security invoker;')
    assert 'Unexpected existing Task guard' in sql(db, INSTALL, False).stderr


def malformed(db):
    sql(db, INSTALL)
    before=snapshot(db)
    assert 'Invalid Task tombstone' in sql(db, 'begin;'+AUTH+"update public.lbd_tasks set payload=payload||'{\"deletedAt\":1.5}'::jsonb where id='root';commit;", False).stderr
    assert snapshot(db)==before
    broken={**CHILD,'id':'wrong-payload-id'}
    sql(db, f"begin;{AUTH}insert into public.lbd_tasks values('{UID}','broken',{lit(broken)});commit;")
    before=snapshot(db)
    assert 'Invalid Task tombstone' in sql(db, 'begin;'+AUTH+"update public.lbd_tasks set payload=payload||'{\"deletedAt\":1800000000000}'::jsonb where id='root';commit;",False).stderr
    assert snapshot(db)==before
    assert sql(db, "select count(*) from public.lbd_task_repeat_deletions where id='root';").stdout.strip()=='0'


def bulk(db):
    sql(db, INSTALL)
    sql(db, f"begin;{AUTH}insert into public.lbd_tasks select '{UID}','bulk-'||i,jsonb_build_object('id','bulk-'||i,'title','Ăn sáng','repeatSeriesId','root','repeatDate','2030-01-01','completed',false) from generate_series(1,1000) i;insert into public.lbd_calendar_blocks select '{UID}','bulk-block-'||i,jsonb_build_object('id','bulk-block-'||i,'taskId','bulk-'||i,'recurringTaskId','root','start',1893456000000,'end',1893459600000) from generate_series(1,1000) i;commit;")
    started=time.monotonic()
    delete_root(db)
    print('LOCAL: 1,000 extra series Tasks/blocks protected in',round(time.monotonic()-started,3),'seconds',flush=True)
    assert sql(db, "select count(*) from public.lbd_task_repeat_deletions where payload->>'repeatSeriesId'='root';").stdout.strip()=='1002'
    assert sql(db, "select count(*) from public.lbd_calendar_blocks where id like 'bulk-block-%' and payload->>'cancelled'='true';").stdout.strip()=='1000'


for label, check in [
    ('atomic install preserves all rows/RPCs/RLS; diagnostics and capabilities; rerun refused',installed),
    ('root-first multi-row commit deletes whole series without ON CONFLICT self-collision and preserves other data',cascade),
    ('root-last legacy multi-row commit also protects the whole series after its statement',lambda db:cascade(db,True)),
    ('stale fresh-revision snapshots, omitted rows, unseen future dates and Calendar writes cannot resurrect a series',stale),
    ('single delete keeps siblings/root intact and older instance tombstones immutable',single),
    ('failed DDL/data postflight and unsafe RLS/guard leave existing data and objects intact',atomic),
    ('malformed root/child markers reject and roll back the whole cascade',malformed),
    ('bulk-series cascade stays bounded without a Calendar scan per child',bulk),
]:
    run(label, check)
