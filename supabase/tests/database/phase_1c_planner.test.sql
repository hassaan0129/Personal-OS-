begin;

select plan(24);

set local session_replication_role = replica;
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-4000-8000-000000000001';

select is(
  public.command_start_life_day(
    '82000000-0000-4000-8000-000000000001',
    '83000000-0000-4000-8000-000000000001', null,
    '2026-07-18T06:00:00Z', 'UTC', '2026-07-18T06:00:00Z', 'UTC'
  ) ->> 'status',
  'accepted',
  'Planner fixture starts an active Life Day'
);

select is(
  public.command_create_task(
    '82000000-0000-4000-8000-000000000002', '83000000-0000-4000-8000-000000000001', null,
    '2026-07-18T06:01:00Z', 'UTC',
    (select id from public.life_days where user_id = auth.uid() and slept_at is null),
    'Task one', null, 'non_negotiable', null, null, 30, 1
  ) ->> 'status',
  'accepted',
  'Creates the first planner task'
);

select is(
  public.command_create_task(
    '82000000-0000-4000-8000-000000000003', '83000000-0000-4000-8000-000000000001', null,
    '2026-07-18T06:02:00Z', 'UTC',
    (select id from public.life_days where user_id = auth.uid() and slept_at is null),
    'Task two', null, 'progress', null, null, 45, 2
  ) ->> 'status',
  'accepted',
  'Creates the second planner task'
);

select is(
  public.command_create_task(
    '82000000-0000-4000-8000-000000000004', '83000000-0000-4000-8000-000000000001', null,
    '2026-07-18T06:03:00Z', 'UTC',
    (select id from public.life_days where user_id = auth.uid() and slept_at is null),
    'Task three', null, 'maintenance', null, null, null, 3
  ) ->> 'status',
  'accepted',
  'Creates the third planner task'
);

select is(
  public.command_create_task(
    '82000000-0000-4000-8000-000000000005', '83000000-0000-4000-8000-000000000001', null,
    '2026-07-18T06:04:00Z', 'UTC',
    (select id from public.life_days where user_id = auth.uid() and slept_at is null),
    'Task four', null, 'progress', null, null, null, 4
  ) ->> 'status',
  'accepted',
  'Creates the fourth planner task'
);

select is(
  public.command_update_task(
    '82000000-0000-4000-8000-000000000006', '83000000-0000-4000-8000-000000000001', 1,
    '2026-07-18T06:05:00Z', 'UTC', (select id from public.tasks where title = 'Task one'),
    (select id from public.life_days where user_id = auth.uid() and slept_at is null),
    'Edited task one', 'More context', 'planned', 'non_negotiable',
    '2026-07-18T07:00:00Z', 'UTC', 35, 1
  ) ->> 'status',
  'accepted',
  'A planner can edit task details through the command RPC'
);

select is(
  (select title from public.tasks where title = 'Edited task one'),
  'Edited task one',
  'The edit persists only after the command succeeds'
);

select is(
  public.command_reorder_task(
    '82000000-0000-4000-8000-000000000007', '83000000-0000-4000-8000-000000000001', 2,
    '2026-07-18T06:06:00Z', 'UTC', (select id from public.tasks where title = 'Edited task one'), 9
  ) ->> 'status',
  'accepted',
  'A planner can reorder an active task'
);

select is(
  (select position::text from public.tasks where title = 'Edited task one'),
  '9.00000000',
  'The command stores the requested manual position'
);

select is(
  public.command_reorder_task(
    '82000000-0000-4000-8000-000000000007', '83000000-0000-4000-8000-000000000001', 2,
    '2026-07-18T06:06:00Z', 'UTC', (select id from public.tasks where title = 'Edited task one'), 9
  ) ->> 'status',
  'duplicate_accepted',
  'Planner reordering is idempotent'
);

select is(
  public.command_set_task_top_three(
    '82000000-0000-4000-8000-000000000008', '83000000-0000-4000-8000-000000000001', 3,
    '2026-07-18T06:07:00Z', 'UTC', (select id from public.tasks where title = 'Edited task one'), true
  ) ->> 'status',
  'accepted',
  'The first Top 3 selection succeeds'
);

select is(
  public.command_set_task_top_three(
    '82000000-0000-4000-8000-000000000009', '83000000-0000-4000-8000-000000000001', 1,
    '2026-07-18T06:08:00Z', 'UTC', (select id from public.tasks where title = 'Task two'), true
  ) ->> 'status',
  'accepted',
  'The second Top 3 selection succeeds'
);

select is(
  public.command_set_task_top_three(
    '82000000-0000-4000-8000-000000000010', '83000000-0000-4000-8000-000000000001', 1,
    '2026-07-18T06:09:00Z', 'UTC', (select id from public.tasks where title = 'Task three'), true
  ) ->> 'status',
  'accepted',
  'The third Top 3 selection succeeds'
);

select is(
  public.command_set_task_top_three(
    '82000000-0000-4000-8000-000000000011', '83000000-0000-4000-8000-000000000001', 1,
    '2026-07-18T06:10:00Z', 'UTC', (select id from public.tasks where title = 'Task four'), true
  ) -> 'error' ->> 'code',
  'top_three_limit',
  'The database command layer rejects a fourth active Top 3 task'
);

select is(
  public.command_update_task(
    '82000000-0000-4000-8000-000000000012', '83000000-0000-4000-8000-000000000001', 1,
    '2026-07-18T06:11:00Z', 'UTC', (select id from public.tasks where title = 'Task two'),
    (select id from public.life_days where user_id = auth.uid() and slept_at is null),
    'Task two', null, 'planned', 'progress', null, null, 45, 2
  ) -> 'error' ->> 'code',
  'revision_conflict',
  'Planner edits return the canonical revision conflict state'
);

select is(
  public.command_close_life_day(
    '82000000-0000-4000-8000-000000000013', '83000000-0000-4000-8000-000000000001', 1,
    '2026-07-18T21:00:00Z', 'UTC',
    (select id from public.life_days where user_id = auth.uid() and slept_at is null),
    '2026-07-18T21:00:00Z', 'UTC'
  ) -> 'error' ->> 'code',
  'unresolved_tasks',
  'Open Life Days cannot close while planned tasks remain'
);

select is(
  public.command_resolve_unfinished_task(
    '82000000-0000-4000-8000-000000000014', '83000000-0000-4000-8000-000000000001', 1,
    '2026-07-18T06:12:00Z', 'UTC', (select id from public.tasks where title = 'Task four'),
    'reschedule', null, '2026-07-19T06:00:00Z', 'UTC', 'other', null
  ) -> 'error' ->> 'code',
  'validation_failed',
  'Unfinished-task rescheduling requires an explicit structured reason'
);

select is(
  public.command_resolve_unfinished_task(
    '82000000-0000-4000-8000-000000000015', '83000000-0000-4000-8000-000000000001', 1,
    '2026-07-18T06:13:00Z', 'UTC', (select id from public.tasks where title = 'Task four'),
    'reschedule', null, '2026-07-19T06:00:00Z', 'UTC', 'capacity_limit', null
  ) ->> 'status',
  'accepted',
  'A task can be explicitly rescheduled to a date outside the closing Life Day'
);

select is(
  public.command_cancel_task(
    '82000000-0000-4000-8000-000000000016', '83000000-0000-4000-8000-000000000001', 2,
    '2026-07-18T06:14:00Z', 'UTC', (select id from public.tasks where title = 'Task three'),
    '2026-07-18T06:14:00Z', 'other', null
  ) -> 'error' ->> 'code',
  'validation_failed',
  'Cancellation remains blocked without its required reason'
);

select is(
  public.command_cancel_task(
    '82000000-0000-4000-8000-000000000017', '83000000-0000-4000-8000-000000000001', 2,
    '2026-07-18T06:15:00Z', 'UTC', (select id from public.tasks where title = 'Task three'),
    '2026-07-18T06:15:00Z', 'no_longer_relevant', null
  ) ->> 'status',
  'accepted',
  'Cancellation resolves an unfinished task with a structured reason'
);

select is(
  public.command_complete_task(
    '82000000-0000-4000-8000-000000000018', '83000000-0000-4000-8000-000000000001', 4,
    '2026-07-18T06:16:00Z', 'UTC', (select id from public.tasks where title = 'Edited task one'),
    '2026-07-18T06:16:00Z', (select id from public.life_days where user_id = auth.uid() and slept_at is null)
  ) ->> 'status',
  'accepted',
  'A Top 3 task can be completed'
);

select is(
  public.command_resolve_unfinished_task(
    '82000000-0000-4000-8000-000000000019', '83000000-0000-4000-8000-000000000001', 2,
    '2026-07-18T06:17:00Z', 'UTC', (select id from public.tasks where title = 'Task two'),
    'overdue', null, null, null, null, null
  ) ->> 'status',
  'accepted',
  'Keeping a task overdue explicitly resolves it for Life Day closure'
);

select is(
  public.command_close_life_day(
    '82000000-0000-4000-8000-000000000020', '83000000-0000-4000-8000-000000000001', 1,
    '2026-07-18T21:00:00Z', 'UTC',
    (select id from public.life_days where user_id = auth.uid() and slept_at is null),
    '2026-07-18T21:00:00Z', 'UTC'
  ) ->> 'status',
  'accepted',
  'Life Day closes after every planned or in-progress task is explicitly resolved'
);

set local request.jwt.claim.sub = '81000000-0000-4000-8000-000000000002';

select is(
  public.command_reorder_task(
    '82000000-0000-4000-8000-000000000021', '83000000-0000-4000-8000-000000000002', 5,
    '2026-07-18T06:18:00Z', 'UTC', (select id from public.tasks where title = 'Edited task one'), 1
  ) -> 'error' ->> 'code',
  'not_found',
  'Planner commands do not reveal or mutate another user''s task'
);

select * from finish();
rollback;
