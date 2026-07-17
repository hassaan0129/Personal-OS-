begin;

select plan(17);

-- The local test transaction uses deterministic test identities without
-- provisioning GoTrue users. The production migration always enforces the
-- auth.users foreign keys; this pgTAP fixture only suppresses them temporarily.
set local session_replication_role = replica;
set local role authenticated;
set local request.jwt.claim.sub = '40000000-0000-4000-8000-000000000001';

select is(
  public.command_start_life_day(
    '50000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000001',
    null,
    '2026-07-17T06:00:00Z',
    'UTC',
    '2026-07-17T06:00:00Z',
    'UTC'
  ) ->> 'status',
  'accepted',
  'Wake creates the first open Life Day'
);

select is(
  public.command_start_life_day(
    '50000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000001',
    null,
    '2026-07-17T06:00:00Z',
    'UTC',
    '2026-07-17T06:00:00Z',
    'UTC'
  ) ->> 'status',
  'duplicate_accepted',
  'The same idempotency key returns the accepted wake result'
);

select is(
  public.command_start_life_day(
    '50000000-0000-4000-8000-000000000002',
    '60000000-0000-4000-8000-000000000001',
    null,
    '2026-07-17T07:00:00Z',
    'UTC',
    '2026-07-17T07:00:00Z',
    'UTC'
  ) -> 'error' ->> 'code',
  'repair_required',
  'A second wake while open requires repair'
);

select is(
  public.command_close_life_day(
    '50000000-0000-4000-8000-000000000003',
    '60000000-0000-4000-8000-000000000001',
    1,
    '2026-07-18T01:00:00Z',
    'UTC',
    (select id from public.life_days where user_id = '40000000-0000-4000-8000-000000000001'::uuid),
    '2026-07-18T01:00:00Z',
    'UTC'
  ) ->> 'status',
  'accepted',
  'Sleep explicitly closes the Life Day across midnight'
);

select is(
  (select operational_date::text from public.life_days where user_id = '40000000-0000-4000-8000-000000000001'::uuid),
  '2026-07-17',
  'Crossing midnight does not change the Life Day operational date'
);

select is(
  public.command_start_life_day(
    '50000000-0000-4000-8000-000000000004',
    '60000000-0000-4000-8000-000000000001',
    null,
    '2026-07-18T06:00:00Z',
    'UTC',
    '2026-07-18T06:00:00Z',
    'Mars/Olympus'
  ) -> 'error' ->> 'code',
  'invalid_timezone',
  'Invalid IANA time zones are rejected by the command boundary'
);

select is(
  public.command_create_task(
    '50000000-0000-4000-8000-000000000005',
    '60000000-0000-4000-8000-000000000001',
    null,
    '2026-07-17T06:30:00Z',
    'UTC',
    null,
    'Foundation task',
    null,
    'progress',
    null,
    null,
    30,
    1
  ) ->> 'status',
  'accepted',
  'Task creation is accepted with a fresh operation id'
);

select is(
  public.command_update_task(
    '50000000-0000-4000-8000-000000000006',
    '60000000-0000-4000-8000-000000000001',
    99,
    '2026-07-17T06:31:00Z',
    'UTC',
    (select id from public.tasks where title = 'Foundation task'),
    null,
    'Foundation task',
    null,
    'planned',
    'progress',
    null,
    null,
    30,
    1
  ) -> 'error' ->> 'code',
  'revision_conflict',
  'Stale task revisions return a safe conflict'
);

select is(
  public.command_complete_task(
    '50000000-0000-4000-8000-000000000007',
    '60000000-0000-4000-8000-000000000001',
    1,
    '2026-07-17T07:00:00Z',
    'UTC',
    (select id from public.tasks where title = 'Foundation task'),
    '2026-07-17T07:00:00Z',
    null
  ) ->> 'status',
  'accepted',
  'A planned task can be completed once'
);

select is(
  public.command_complete_task(
    '50000000-0000-4000-8000-000000000008',
    '60000000-0000-4000-8000-000000000001',
    2,
    '2026-07-17T07:01:00Z',
    'UTC',
    (select id from public.tasks where title = 'Foundation task'),
    '2026-07-17T07:01:00Z',
    null
  ) -> 'error' ->> 'code',
  'invalid_transition',
  'Completing an already completed task is rejected'
);

select is(
  public.command_reschedule_task(
    '50000000-0000-4000-8000-000000000009',
    '60000000-0000-4000-8000-000000000001',
    2,
    '2026-07-17T07:02:00Z',
    'UTC',
    (select id from public.tasks where title = 'Foundation task'),
    '2026-07-18T07:00:00Z',
    'UTC',
    'other',
    null
  ) -> 'error' ->> 'code',
  'validation_failed',
  'Reschedule requires a structured reason with an other note'
);

select is(
  public.command_create_task(
    '50000000-0000-4000-8000-000000000011',
    '60000000-0000-4000-8000-000000000001',
    null,
    '2026-07-17T07:03:00Z',
    'UTC',
    null,
    'Cancellation task',
    null,
    'maintenance',
    null,
    null,
    null,
    2
  ) ->> 'status',
  'accepted',
  'A second task provides a cancellation-reason fixture'
);

select is(
  public.command_cancel_task(
    '50000000-0000-4000-8000-000000000012',
    '60000000-0000-4000-8000-000000000001',
    1,
    '2026-07-17T07:03:30Z',
    'UTC',
    (select id from public.tasks where title = 'Cancellation task'),
    '2026-07-17T07:03:30Z',
    'other',
    null
  ) -> 'error' ->> 'code',
  'validation_failed',
  'Cancellation requires a structured reason with an other note'
);

select is(
  public.command_start_life_day(
    '50000000-0000-4000-8000-000000000014',
    '60000000-0000-4000-8000-000000000001',
    null,
    '2026-07-18T06:00:00Z',
    'UTC',
    '2026-07-18T06:00:00Z',
    'UTC'
  ) ->> 'status',
  'accepted',
  'A later Life Day can start after explicit sleep'
);

select is(
  public.command_create_task(
    '50000000-0000-4000-8000-000000000015',
    '60000000-0000-4000-8000-000000000001',
    null,
    '2026-07-18T06:01:00Z',
    'UTC',
    (select id from public.life_days where user_id = '40000000-0000-4000-8000-000000000001'::uuid and slept_at is null),
    'Unresolved sleep task',
    null,
    'maintenance',
    null,
    null,
    null,
    3
  ) ->> 'status',
  'accepted',
  'A task can explicitly belong to the active Life Day'
);

select is(
  public.command_close_life_day(
    '50000000-0000-4000-8000-000000000016',
    '60000000-0000-4000-8000-000000000001',
    1,
    '2026-07-18T22:00:00Z',
    'UTC',
    (select id from public.life_days where user_id = '40000000-0000-4000-8000-000000000001'::uuid and slept_at is null),
    '2026-07-18T22:00:00Z',
    'UTC'
  ) -> 'error' ->> 'code',
  'unresolved_tasks',
  'Sleep requires unfinished Life Day tasks to be explicitly resolved'
);

set local request.jwt.claim.sub = '40000000-0000-4000-8000-000000000002';

select is(
  public.command_cancel_task(
    '50000000-0000-4000-8000-000000000013',
    '60000000-0000-4000-8000-000000000002',
    2,
    '2026-07-17T07:03:00Z',
    'UTC',
    (select id from public.tasks where title = 'Foundation task'),
    '2026-07-17T07:03:00Z',
    'no_longer_relevant',
    null
  ) -> 'error' ->> 'code',
  'not_found',
  'Commands do not reveal or mutate another user''s task'
);

select * from finish();
rollback;
