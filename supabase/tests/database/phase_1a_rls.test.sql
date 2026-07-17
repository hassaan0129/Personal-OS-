begin;

select plan(7);

select has_table('public', 'life_days', 'Life Day state table exists');
select has_table('public', 'tasks', 'Today task state table exists');

set local session_replication_role = replica;

insert into public.life_days (id, user_id, operational_date, timezone, woke_at)
values
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '2026-07-17', 'UTC', '2026-07-17T06:00:00Z'),
  ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '2026-07-17', 'UTC', '2026-07-17T06:00:00Z');

insert into public.tasks (id, user_id, life_day_id, title, status, priority)
values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Owner one task', 'planned', 'progress'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'Owner two task', 'planned', 'progress');

set local session_replication_role = origin;
set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000001';

select results_eq(
  'select count(*) from public.life_days',
  array[1::bigint],
  'An authenticated owner reads only their Life Day'
);

select results_eq(
  'select count(*) from public.tasks',
  array[1::bigint],
  'An authenticated owner reads only their task'
);

set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000002';

select results_eq(
  'select count(*) from public.tasks where user_id = ''20000000-0000-4000-8000-000000000001''::uuid',
  array[0::bigint],
  'A second user cannot read another user''s task'
);

select throws_ok(
  $$insert into public.tasks (user_id, title, status, priority)
    values ('20000000-0000-4000-8000-000000000002'::uuid, 'Direct write', 'planned', 'progress')$$,
  '42501',
  null,
  'Direct task writes are denied; callers must use command RPCs'
);

select throws_ok(
  'select * from public.command_operations',
  '42501',
  null,
  'Command idempotency records are not directly exposed'
);

select * from finish();
rollback;
