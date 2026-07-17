begin;

select plan(10);

set local session_replication_role = replica;

insert into public.profiles (id, home_timezone)
values
  ('70000000-0000-4000-8000-000000000001', 'Asia/Karachi'),
  ('70000000-0000-4000-8000-000000000002', 'UTC');

insert into public.life_days (id, user_id, operational_date, timezone, woke_at)
values
  ('71000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', '2026-07-18', 'Asia/Karachi', '2026-07-18T03:00:00Z'),
  ('71000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000002', '2026-07-18', 'UTC', '2026-07-18T03:00:00Z');

insert into public.tasks (id, user_id, life_day_id, title, status, priority, position, completed_at)
values
  ('72000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 'First owner task', 'planned', 'non_negotiable', 1, null),
  ('72000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 'Second owner task', 'completed', 'progress', 2, '2026-07-18T04:00:00Z'),
  ('72000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000002', 'Other user task', 'planned', 'maintenance', 1, null),
  ('72000000-0000-4000-8000-000000000004', '70000000-0000-4000-8000-000000000001', null, 'Unassigned task', 'planned', 'progress', 0, null);

set local session_replication_role = origin;
set local role authenticated;
set local request.jwt.claim.sub = '70000000-0000-4000-8000-000000000001';

select is(
  public.get_current_life_day() ->> 'id',
  '71000000-0000-4000-8000-000000000001',
  'Current Life Day is scoped to the authenticated owner'
);

select is(
  jsonb_array_length(public.get_today_tasks()),
  2,
  'Today tasks include only tasks attached to the current Life Day'
);

select is(
  public.get_today_tasks() -> 0 ->> 'title',
  'First owner task',
  'Today tasks are ordered by position'
);

select is(
  public.get_today_snapshot() -> 'profile' ->> 'homeTimezone',
  'Asia/Karachi',
  'Today snapshot includes only the authenticated profile'
);

select is(
  public.get_today_snapshot() -> 'lifeDay' ->> 'id',
  '71000000-0000-4000-8000-000000000001',
  'Today snapshot includes the active Life Day'
);

select is(
  jsonb_array_length(public.get_today_snapshot() -> 'tasks'),
  2,
  'Today snapshot includes the ordered owner task list'
);

set local request.jwt.claim.sub = '70000000-0000-4000-8000-000000000002';

select is(
  public.get_today_snapshot() -> 'lifeDay' ->> 'id',
  '71000000-0000-4000-8000-000000000002',
  'A second user receives only their active Life Day'
);

select is(
  public.get_today_tasks() -> 0 ->> 'title',
  'Other user task',
  'A second user cannot read another user''s Today tasks through the RPC'
);

set local role anon;

select throws_ok(
  'select public.get_today_snapshot()',
  '42501',
  null,
  'Unauthenticated callers cannot execute the Today snapshot RPC'
);

select throws_ok(
  'select public.get_today_tasks()',
  '42501',
  null,
  'Unauthenticated callers cannot execute the Today task RPC'
);

select * from finish();
rollback;
