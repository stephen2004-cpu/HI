-- Additive V2 migration: test on an isolated database first. No existing rows are deleted.
-- Permanent IDs cannot be restored by old/offline clients or whole-workspace replacement.
create table public.lbd_habit_deletions (
 user_id uuid not null references auth.users(id) on delete cascade,
 id text not null,
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 primary key(user_id,id)
);
alter table public.lbd_habit_deletions enable row level security;
alter table public.lbd_habit_deletions force row level security;
revoke all on public.lbd_habit_deletions from public,anon,authenticated;
grant select on public.lbd_habit_deletions to authenticated;
create policy owner_read on public.lbd_habit_deletions for select to authenticated
 using ((select auth.uid()) = user_id);

create function public.lbd_guard_deleted_habit() returns trigger language plpgsql
 security definer set search_path='' as $$
declare dead jsonb;
begin
 if auth.uid() is null or new.user_id <> auth.uid() then
  raise exception 'Owner required' using errcode='42501';
 end if;
 select payload into dead from public.lbd_habit_deletions where user_id=new.user_id and id=new.id;
 if dead is not null then new.payload := dead; return new; end if;
 if new.payload ? 'deletedAt' then
  if jsonb_typeof(new.payload->'deletedAt') is distinct from 'number'
   or (new.payload->>'deletedAt')::numeric <= 0
   or (new.payload->>'deletedAt')::numeric > 9007199254740991 then
   raise exception 'Invalid deletion' using errcode='22023';
  end if;
  new.payload := new.payload || '{"archived":true,"resumeAfterArchive":false}'::jsonb;
  if new.payload->>'deletedHistory' = 'true' then
   new.payload := new.payload || '{"logs":{}}'::jsonb;
  end if;
  insert into public.lbd_habit_deletions(user_id,id,payload)
   values(new.user_id,new.id,new.payload) on conflict do nothing;
  select payload into new.payload from public.lbd_habit_deletions where user_id=new.user_id and id=new.id;
  update public.lbd_calendar_blocks set payload=payload || '{"cancelled":true}'::jsonb
   where user_id=new.user_id and (payload->>'recurringHabitId'=new.id or starts_with(id,'habit-block:' || new.id || ':'))
     and (payload->>'start')::numeric >= (new.payload->>'deletedAt')::numeric;
 end if;
 return new;
end $$;
revoke all on function public.lbd_guard_deleted_habit() from public,anon,authenticated;
create trigger guard_deleted_habit before insert or update on public.lbd_habits
 for each row execute function public.lbd_guard_deleted_habit();

create function public.lbd_guard_deleted_habit_block() returns trigger language plpgsql
 security definer set search_path='' as $$
declare dead jsonb;
begin
 if auth.uid() is null or new.user_id <> auth.uid() then
  raise exception 'Owner required' using errcode='42501';
 end if;
 select payload into dead from public.lbd_habit_deletions
  where user_id=new.user_id and (id=new.payload->>'recurringHabitId' or starts_with(new.id,'habit-block:' || id || ':'));
 if dead is not null and (new.payload->>'start')::numeric >= (dead->>'deletedAt')::numeric then
  new.payload := new.payload || '{"cancelled":true}'::jsonb;
 end if;
 return new;
end $$;
revoke all on function public.lbd_guard_deleted_habit_block() from public,anon,authenticated;
create trigger guard_deleted_habit_block before insert or update on public.lbd_calendar_blocks
 for each row execute function public.lbd_guard_deleted_habit_block();

-- Always return durable tombstones even when an old client omits the habit row.
create or replace function public.lbd_read_workspace() returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.lbd_workspaces; uid uuid := auth.uid(); result jsonb;
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into w from public.lbd_workspaces where user_id=uid;
 if not found then return jsonb_build_object('revision',0,'payload',null); end if;
 select jsonb_build_object('revision',w.revision,'payload',jsonb_build_object(
  'timer',jsonb_build_object('version',1,'settings',w.settings,'snapshot',jsonb_build_object('run',w.run,'history',coalesce((select jsonb_agg(payload order by (payload->>'end')::numeric desc) from public.lbd_focus_sessions where user_id=uid),'[]'::jsonb))),
  'tasks',jsonb_build_object('version',1,'tasks',coalesce((select jsonb_agg(payload order by id) from public.lbd_tasks where user_id=uid),'[]'::jsonb)),
  'planner',jsonb_build_object('version',1,'preferences',w.preferences,'blocks',coalesce((select jsonb_agg(payload order by id) from public.lbd_calendar_blocks where user_id=uid),'[]'::jsonb)),
  'habits',jsonb_build_object('version',1,'habits',coalesce((select jsonb_agg(x.payload order by x.id) from (select id,payload from public.lbd_habit_deletions where user_id=uid union all select h.id,h.payload from public.lbd_habits h where h.user_id=uid and not exists(select 1 from public.lbd_habit_deletions d where d.user_id=h.user_id and d.id=h.id)) x),'[]'::jsonb)),
  'reviews',coalesce((select jsonb_agg(payload order by id) from public.lbd_reviews where user_id=uid),'[]'::jsonb)
 )) into result;
 return result;
end $$;

-- Adopt any already-saved V2 deletion markers without changing unrelated rows.
insert into public.lbd_habit_deletions(user_id,id,payload)
 select user_id,id,payload from public.lbd_habits
 where jsonb_typeof(payload->'deletedAt')='number' and (payload->>'deletedAt')::numeric > 0
 on conflict do nothing;
create function public.lbd_habit_deletion_capabilities() returns integer
 language sql stable security invoker set search_path='' as $$
 select case when auth.uid() is not null then 1 else 0 end
$$;
revoke all on function public.lbd_habit_deletion_capabilities() from public,anon;
grant execute on function public.lbd_habit_deletion_capabilities() to authenticated;
