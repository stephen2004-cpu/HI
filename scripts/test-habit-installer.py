"""Tests ONLY a disposable database in the named localhost Docker test container.
No managed Supabase URLs/credentials are read. No real application database is touched.
"""
from pathlib import Path
import subprocess
import uuid

ROOT = Path(__file__).resolve().parent.parent
INSTALL = (ROOT / 'supabase/manual/install_habit_deletions_safe.sql').read_text()
BASE = (ROOT / 'supabase/migrations/202610270001_auth_workspace.sql').read_text()
ORIGINAL = (ROOT / 'supabase/migrations/202610300001_habit_deletions.sql').read_text()
assert ORIGINAL in INSTALL, 'Installer must embed the unchanged reviewed migration'
CONTAINER = 'lbd-auth-pg'
SEED = """
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
grant usage on schema auth,public to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
"""
DATA = """
insert into auth.users values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
insert into public.lbd_workspaces(user_id,settings) values('11111111-1111-4111-8111-111111111111','{"unchanged":true}');
insert into public.lbd_habits values
 ('11111111-1111-4111-8111-111111111111','gym','{"id":"gym","name":"GYM","logs":{"2026-10-26":"done"}}'),
 ('11111111-1111-4111-8111-111111111111','already-deleted','{"id":"already-deleted","deletedAt":1700000000000,"archived":true,"logs":{"2026-10-25":"done"}}');
insert into public.lbd_tasks values('11111111-1111-4111-8111-111111111111','independent','{"id":"independent","title":"Keep Task"}');
insert into public.lbd_calendar_blocks values('11111111-1111-4111-8111-111111111111','future','{"id":"future","start":2000000000000,"end":2000003600000,"recurringHabitId":"gym"}');
insert into public.lbd_focus_sessions values('11111111-1111-4111-8111-111111111111','history','{"id":"history","end":1700000000000,"actual":123}');
insert into public.lbd_reviews values('11111111-1111-4111-8111-111111111111','review','{"runId":"review","outcome":"Keep review"}');
"""

def sql(db, query, ok=True):
    result = subprocess.run(['docker','exec','-i',CONTAINER,'psql','-X','-q','-v','ON_ERROR_STOP=1','-U','postgres','-d',db], input=query, text=True, capture_output=True)
    if ok and result.returncode:
        raise AssertionError(result.stderr)
    if not ok and result.returncode == 0:
        raise AssertionError('Expected transaction to be rejected')
    return result

def run(label, check):
    db = 'lbd_habit_installer_test_' + uuid.uuid4().hex
    sql('postgres', 'create database ' + db + ';')
    try:
        sql(db, SEED + BASE + DATA)
        check(db)
        print('PASS:', label, flush=True)
    finally:
        # Only the random database created immediately above; never the existing test backend.
        assert db.startswith('lbd_habit_installer_test_') and len(db) == 57
        sql('postgres', 'drop database ' + db + ';')

NO_INSTALL = """
do $$ begin
 if to_regclass('public.lbd_habit_deletions') is not null
  or to_regprocedure('public.lbd_habit_deletion_capabilities()') is not null then
  raise exception 'Partial installation escaped rollback';
 end if;
 if (select count(*) from public.lbd_habits) <> 2
  or (select payload->>'name' from public.lbd_habits where id='gym') <> 'GYM' then
  raise exception 'Original Habit data changed';
 end if;
end $$;
"""

def success(db):
    sql(db, INSTALL)
    sql(db, """
do $$ begin
 if (select count(*) from public.lbd_habit_deletions) <> 1 then raise exception 'Backfill failed'; end if;
end $$;
set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $$ declare snapshot jsonb; rev bigint; begin
 if public.lbd_habit_deletion_capabilities() <> 1 then raise exception 'Capability failed'; end if;
 snapshot := public.lbd_read_workspace()->'payload';
 update public.lbd_habits set payload=payload || '{"deletedAt":1800000000000,"archived":true}'::jsonb where id='gym';
 -- Simulate a stale device uploading its old workspace, including its old future block.
 rev := public.lbd_commit_workspace(0,snapshot);
 if not exists(select 1 from public.lbd_habits where id='gym' and payload ? 'deletedAt'
  and payload->'logs'='{"2026-10-26":"done"}'::jsonb) then raise exception 'Habit resurrected or logs lost'; end if;
 if not exists(select 1 from public.lbd_calendar_blocks where id='future' and payload->>'cancelled'='true') then raise exception 'Future block resurrected'; end if;
 if not exists(select 1 from public.lbd_tasks where id='independent') or
  not exists(select 1 from public.lbd_focus_sessions where id='history' and payload->>'actual'='123') or
  not exists(select 1 from public.lbd_reviews where id='review') then raise exception 'Unrelated data lost'; end if;
end $$;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$ begin
 if exists(select 1 from public.lbd_habit_deletions) then raise exception 'RLS leaked another owner'; end if;
end $$;
reset role;
""")
    result = sql(db, INSTALL, ok=False)
    assert 'already or partly installed' in result.stderr
    sql(db,"do $$ begin if (select count(*) from public.lbd_habit_deletions) <> 2 then raise exception 'Rerun altered ledger'; end if; end $$;")


def partial(db):
    sql(db, 'create table public.lbd_habit_deletions(marker text);')
    assert 'already or partly installed' in sql(db, INSTALL, ok=False).stderr
    sql(db, "do $$ begin if to_regprocedure('public.lbd_habit_deletion_capabilities()') is not null then raise exception 'Partial install changed'; end if; end $$;")


def late_failure(db):
    broken = INSTALL.replace("notify pgrst, 'reload schema';", "select 1/0;")
    assert 'division by zero' in sql(db, broken, ok=False).stderr
    sql(db, NO_INSTALL)


def changed_data(db):
    changed = INSTALL.replace('-- END original migration.',
        "update public.lbd_tasks set payload=payload || '{\"title\":\"Unexpected change\"}'::jsonb;\n-- END original migration.")
    assert 'Existing data changed' in sql(db, changed, ok=False).stderr
    sql(db, NO_INSTALL)
    sql(db, "do $$ begin if (select payload->>'title' from public.lbd_tasks where id='independent') <> 'Keep Task' then raise exception 'Task change escaped rollback'; end if; end $$;")


def changed_rpc(db):
    sql(db, "create or replace function public.lbd_read_workspace() returns jsonb language sql as $$ select '{}'::jsonb $$;")
    assert 'Workspace RPC differs' in sql(db, INSTALL, ok=False).stderr
    sql(db, NO_INSTALL)


def invalid_marker(db):
    sql(db, "update public.lbd_habits set payload=payload || '{\"deletedAt\":null}'::jsonb where id='gym';")
    assert 'invalid deletion marker' in sql(db, INSTALL, ok=False).stderr
    sql(db, NO_INSTALL)


def changed_rls(db):
    sql(db, 'alter table public.lbd_habits disable row level security;')
    assert 'Unexpected RLS' in sql(db, INSTALL, ok=False).stderr
    sql(db, NO_INSTALL)


def changed_columns(db):
    sql(db, 'alter table public.lbd_tasks add column unexpected text;')
    assert 'Unexpected columns/types' in sql(db, INSTALL, ok=False).stderr
    sql(db, NO_INSTALL)

for label, check in [
    ('compatible schema installs atomically, preserves data, backfills tombstones, stale-device write and owner RLS work; rerun is refused', success),
    ('partial installation is refused without dropping anything', partial),
    ('late SQL failure rolls back all DDL and data', late_failure),
    ('postflight detects a changed existing row and rolls back everything', changed_data),
    ('unknown workspace RPC is refused', changed_rpc),
    ('invalid existing deletion marker is refused', invalid_marker),
    ('unexpected RLS is refused', changed_rls),
    ('unexpected columns are refused', changed_columns),
]:
    run(label, check)
