-- Apply only to a dedicated Supabase development/Preview project first.
create table public.lbd_workspaces (
 user_id uuid primary key references auth.users(id) on delete cascade,
 revision bigint not null default 0 check (revision >= 0),
 settings jsonb not null default '{}'::jsonb,
 run jsonb,
 preferences jsonb not null default '{"weekStart":1,"blockMinutes":60}'::jsonb,
 updated_at timestamptz not null default now()
);
create table public.lbd_tasks (user_id uuid not null references auth.users(id) on delete cascade,id text not null,payload jsonb not null check(jsonb_typeof(payload)='object'),primary key(user_id,id));
create table public.lbd_calendar_blocks (like public.lbd_tasks including all);
alter table public.lbd_calendar_blocks add foreign key(user_id) references auth.users(id) on delete cascade;
create table public.lbd_habits (like public.lbd_tasks including all);
alter table public.lbd_habits add foreign key(user_id) references auth.users(id) on delete cascade;
create table public.lbd_focus_sessions (like public.lbd_tasks including all);
alter table public.lbd_focus_sessions add foreign key(user_id) references auth.users(id) on delete cascade;
create table public.lbd_reviews (like public.lbd_tasks including all);
alter table public.lbd_reviews add foreign key(user_id) references auth.users(id) on delete cascade;
do $$ declare t text; begin
 foreach t in array array['lbd_workspaces','lbd_tasks','lbd_calendar_blocks','lbd_habits','lbd_focus_sessions','lbd_reviews'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('alter table public.%I force row level security',t);
  execute format('revoke all on public.%I from anon',t);
  execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  execute format('create policy owner_access on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',t);
 end loop;
end $$;
create function public.lbd_read_workspace() returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.lbd_workspaces; uid uuid := auth.uid(); result jsonb;
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into w from public.lbd_workspaces where user_id=uid;
 if not found then return jsonb_build_object('revision',0,'payload',null); end if;
 select jsonb_build_object('revision',w.revision,'payload',jsonb_build_object(
  'timer',jsonb_build_object('version',1,'settings',w.settings,'snapshot',jsonb_build_object('run',w.run,'history',coalesce((select jsonb_agg(payload order by (payload->>'end')::numeric desc) from public.lbd_focus_sessions where user_id=uid),'[]'::jsonb))),
  'tasks',jsonb_build_object('version',1,'tasks',coalesce((select jsonb_agg(payload order by id) from public.lbd_tasks where user_id=uid),'[]'::jsonb)),
  'planner',jsonb_build_object('version',1,'preferences',w.preferences,'blocks',coalesce((select jsonb_agg(payload order by id) from public.lbd_calendar_blocks where user_id=uid),'[]'::jsonb)),
  'habits',jsonb_build_object('version',1,'habits',coalesce((select jsonb_agg(payload order by id) from public.lbd_habits where user_id=uid),'[]'::jsonb)),
  'reviews',coalesce((select jsonb_agg(payload order by id) from public.lbd_reviews where user_id=uid),'[]'::jsonb)
 )) into result;
 return result;
end $$;
create function public.lbd_commit_workspace(expected_revision bigint,payload jsonb) returns bigint language plpgsql security invoker set search_path='' as $$
declare uid uuid := auth.uid(); rev bigint; items jsonb; table_name text; key_name text; arr jsonb; n int;
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if expected_revision < 0 or jsonb_typeof(payload) <> 'object' or payload->'timer'->>'version' is distinct from '1' or payload->'tasks'->>'version' is distinct from '1' or payload->'planner'->>'version' is distinct from '1' or payload->'habits'->>'version' is distinct from '1' then raise exception 'Invalid workspace' using errcode='22023'; end if;
 if jsonb_typeof(payload->'timer'->'settings') is distinct from 'object' or jsonb_typeof(payload->'planner'->'preferences') is distinct from 'object' then raise exception 'Invalid settings' using errcode='22023'; end if;
 insert into public.lbd_workspaces(user_id) values(uid) on conflict do nothing;
 select revision into rev from public.lbd_workspaces where user_id=uid for update;
 if rev <> expected_revision then raise exception 'Workspace revision conflict' using errcode='40001'; end if;
 for n in 1..5 loop
  table_name := (array['lbd_tasks','lbd_calendar_blocks','lbd_habits','lbd_focus_sessions','lbd_reviews'])[n];
  key_name := case when n=5 then 'runId' else 'id' end;
  arr := case n when 1 then payload->'tasks'->'tasks' when 2 then payload->'planner'->'blocks' when 3 then payload->'habits'->'habits' when 4 then payload->'timer'->'snapshot'->'history' else payload->'reviews' end;
  if jsonb_typeof(arr) is distinct from 'array' then raise exception 'Invalid records' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(arr) e where jsonb_typeof(e) <> 'object' or jsonb_typeof(e->key_name) is distinct from 'string' or length(e->>key_name)=0) then raise exception 'Invalid record id' using errcode='22023'; end if;
  execute format('delete from public.%I where user_id=$1',table_name) using uid;
  execute format('insert into public.%I(user_id,id,payload) select $1,e->>$3,e from jsonb_array_elements($2) e',table_name) using uid,arr,key_name;
 end loop;
 update public.lbd_workspaces set revision=rev+1,settings=payload->'timer'->'settings',run=nullif(payload->'timer'->'snapshot'->'run','null'::jsonb),preferences=payload->'planner'->'preferences',updated_at=now() where user_id=uid;
 return rev+1;
end $$;
revoke all on function public.lbd_read_workspace() from public,anon;
revoke all on function public.lbd_commit_workspace(bigint,jsonb) from public,anon;
grant execute on function public.lbd_read_workspace() to authenticated;
grant execute on function public.lbd_commit_workspace(bigint,jsonb) to authenticated;
