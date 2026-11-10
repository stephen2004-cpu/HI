"""Disposable local databases/API only; reproduces the production v14.18 retry loop.

Requires scripts/local-auth-stack.mjs. No managed URLs or credentials are used.
An intentionally failing old RPC runs for a few seconds in one isolated API;
finally always removes that API before dropping its random test database.
"""
from pathlib import Path
import base64
import concurrent.futures
import hashlib
import hmac
import json
import os
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parent.parent
fixture = {'__file__': str(ROOT / 'scripts/test-deletion-installers.py')}
source = (ROOT / 'scripts/test-deletion-installers.py').read_text()
exec(source[:source.index('def sql(')], fixture)
INCREMENTAL = (ROOT / 'supabase/manual/install_workspace_incremental_sync_safe.sql').read_text()
INSTALL = (ROOT / 'supabase/manual/fix_workspace_conflict_retry_safe.sql').read_text()
DIAG = (ROOT / 'supabase/diagnostics/workspace_conflict_retry_readonly.sql').read_text()
COMBINED = (ROOT / 'supabase/diagnostics/workspace_incremental_sync_readonly.sql').read_text()
USER = '11111111-1111-4111-8111-111111111111'
AUTH = f"set local role authenticated;set local request.jwt.claim.sub='{USER}';"


def sql(db, query, ok=True):
    result = subprocess.run(
        ['docker', 'exec', '-i', 'lbd-auth-pg', 'psql', '-X', '-q', '-t', '-A',
         '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', db],
        input=query, text=True, capture_output=True,
    )
    if ok and result.returncode:
        raise AssertionError(result.stderr)
    if not ok and not result.returncode:
        raise AssertionError('Expected safe rejection')
    return result


def run(label, check):
    db = 'lbd_conflict_' + uuid.uuid4().hex
    sql('postgres', 'create database ' + db)
    try:
        sql(db, fixture['SETUP'] + """
create or replace function auth.uid() returns uuid language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
 nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
$$;
""" + fixture['BASE'] + fixture['DATA'] + fixture['HABIT'] + fixture['TASK'] + INCREMENTAL)
        check(db)
        print('PASS:', label, flush=True)
    finally:
        assert db.startswith('lbd_conflict_') and len(db) == 45
        sql('postgres', 'drop database ' + db)


def body_hash(db):
    return sql(db, "select md5(regexp_replace(prosrc,'[[:space:]]','','g')) from pg_proc where oid='public.lbd_commit_workspace(bigint,jsonb)'::regprocedure;").stdout.strip()


def snapshot(db):
    return json.loads(sql(db, 'begin;' + AUTH + 'select public.lbd_read_workspace();rollback;').stdout.strip())


def atomic(db):
    before = snapshot(db)
    digest = body_hash(db)
    bad = INSTALL.replace("notify pgrst, 'reload schema';", 'select 1/0;')
    assert 'division by zero' in sql(db, bad, False).stderr
    assert body_hash(db) == digest and snapshot(db) == before
    changed = INSTALL.replace('do $postflight$', "update public.lbd_focus_sessions set payload=payload||'{\"unexpected\":true}'::jsonb;do $postflight$")
    assert 'Existing app rows changed' in sql(db, changed, False).stderr
    assert body_hash(db) == digest and snapshot(db) == before
    sql(db, INSTALL)
    assert body_hash(db) == '3f50887f07c901afc81c32237eeb8a7e'
    assert snapshot(db) == before
    assert sql(db, DIAG).stdout.strip() == 't|t|t|t|t'
    assert sql(db, COMBINED).stdout.strip() == '|'.join(['t'] * 11)
    assert 'differs from the reviewed source' in sql(db, INSTALL, False).stderr


def unsafe(db):
    digest = body_hash(db)
    sql(db, 'alter table public.lbd_tasks disable row level security;')
    assert 'RLS' in sql(db, INSTALL, False).stderr
    assert body_hash(db) == digest
    sql(db, 'alter table public.lbd_tasks enable row level security;')
    sql(db, "alter function public.lbd_commit_workspace(bigint,jsonb) security definer;")
    assert 'differs from the reviewed source' in sql(db, INSTALL, False).stderr
    sql(db, "alter function public.lbd_commit_workspace(bigint,jsonb) security invoker;")
    sql(db, "create or replace function public.lbd_commit_workspace(expected_revision bigint,payload jsonb) returns bigint language sql as $$select 0::bigint$$;")
    assert 'differs from the reviewed source' in sql(db, INSTALL, False).stderr


def stale_and_guards(db):
    sql(db, INSTALL)
    before = snapshot(db)
    w = json.loads(json.dumps(before['payload']))
    arg = json.dumps(w).replace("'", "''")
    result = sql(db, f"begin;{AUTH}select public.lbd_commit_workspace(99,'{arg}'::jsonb);commit;", False)
    assert 'Workspace revision conflict' in result.stderr and '40001' in result.stderr
    assert snapshot(db) == before
    # All business protections remain in the incremental function/guards.
    for h in w['habits']['habits']:
        h['deletedAt'] = 1800000000000
        h['archived'] = True
    for t in w['tasks']['tasks']:
        if t['id'] == 'qwqr':
            t['deletedAt'] = 1800000000000
    arg = json.dumps(w).replace("'", "''")
    sql(db, f"begin;{AUTH}select public.lbd_commit_workspace(0,'{arg}'::jsonb);commit;")
    live = snapshot(db)
    stale = json.dumps(before['payload']).replace("'", "''")
    sql(db, f"begin;{AUTH}select public.lbd_commit_workspace(1,'{stale}'::jsonb);commit;")
    current = snapshot(db)['payload']
    assert current['habits']['habits'][0]['deletedAt'] == 1800000000000
    assert next(t for t in current['tasks']['tasks'] if t['id'] == 'qwqr')['deletedAt'] == 1800000000000
    assert current['planner']['blocks'][0]['cancelled'] is True
    assert current['timer']['snapshot']['history'] == live['payload']['timer']['snapshot']['history']
    sql(db, "begin;set local role authenticated;set local request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';do $$begin if exists(select 1 from public.lbd_tasks) or exists(select 1 from public.lbd_habit_deletions) or exists(select 1 from public.lbd_task_repeat_deletions) then raise exception 'RLS leak';end if;end$$;rollback;")


def api_reproduction(db):
    image = os.environ.get('LBD_POSTGREST_PROBE_IMAGE', 'postgrest/postgrest:v14.18')
    if image not in ('postgrest/postgrest:v14.18', 'postgrest/postgrest:v16.5'):
        raise AssertionError('Use a reviewed local test image')
    env = dict(line.split('=', 1) for line in Path('/tmp/lbd-auth-stack/rest.env').read_text().splitlines())
    address = urllib.parse.urlsplit(env['PGRST_DB_URI'])
    assert address.hostname == 'lbd-auth-pg'
    env['PGRST_DB_URI'] = urllib.parse.urlunsplit(address._replace(path='/' + db))
    env.update(PGRST_DB_POOL='1', PGRST_DB_POOL_ACQUISITION_TIMEOUT='1')
    name = 'lbd-conflict-api-' + uuid.uuid4().hex[:12]
    old_definition = sql(db, "select pg_get_functiondef('public.lbd_commit_workspace(bigint,jsonb)'::regprocedure);").stdout.strip()
    def encode(value):
        return base64.urlsafe_b64encode(json.dumps(value, separators=(',', ':')).encode()).decode().rstrip('=')
    content = encode({'alg': 'HS256', 'typ': 'JWT'}) + '.' + encode({'role': 'authenticated', 'sub': USER, 'iss': 'supabase', 'iat': int(time.time()), 'exp': int(time.time()) + 600})
    token = content + '.' + base64.urlsafe_b64encode(hmac.new(env['PGRST_JWT_SECRET'].encode(), content.encode(), hashlib.sha256).digest()).decode().rstrip('=')
    pool = None
    with tempfile.TemporaryDirectory(prefix='lbd-conflict-') as directory:
        config = Path(directory) / 'rest.env'
        config.write_text('\n'.join(k + '=' + v for k, v in env.items()))
        config.chmod(0o600)
        try:
            result = subprocess.run(['docker', 'run', '-d', '--name', name, '--network', 'lbd-auth-test', '-p', '127.0.0.1::3000', '--env-file', str(config), image], capture_output=True, text=True)
            if result.returncode:
                raise AssertionError('Could not launch isolated test API')
            binding = subprocess.check_output(['docker', 'port', name, '3000/tcp'], text=True).strip()
            assert binding.startswith('127.0.0.1:')
            base = 'http://' + binding
            def api(rpc, args=None, timeout=8):
                req = urllib.request.Request(base + '/rpc/' + rpc, data=json.dumps(args or {}).encode(), headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
                try:
                    with urllib.request.urlopen(req, timeout=timeout) as response:
                        return response.status, json.load(response)
                except urllib.error.HTTPError as error:
                    return error.code, json.load(error)
            for _ in range(80):
                try:
                    if api('lbd_read_workspace', timeout=.5)[0] == 200:
                        break
                except Exception:
                    pass
                time.sleep(.1)
            else:
                raise AssertionError('Test API did not become ready')
            w = api('lbd_read_workspace')[1]['payload']
            assert api('lbd_commit_workspace', {'expected_revision': 0, 'payload': w}) == (200, 1)
            baseline = api('lbd_read_workspace')[1]
            rollbacks = int(sql(db, "select xact_rollback from pg_stat_database where datname=current_database();").stdout)
            if image.endswith(':v14.18'):
                try:
                    api('lbd_commit_workspace', {'expected_revision': 0, 'payload': w}, timeout=.25)
                    raise AssertionError('Old v14 RPC should not return a stale revision')
                except TimeoutError:
                    pass
                time.sleep(1.2)
                blocked = api('lbd_read_workspace', timeout=3)
                assert blocked[1]['code'] == 'PGRST003', blocked
                delta = int(sql(db, "select xact_rollback from pg_stat_database where datname=current_database();").stdout) - rollbacks
                assert delta > 10, delta
                print('LOCAL v14.18: client disconnected; pool read status/code:', blocked[0], blocked[1]['code'], '; rollback delta:', delta, flush=True)
            sql(db, INSTALL)
            assert api('lbd_read_workspace', timeout=2) == (200, baseline)
            started = time.monotonic()
            rejected = api('lbd_commit_workspace', {'expected_revision': 0, 'payload': w}, timeout=2)
            assert rejected == (409, {'code': '40001', 'message': 'Workspace revision conflict', 'details': None, 'hint': None}), rejected
            print('FIXED:', image, 'HTTP 409 / public code 40001 in', round(time.monotonic() - started, 3), 'seconds', flush=True)
            assert api('lbd_read_workspace') == (200, baseline)
            pool = concurrent.futures.ThreadPoolExecutor(max_workers=2)
            left, right = json.loads(json.dumps(baseline['payload'])), json.loads(json.dumps(baseline['payload']))
            next(t for t in left['tasks']['tasks'] if t['id'] == 'independent')['title'] = 'First device'
            next(t for t in right['tasks']['tasks'] if t['id'] == 'independent')['title'] = 'Second device'
            outcomes = [pool.submit(api, 'lbd_commit_workspace', {'expected_revision': 1, 'payload': v}, 3) for v in (left, right)]
            outcomes = [f.result(timeout=4) for f in outcomes]
            assert sorted(result[0] for result in outcomes) == [200, 409], outcomes
            after = api('lbd_read_workspace')[1]
            assert after['revision'] == 2
            assert after['payload']['timer']['snapshot']['history'] == baseline['payload']['timer']['snapshot']['history']
            if image.endswith(':v14.18'):
                # The same live function replacement also releases a client still waiting.
                sql(db, old_definition)
                inflight = pool.submit(api, 'lbd_commit_workspace', {'expected_revision': 0, 'payload': w}, 8)
                time.sleep(.2)
                assert not inflight.done()
                sql(db, INSTALL)
                assert inflight.result(timeout=3)[0] == 409
                assert api('lbd_read_workspace') == (200, after)
        finally:
            # Always stop a reproducing retry loop, even if an assertion fails.
            subprocess.run(['docker', 'rm', '-f', name], capture_output=True)
            if pool:
                pool.shutdown(wait=True)


run('installer is atomic, preserves app data/security and verifies both diagnostics', atomic)
run('installer refuses changed RLS, security-definer or unknown source', unsafe)
run('stale commits preserve all rows; Habit/Task tombstones, block guard and owner RLS remain effective', stale_and_guards)
run('production API reproduction, disconnected/in-flight loops released, old-client error contract and two-device CAS', api_reproduction)
