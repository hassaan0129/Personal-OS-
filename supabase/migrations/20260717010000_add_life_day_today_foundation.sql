-- Phase 1A: Life Day and Today backend foundation.
-- This migration is local-first and contains no hosted project reference or credentials.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public;

create table public.life_days (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  operational_date date not null,
  timezone text not null,
  woke_at timestamptz not null,
  slept_at timestamptz,
  sleep_timezone text,
  repair_reason_code text,
  repair_reason_note text,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (slept_at is null or slept_at >= woke_at),
  check (sleep_timezone is null or slept_at is not null),
  check (
    repair_reason_code is null
    or repair_reason_code in ('forgot_to_record_sleep', 'correct_recording_error', 'other')
  ),
  check (repair_reason_code <> 'other' or nullif(btrim(repair_reason_note), '') is not null)
);

create unique index life_days_one_open_per_user_idx
  on public.life_days (user_id)
  where slept_at is null;

create index life_days_user_operational_date_idx
  on public.life_days (user_id, operational_date desc);

create table public.tasks (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  life_day_id uuid references public.life_days (id) on delete set null,
  title text not null,
  description text,
  status text not null default 'planned',
  priority text not null,
  scheduled_at timestamptz,
  scheduled_timezone text,
  estimated_minutes integer,
  position numeric(20, 8) not null default 0,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason_code text,
  cancellation_reason_note text,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (nullif(btrim(title), '') is not null),
  check (char_length(title) <= 500),
  check (description is null or char_length(description) <= 5000),
  check (status in ('planned', 'in_progress', 'completed', 'overdue', 'cancelled', 'archived')),
  check (priority in ('non_negotiable', 'progress', 'maintenance')),
  check ((scheduled_at is null) = (scheduled_timezone is null)),
  check (estimated_minutes is null or estimated_minutes between 1 and 1440),
  check ((status = 'completed') = (completed_at is not null)),
  check ((status = 'cancelled') = (cancelled_at is not null)),
  check (
    cancellation_reason_code is null
    or cancellation_reason_code in (
      'user_rescheduled', 'capacity_limit', 'external_change',
      'no_longer_relevant', 'duplicate', 'other'
    )
  ),
  check (cancellation_reason_code <> 'other' or nullif(btrim(cancellation_reason_note), '') is not null)
);

create index tasks_user_life_day_position_idx
  on public.tasks (user_id, life_day_id, position)
  where status in ('planned', 'in_progress', 'overdue');

create index tasks_user_status_scheduled_at_idx
  on public.tasks (user_id, status, scheduled_at);

create table public.command_operations (
  operation_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id uuid not null,
  command_type text not null,
  expected_revision bigint,
  client_occurred_at timestamptz not null,
  client_timezone text not null,
  request_hash text not null,
  status text not null default 'accepted',
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  check (status in ('accepted', 'conflict', 'rejected')),
  check (char_length(command_type) between 3 and 100),
  check (char_length(request_hash) = 64)
);

create index command_operations_user_created_at_idx
  on public.command_operations (user_id, created_at desc);

create table public.task_events (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  life_day_id uuid references public.life_days (id) on delete set null,
  operation_id uuid not null references public.command_operations (operation_id) on delete restrict,
  event_type text not null,
  occurred_at timestamptz not null,
  from_status text,
  to_status text,
  reason_code text,
  reason_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  check (event_type in ('created', 'updated', 'completed', 'rescheduled', 'cancelled')),
  check (reason_code is null or reason_code in (
    'user_rescheduled', 'capacity_limit', 'external_change',
    'no_longer_relevant', 'duplicate', 'other'
  )),
  check (reason_code <> 'other' or nullif(btrim(reason_note), '') is not null),
  check (
    event_type not in ('rescheduled', 'cancelled')
    or reason_code is not null
  ),
  unique (operation_id, event_type)
);

create index task_events_task_occurred_at_idx
  on public.task_events (task_id, occurred_at desc);

create table public.change_events (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  operation_id uuid not null references public.command_operations (operation_id) on delete restrict,
  entity_type text not null check (entity_type in ('life_day', 'task')),
  entity_id uuid not null,
  event_type text not null,
  from_revision bigint,
  to_revision bigint not null check (to_revision > 0),
  summary jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default timezone('utc', now()),
  check (summary ? 'fields' or summary = '{}'::jsonb)
);

create index change_events_user_recorded_at_idx
  on public.change_events (user_id, recorded_at desc);

create index change_events_entity_recorded_at_idx
  on public.change_events (entity_type, entity_id, recorded_at desc);

create table public.sync_changes (
  cursor bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  operation_id uuid not null references public.command_operations (operation_id) on delete restrict,
  entity_type text not null check (entity_type in ('life_day', 'task')),
  entity_id uuid not null,
  change_type text not null default 'upsert' check (change_type = 'upsert'),
  revision bigint not null check (revision > 0),
  recorded_at timestamptz not null default timezone('utc', now()),
  unique (operation_id, entity_type, entity_id)
);

create index sync_changes_user_cursor_idx
  on public.sync_changes (user_id, cursor);

alter table public.life_days enable row level security;
alter table public.tasks enable row level security;
alter table public.task_events enable row level security;
alter table public.command_operations enable row level security;
alter table public.change_events enable row level security;
alter table public.sync_changes enable row level security;

grant select on public.life_days, public.tasks, public.task_events, public.change_events, public.sync_changes to authenticated;

create policy "life days are readable by their owner"
  on public.life_days for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "tasks are readable by their owner"
  on public.tasks for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "task events are readable by their owner"
  on public.task_events for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "change events are readable by their owner"
  on public.change_events for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "sync changes are readable by their owner"
  on public.sync_changes for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

-- Command operations intentionally have no client policy or table grant. RPCs
-- return only safe stored results for the caller's own operation id.
create policy "command operations deny direct client reads"
  on public.command_operations for select to authenticated
  using (false);

create function private.is_valid_timezone(p_timezone text)
returns boolean
language sql
stable
set search_path = pg_catalog
as $$
  select p_timezone is not null
    and exists (select 1 from pg_timezone_names where name = p_timezone);
$$;

create function private.command_error(
  p_operation_id uuid,
  p_status text,
  p_code text,
  p_message text,
  p_entity jsonb default null
)
returns jsonb
language sql
immutable
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'operationId', p_operation_id,
    'status', p_status,
    'error', jsonb_build_object('code', p_code, 'message', p_message),
    'entity', p_entity,
    'syncCursor', null
  );
$$;

create function private.command_hash(
  p_command_type text,
  p_expected_revision bigint,
  p_client_occurred_at timestamptz,
  p_client_timezone text,
  p_payload jsonb
)
returns text
language sql
immutable
set search_path = pg_catalog, extensions
as $$
  select encode(
    extensions.digest(
      jsonb_build_object(
        'commandType', p_command_type,
        'expectedRevision', p_expected_revision,
        'clientOccurredAt', p_client_occurred_at,
        'clientTimezone', p_client_timezone,
        'payload', p_payload
      )::text,
      'sha256'
    ),
    'hex'
  );
$$;

create function private.claim_command(
  p_operation_id uuid,
  p_device_id uuid,
  p_command_type text,
  p_expected_revision bigint,
  p_client_occurred_at timestamptz,
  p_client_timezone text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_existing public.command_operations%rowtype;
  v_hash text;
  v_inserted boolean;
begin
  if v_actor is null then
    return private.command_error(p_operation_id, 'rejected', 'unauthenticated', 'Sign in before sending a command.');
  end if;

  if p_operation_id is null or p_device_id is null or p_client_occurred_at is null then
    return private.command_error(p_operation_id, 'rejected', 'validation_failed', 'Command metadata is incomplete.');
  end if;

  v_hash := private.command_hash(
    p_command_type,
    p_expected_revision,
    p_client_occurred_at,
    p_client_timezone,
    p_payload
  );

  select * into v_existing
    from public.command_operations
    where operation_id = p_operation_id
    for update;

  if found then
    if v_existing.user_id <> v_actor then
      return private.command_error(p_operation_id, 'rejected', 'forbidden', 'This command is not available.');
    end if;

    if v_existing.command_type <> p_command_type or v_existing.request_hash <> v_hash then
      return private.command_error(p_operation_id, 'rejected', 'validation_failed', 'An idempotency key cannot be reused with different input.');
    end if;

    if v_existing.status = 'accepted' then
      return jsonb_set(v_existing.result, '{status}', '"duplicate_accepted"'::jsonb, true);
    end if;

    return v_existing.result;
  end if;

  insert into public.command_operations (
    operation_id, user_id, device_id, command_type, expected_revision,
    client_occurred_at, client_timezone, request_hash
  ) values (
    p_operation_id, v_actor, p_device_id, p_command_type, p_expected_revision,
    p_client_occurred_at, p_client_timezone, v_hash
  ) on conflict do nothing
  returning true into v_inserted;

  if coalesce(v_inserted, false) then
    return null;
  end if;

  select * into v_existing
    from public.command_operations
    where operation_id = p_operation_id
    for update;

  if v_existing.user_id <> v_actor then
    return private.command_error(p_operation_id, 'rejected', 'forbidden', 'This command is not available.');
  end if;

  if v_existing.command_type <> p_command_type or v_existing.request_hash <> v_hash then
    return private.command_error(p_operation_id, 'rejected', 'validation_failed', 'An idempotency key cannot be reused with different input.');
  end if;

  if v_existing.status = 'accepted' then
    return jsonb_set(v_existing.result, '{status}', '"duplicate_accepted"'::jsonb, true);
  end if;

  return v_existing.result;
end;
$$;

create function private.finish_command(p_operation_id uuid, p_result jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  update public.command_operations
    set status = p_result ->> 'status',
        result = p_result,
        completed_at = timezone('utc', now())
    where operation_id = p_operation_id;

  return p_result;
end;
$$;

create function private.emit_change(
  p_user_id uuid,
  p_operation_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_event_type text,
  p_from_revision bigint,
  p_to_revision bigint,
  p_summary jsonb,
  p_occurred_at timestamptz
)
returns bigint
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_cursor bigint;
begin
  insert into public.change_events (
    user_id, operation_id, entity_type, entity_id, event_type,
    from_revision, to_revision, summary, occurred_at
  ) values (
    p_user_id, p_operation_id, p_entity_type, p_entity_id, p_event_type,
    p_from_revision, p_to_revision, p_summary, p_occurred_at
  );

  insert into public.sync_changes (
    user_id, operation_id, entity_type, entity_id, revision
  ) values (
    p_user_id, p_operation_id, p_entity_type, p_entity_id, p_to_revision
  ) returning cursor into v_cursor;

  return v_cursor;
end;
$$;

create function private.life_day_entity(p_life_day public.life_days)
returns jsonb
language sql
stable
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'type', 'life_day',
    'id', p_life_day.id,
    'revision', p_life_day.revision,
    'data', jsonb_build_object(
      'operationalDate', p_life_day.operational_date,
      'timezone', p_life_day.timezone,
      'wokeAt', p_life_day.woke_at,
      'sleptAt', p_life_day.slept_at,
      'sleepTimezone', p_life_day.sleep_timezone
    )
  );
$$;

create function private.task_entity(p_task public.tasks)
returns jsonb
language sql
stable
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'type', 'task',
    'id', p_task.id,
    'revision', p_task.revision,
    'data', jsonb_build_object(
      'lifeDayId', p_task.life_day_id,
      'title', p_task.title,
      'description', p_task.description,
      'status', p_task.status,
      'priority', p_task.priority,
      'scheduledAt', p_task.scheduled_at,
      'scheduledTimezone', p_task.scheduled_timezone,
      'estimatedMinutes', p_task.estimated_minutes,
      'position', p_task.position,
      'completedAt', p_task.completed_at
    )
  );
$$;

revoke all on all functions in schema private from public;

create function public.command_start_life_day(
  p_operation_id uuid,
  p_device_id uuid,
  p_expected_revision bigint,
  p_client_occurred_at timestamptz,
  p_client_timezone text,
  p_woke_at timestamptz,
  p_timezone text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_claim jsonb;
  v_actor uuid := auth.uid();
  v_existing public.life_days%rowtype;
  v_life_day public.life_days%rowtype;
  v_cursor bigint;
  v_result jsonb;
begin
  v_claim := private.claim_command(
    p_operation_id, p_device_id, 'life_day.wake', p_expected_revision,
    p_client_occurred_at, p_client_timezone,
    jsonb_build_object('wokeAt', p_woke_at, 'timezone', p_timezone)
  );
  if v_claim is not null then return v_claim; end if;

  if p_expected_revision is not null or p_woke_at is null then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'rejected', 'validation_failed', 'A new Life Day needs no expected revision and a wake time.'
    ));
  end if;

  if not private.is_valid_timezone(p_timezone) or not private.is_valid_timezone(p_client_timezone) then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'rejected', 'invalid_timezone', 'Use a valid IANA time zone.'
    ));
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_actor::text, 0));
  select * into v_existing from public.life_days
    where user_id = v_actor and slept_at is null;

  if found then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'conflict', 'repair_required',
      'Record or repair sleep for the open Life Day before starting another.',
      private.life_day_entity(v_existing)
    ));
  end if;

  insert into public.life_days (user_id, operational_date, timezone, woke_at)
  values (v_actor, (p_woke_at at time zone p_timezone)::date, p_timezone, p_woke_at)
  returning * into v_life_day;

  v_cursor := private.emit_change(
    v_actor, p_operation_id, 'life_day', v_life_day.id, 'life_day.wake', null,
    v_life_day.revision, jsonb_build_object('fields', jsonb_build_array('woke_at', 'timezone')),
    p_woke_at
  );

  v_result := jsonb_build_object(
    'operationId', p_operation_id, 'status', 'accepted',
    'entity', private.life_day_entity(v_life_day), 'syncCursor', v_cursor
  );
  return private.finish_command(p_operation_id, v_result);
end;
$$;

create function public.command_close_life_day(
  p_operation_id uuid,
  p_device_id uuid,
  p_expected_revision bigint,
  p_client_occurred_at timestamptz,
  p_client_timezone text,
  p_life_day_id uuid,
  p_slept_at timestamptz,
  p_timezone text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_claim jsonb;
  v_actor uuid := auth.uid();
  v_life_day public.life_days%rowtype;
  v_before_revision bigint;
  v_cursor bigint;
  v_result jsonb;
begin
  v_claim := private.claim_command(
    p_operation_id, p_device_id, 'life_day.sleep', p_expected_revision,
    p_client_occurred_at, p_client_timezone,
    jsonb_build_object('lifeDayId', p_life_day_id, 'sleptAt', p_slept_at, 'timezone', p_timezone)
  );
  if v_claim is not null then return v_claim; end if;

  if not private.is_valid_timezone(p_timezone) or not private.is_valid_timezone(p_client_timezone) then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'rejected', 'invalid_timezone', 'Use a valid IANA time zone.'
    ));
  end if;

  select * into v_life_day from public.life_days
    where id = p_life_day_id and user_id = v_actor
    for update;
  if not found then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'rejected', 'not_found', 'This Life Day is not available.'
    ));
  end if;

  if p_expected_revision is null or p_expected_revision <> v_life_day.revision then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'conflict', 'revision_conflict', 'This Life Day changed. Refresh before retrying.',
      private.life_day_entity(v_life_day)
    ));
  end if;

  if v_life_day.slept_at is not null or p_slept_at is null or p_slept_at < v_life_day.woke_at then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'conflict', 'invalid_transition', 'Sleep must close an open Life Day after its wake time.',
      private.life_day_entity(v_life_day)
    ));
  end if;

  if exists (
    select 1 from public.tasks
      where user_id = v_actor
        and life_day_id = v_life_day.id
        and status in ('planned', 'in_progress')
  ) then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'conflict', 'unresolved_tasks',
      'Resolve unfinished tasks by rescheduling, keeping overdue, or cancelling before sleep.',
      private.life_day_entity(v_life_day)
    ));
  end if;

  v_before_revision := v_life_day.revision;
  update public.life_days
    set slept_at = p_slept_at,
        sleep_timezone = p_timezone,
        revision = revision + 1,
        updated_at = timezone('utc', now())
    where id = v_life_day.id
    returning * into v_life_day;

  v_cursor := private.emit_change(
    v_actor, p_operation_id, 'life_day', v_life_day.id, 'life_day.sleep', v_before_revision,
    v_life_day.revision, jsonb_build_object('fields', jsonb_build_array('slept_at', 'sleep_timezone')),
    p_slept_at
  );
  v_result := jsonb_build_object(
    'operationId', p_operation_id, 'status', 'accepted',
    'entity', private.life_day_entity(v_life_day), 'syncCursor', v_cursor
  );
  return private.finish_command(p_operation_id, v_result);
end;
$$;

create function public.command_repair_previous_life_day(
  p_operation_id uuid,
  p_device_id uuid,
  p_expected_revision bigint,
  p_client_occurred_at timestamptz,
  p_client_timezone text,
  p_life_day_id uuid,
  p_slept_at timestamptz,
  p_timezone text,
  p_reason_code text,
  p_reason_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_claim jsonb;
  v_actor uuid := auth.uid();
  v_life_day public.life_days%rowtype;
  v_before_revision bigint;
  v_cursor bigint;
  v_result jsonb;
begin
  v_claim := private.claim_command(
    p_operation_id, p_device_id, 'life_day.repair_previous', p_expected_revision,
    p_client_occurred_at, p_client_timezone,
    jsonb_build_object(
      'lifeDayId', p_life_day_id, 'sleptAt', p_slept_at, 'timezone', p_timezone,
      'reasonCode', p_reason_code, 'reasonNote', p_reason_note
    )
  );
  if v_claim is not null then return v_claim; end if;

  if not private.is_valid_timezone(p_timezone) or not private.is_valid_timezone(p_client_timezone) then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'rejected', 'invalid_timezone', 'Use a valid IANA time zone.'
    ));
  end if;

  if p_reason_code is null
    or p_reason_code not in ('forgot_to_record_sleep', 'correct_recording_error', 'other')
    or (p_reason_code = 'other' and nullif(btrim(p_reason_note), '') is null) then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'rejected', 'validation_failed', 'A structured repair reason is required.'
    ));
  end if;

  select * into v_life_day from public.life_days
    where id = p_life_day_id and user_id = v_actor
    for update;
  if not found then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'rejected', 'not_found', 'This Life Day is not available.'
    ));
  end if;

  if p_expected_revision is null or p_expected_revision <> v_life_day.revision then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'conflict', 'revision_conflict', 'This Life Day changed. Refresh before retrying.',
      private.life_day_entity(v_life_day)
    ));
  end if;

  if v_life_day.slept_at is not null or p_slept_at is null or p_slept_at < v_life_day.woke_at then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'conflict', 'invalid_transition', 'Repair can close only an open Life Day after its wake time.',
      private.life_day_entity(v_life_day)
    ));
  end if;

  if exists (
    select 1 from public.tasks
      where user_id = v_actor
        and life_day_id = v_life_day.id
        and status in ('planned', 'in_progress')
  ) then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'conflict', 'unresolved_tasks',
      'Resolve unfinished tasks by rescheduling, keeping overdue, or cancelling before repair.',
      private.life_day_entity(v_life_day)
    ));
  end if;

  v_before_revision := v_life_day.revision;
  update public.life_days
    set slept_at = p_slept_at,
        sleep_timezone = p_timezone,
        repair_reason_code = p_reason_code,
        repair_reason_note = nullif(btrim(p_reason_note), ''),
        revision = revision + 1,
        updated_at = timezone('utc', now())
    where id = v_life_day.id
    returning * into v_life_day;

  v_cursor := private.emit_change(
    v_actor, p_operation_id, 'life_day', v_life_day.id, 'life_day.repair_previous',
    v_before_revision, v_life_day.revision,
    jsonb_build_object('fields', jsonb_build_array('slept_at', 'repair_reason_code')),
    p_slept_at
  );
  v_result := jsonb_build_object(
    'operationId', p_operation_id, 'status', 'accepted',
    'entity', private.life_day_entity(v_life_day), 'syncCursor', v_cursor
  );
  return private.finish_command(p_operation_id, v_result);
end;
$$;

create function public.command_create_task(
  p_operation_id uuid,
  p_device_id uuid,
  p_expected_revision bigint,
  p_client_occurred_at timestamptz,
  p_client_timezone text,
  p_life_day_id uuid,
  p_title text,
  p_description text,
  p_priority text,
  p_scheduled_at timestamptz,
  p_scheduled_timezone text,
  p_estimated_minutes integer,
  p_position numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_claim jsonb;
  v_actor uuid := auth.uid();
  v_life_day public.life_days%rowtype;
  v_task public.tasks%rowtype;
  v_cursor bigint;
  v_result jsonb;
begin
  v_claim := private.claim_command(
    p_operation_id, p_device_id, 'task.create', p_expected_revision,
    p_client_occurred_at, p_client_timezone,
    jsonb_build_object(
      'lifeDayId', p_life_day_id, 'title', p_title, 'description', p_description,
      'priority', p_priority, 'scheduledAt', p_scheduled_at,
      'scheduledTimezone', p_scheduled_timezone, 'estimatedMinutes', p_estimated_minutes,
      'position', p_position
    )
  );
  if v_claim is not null then return v_claim; end if;

  if p_expected_revision is not null
    or nullif(btrim(p_title), '') is null
    or char_length(p_title) > 500
    or (p_description is not null and char_length(p_description) > 5000)
    or p_priority is null
    or p_priority not in ('non_negotiable', 'progress', 'maintenance')
    or (p_estimated_minutes is not null and p_estimated_minutes not between 1 and 1440)
    or p_position is null then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'rejected', 'validation_failed', 'The task fields are invalid.'
    ));
  end if;

  if (p_scheduled_at is null) <> (p_scheduled_timezone is null)
    or not private.is_valid_timezone(p_client_timezone)
    or (p_scheduled_timezone is not null and not private.is_valid_timezone(p_scheduled_timezone)) then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'rejected', 'invalid_timezone', 'Use a valid IANA time zone for scheduled work.'
    ));
  end if;

  if p_life_day_id is not null then
    select * into v_life_day from public.life_days
      where id = p_life_day_id and user_id = v_actor;
    if not found then
      return private.finish_command(p_operation_id, private.command_error(
        p_operation_id, 'rejected', 'not_found', 'The selected Life Day is not available.'
      ));
    end if;
  end if;

  insert into public.tasks (
    user_id, life_day_id, title, description, priority, scheduled_at,
    scheduled_timezone, estimated_minutes, position
  ) values (
    v_actor, p_life_day_id, btrim(p_title), nullif(btrim(p_description), ''), p_priority,
    p_scheduled_at, p_scheduled_timezone, p_estimated_minutes, p_position
  ) returning * into v_task;

  insert into public.task_events (
    user_id, task_id, life_day_id, operation_id, event_type, occurred_at, to_status
  ) values (
    v_actor, v_task.id, v_task.life_day_id, p_operation_id, 'created', p_client_occurred_at, v_task.status
  );

  v_cursor := private.emit_change(
    v_actor, p_operation_id, 'task', v_task.id, 'task.create', null, v_task.revision,
    jsonb_build_object('fields', jsonb_build_array('title', 'priority', 'life_day_id')),
    p_client_occurred_at
  );
  v_result := jsonb_build_object(
    'operationId', p_operation_id, 'status', 'accepted',
    'entity', private.task_entity(v_task), 'syncCursor', v_cursor
  );
  return private.finish_command(p_operation_id, v_result);
end;
$$;

create function public.command_update_task(
  p_operation_id uuid,
  p_device_id uuid,
  p_expected_revision bigint,
  p_client_occurred_at timestamptz,
  p_client_timezone text,
  p_task_id uuid,
  p_life_day_id uuid,
  p_title text,
  p_description text,
  p_status text,
  p_priority text,
  p_scheduled_at timestamptz,
  p_scheduled_timezone text,
  p_estimated_minutes integer,
  p_position numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_claim jsonb;
  v_actor uuid := auth.uid();
  v_life_day public.life_days%rowtype;
  v_task public.tasks%rowtype;
  v_before_revision bigint;
  v_before_status text;
  v_cursor bigint;
  v_result jsonb;
begin
  v_claim := private.claim_command(
    p_operation_id, p_device_id, 'task.update', p_expected_revision,
    p_client_occurred_at, p_client_timezone,
    jsonb_build_object(
      'taskId', p_task_id, 'lifeDayId', p_life_day_id, 'title', p_title,
      'description', p_description, 'status', p_status, 'priority', p_priority,
      'scheduledAt', p_scheduled_at, 'scheduledTimezone', p_scheduled_timezone,
      'estimatedMinutes', p_estimated_minutes, 'position', p_position
    )
  );
  if v_claim is not null then return v_claim; end if;

  select * into v_task from public.tasks
    where id = p_task_id and user_id = v_actor
    for update;
  if not found then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'rejected', 'not_found', 'This task is not available.'
    ));
  end if;

  if p_expected_revision is null or p_expected_revision <> v_task.revision then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'conflict', 'revision_conflict', 'This task changed. Refresh before retrying.',
      private.task_entity(v_task)
    ));
  end if;

  if v_task.status in ('completed', 'cancelled', 'archived')
    or p_status is null
    or p_status not in ('planned', 'in_progress', 'overdue', 'archived')
    or nullif(btrim(p_title), '') is null
    or char_length(p_title) > 500
    or (p_description is not null and char_length(p_description) > 5000)
    or p_priority is null
    or p_priority not in ('non_negotiable', 'progress', 'maintenance')
    or (p_estimated_minutes is not null and p_estimated_minutes not between 1 and 1440)
    or p_position is null then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'conflict', 'invalid_transition', 'This task cannot be updated with those values.',
      private.task_entity(v_task)
    ));
  end if;

  if (p_scheduled_at is null) <> (p_scheduled_timezone is null)
    or not private.is_valid_timezone(p_client_timezone)
    or (p_scheduled_timezone is not null and not private.is_valid_timezone(p_scheduled_timezone)) then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'rejected', 'invalid_timezone', 'Use a valid IANA time zone for scheduled work.'
    ));
  end if;

  if p_life_day_id is not null then
    select * into v_life_day from public.life_days
      where id = p_life_day_id and user_id = v_actor;
    if not found then
      return private.finish_command(p_operation_id, private.command_error(
        p_operation_id, 'rejected', 'not_found', 'The selected Life Day is not available.'
      ));
    end if;
  end if;

  v_before_revision := v_task.revision;
  v_before_status := v_task.status;
  update public.tasks
    set life_day_id = p_life_day_id,
        title = btrim(p_title),
        description = nullif(btrim(p_description), ''),
        status = p_status,
        priority = p_priority,
        scheduled_at = p_scheduled_at,
        scheduled_timezone = p_scheduled_timezone,
        estimated_minutes = p_estimated_minutes,
        position = p_position,
        revision = revision + 1,
        updated_at = timezone('utc', now())
    where id = v_task.id
    returning * into v_task;

  insert into public.task_events (
    user_id, task_id, life_day_id, operation_id, event_type, occurred_at, from_status, to_status
  ) values (
    v_actor, v_task.id, v_task.life_day_id, p_operation_id, 'updated', p_client_occurred_at,
    v_before_status, v_task.status
  );

  v_cursor := private.emit_change(
    v_actor, p_operation_id, 'task', v_task.id, 'task.update', v_before_revision, v_task.revision,
    jsonb_build_object('fields', jsonb_build_array('title', 'description', 'status', 'priority', 'scheduled_at', 'position')),
    p_client_occurred_at
  );
  v_result := jsonb_build_object(
    'operationId', p_operation_id, 'status', 'accepted',
    'entity', private.task_entity(v_task), 'syncCursor', v_cursor
  );
  return private.finish_command(p_operation_id, v_result);
end;
$$;

create function public.command_complete_task(
  p_operation_id uuid,
  p_device_id uuid,
  p_expected_revision bigint,
  p_client_occurred_at timestamptz,
  p_client_timezone text,
  p_task_id uuid,
  p_completed_at timestamptz,
  p_life_day_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_claim jsonb;
  v_actor uuid := auth.uid();
  v_life_day public.life_days%rowtype;
  v_task public.tasks%rowtype;
  v_before_revision bigint;
  v_before_status text;
  v_cursor bigint;
  v_result jsonb;
begin
  v_claim := private.claim_command(
    p_operation_id, p_device_id, 'task.complete', p_expected_revision,
    p_client_occurred_at, p_client_timezone,
    jsonb_build_object('taskId', p_task_id, 'completedAt', p_completed_at, 'lifeDayId', p_life_day_id)
  );
  if v_claim is not null then return v_claim; end if;

  if not private.is_valid_timezone(p_client_timezone) or p_completed_at is null then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'rejected', 'validation_failed', 'Task completion metadata is invalid.'
    ));
  end if;

  select * into v_task from public.tasks
    where id = p_task_id and user_id = v_actor
    for update;
  if not found then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'rejected', 'not_found', 'This task is not available.'
    ));
  end if;

  if p_expected_revision is null or p_expected_revision <> v_task.revision then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'conflict', 'revision_conflict', 'This task changed. Refresh before retrying.',
      private.task_entity(v_task)
    ));
  end if;

  if v_task.status = 'completed' or v_task.status in ('cancelled', 'archived') then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'conflict', 'invalid_transition', 'This task cannot be completed again.',
      private.task_entity(v_task)
    ));
  end if;

  if p_life_day_id is not null then
    select * into v_life_day from public.life_days
      where id = p_life_day_id and user_id = v_actor;
    if not found then
      return private.finish_command(p_operation_id, private.command_error(
        p_operation_id, 'rejected', 'not_found', 'The selected Life Day is not available.'
      ));
    end if;
  end if;

  v_before_revision := v_task.revision;
  v_before_status := v_task.status;
  update public.tasks
    set life_day_id = coalesce(p_life_day_id, life_day_id),
        status = 'completed',
        completed_at = p_completed_at,
        revision = revision + 1,
        updated_at = timezone('utc', now())
    where id = v_task.id
    returning * into v_task;

  insert into public.task_events (
    user_id, task_id, life_day_id, operation_id, event_type, occurred_at, from_status, to_status
  ) values (
    v_actor, v_task.id, v_task.life_day_id, p_operation_id, 'completed', p_completed_at,
    v_before_status, v_task.status
  );
  v_cursor := private.emit_change(
    v_actor, p_operation_id, 'task', v_task.id, 'task.complete', v_before_revision,
    v_task.revision, jsonb_build_object('fields', jsonb_build_array('status', 'completed_at')),
    p_completed_at
  );
  v_result := jsonb_build_object(
    'operationId', p_operation_id, 'status', 'accepted',
    'entity', private.task_entity(v_task), 'syncCursor', v_cursor
  );
  return private.finish_command(p_operation_id, v_result);
end;
$$;

create function public.command_reschedule_task(
  p_operation_id uuid,
  p_device_id uuid,
  p_expected_revision bigint,
  p_client_occurred_at timestamptz,
  p_client_timezone text,
  p_task_id uuid,
  p_scheduled_at timestamptz,
  p_scheduled_timezone text,
  p_reason_code text,
  p_reason_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_claim jsonb;
  v_actor uuid := auth.uid();
  v_task public.tasks%rowtype;
  v_before_revision bigint;
  v_before_status text;
  v_cursor bigint;
  v_result jsonb;
begin
  v_claim := private.claim_command(
    p_operation_id, p_device_id, 'task.reschedule', p_expected_revision,
    p_client_occurred_at, p_client_timezone,
    jsonb_build_object(
      'taskId', p_task_id, 'scheduledAt', p_scheduled_at,
      'scheduledTimezone', p_scheduled_timezone, 'reasonCode', p_reason_code,
      'reasonNote', p_reason_note
    )
  );
  if v_claim is not null then return v_claim; end if;

  if not private.is_valid_timezone(p_client_timezone)
    or not private.is_valid_timezone(p_scheduled_timezone)
    or p_scheduled_at is null
    or p_reason_code is null
    or p_reason_code not in (
      'user_rescheduled', 'capacity_limit', 'external_change',
      'no_longer_relevant', 'duplicate', 'other'
    )
    or (p_reason_code = 'other' and nullif(btrim(p_reason_note), '') is null) then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'rejected', 'validation_failed', 'A scheduled time, IANA zone, and structured reason are required.'
    ));
  end if;

  select * into v_task from public.tasks
    where id = p_task_id and user_id = v_actor
    for update;
  if not found then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'rejected', 'not_found', 'This task is not available.'
    ));
  end if;

  if p_expected_revision is null or p_expected_revision <> v_task.revision then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'conflict', 'revision_conflict', 'This task changed. Refresh before retrying.',
      private.task_entity(v_task)
    ));
  end if;

  if v_task.status not in ('planned', 'overdue') then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'conflict', 'invalid_transition', 'Only planned or overdue tasks can be rescheduled.',
      private.task_entity(v_task)
    ));
  end if;

  v_before_revision := v_task.revision;
  v_before_status := v_task.status;
  update public.tasks
    set scheduled_at = p_scheduled_at,
        scheduled_timezone = p_scheduled_timezone,
        status = 'planned',
        revision = revision + 1,
        updated_at = timezone('utc', now())
    where id = v_task.id
    returning * into v_task;

  insert into public.task_events (
    user_id, task_id, life_day_id, operation_id, event_type, occurred_at,
    from_status, to_status, reason_code, reason_note
  ) values (
    v_actor, v_task.id, v_task.life_day_id, p_operation_id, 'rescheduled',
    p_client_occurred_at, v_before_status, v_task.status, p_reason_code,
    nullif(btrim(p_reason_note), '')
  );
  v_cursor := private.emit_change(
    v_actor, p_operation_id, 'task', v_task.id, 'task.reschedule', v_before_revision,
    v_task.revision, jsonb_build_object('fields', jsonb_build_array('scheduled_at', 'status')),
    p_client_occurred_at
  );
  v_result := jsonb_build_object(
    'operationId', p_operation_id, 'status', 'accepted',
    'entity', private.task_entity(v_task), 'syncCursor', v_cursor
  );
  return private.finish_command(p_operation_id, v_result);
end;
$$;

create function public.command_cancel_task(
  p_operation_id uuid,
  p_device_id uuid,
  p_expected_revision bigint,
  p_client_occurred_at timestamptz,
  p_client_timezone text,
  p_task_id uuid,
  p_cancelled_at timestamptz,
  p_reason_code text,
  p_reason_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_claim jsonb;
  v_actor uuid := auth.uid();
  v_task public.tasks%rowtype;
  v_before_revision bigint;
  v_before_status text;
  v_cursor bigint;
  v_result jsonb;
begin
  v_claim := private.claim_command(
    p_operation_id, p_device_id, 'task.cancel', p_expected_revision,
    p_client_occurred_at, p_client_timezone,
    jsonb_build_object(
      'taskId', p_task_id, 'cancelledAt', p_cancelled_at,
      'reasonCode', p_reason_code, 'reasonNote', p_reason_note
    )
  );
  if v_claim is not null then return v_claim; end if;

  if not private.is_valid_timezone(p_client_timezone)
    or p_cancelled_at is null
    or p_reason_code is null
    or p_reason_code not in (
      'user_rescheduled', 'capacity_limit', 'external_change',
      'no_longer_relevant', 'duplicate', 'other'
    )
    or (p_reason_code = 'other' and nullif(btrim(p_reason_note), '') is null) then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'rejected', 'validation_failed', 'A cancellation time and structured reason are required.'
    ));
  end if;

  select * into v_task from public.tasks
    where id = p_task_id and user_id = v_actor
    for update;
  if not found then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'rejected', 'not_found', 'This task is not available.'
    ));
  end if;

  if p_expected_revision is null or p_expected_revision <> v_task.revision then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'conflict', 'revision_conflict', 'This task changed. Refresh before retrying.',
      private.task_entity(v_task)
    ));
  end if;

  if v_task.status in ('completed', 'cancelled', 'archived') then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'conflict', 'invalid_transition', 'This task cannot be cancelled.',
      private.task_entity(v_task)
    ));
  end if;

  v_before_revision := v_task.revision;
  v_before_status := v_task.status;
  update public.tasks
    set status = 'cancelled',
        cancelled_at = p_cancelled_at,
        cancellation_reason_code = p_reason_code,
        cancellation_reason_note = nullif(btrim(p_reason_note), ''),
        revision = revision + 1,
        updated_at = timezone('utc', now())
    where id = v_task.id
    returning * into v_task;

  insert into public.task_events (
    user_id, task_id, life_day_id, operation_id, event_type, occurred_at,
    from_status, to_status, reason_code, reason_note
  ) values (
    v_actor, v_task.id, v_task.life_day_id, p_operation_id, 'cancelled',
    p_cancelled_at, v_before_status, v_task.status, p_reason_code,
    nullif(btrim(p_reason_note), '')
  );
  v_cursor := private.emit_change(
    v_actor, p_operation_id, 'task', v_task.id, 'task.cancel', v_before_revision,
    v_task.revision, jsonb_build_object('fields', jsonb_build_array('status', 'cancelled_at', 'cancellation_reason_code')),
    p_cancelled_at
  );
  v_result := jsonb_build_object(
    'operationId', p_operation_id, 'status', 'accepted',
    'entity', private.task_entity(v_task), 'syncCursor', v_cursor
  );
  return private.finish_command(p_operation_id, v_result);
end;
$$;

revoke all on function public.command_start_life_day(uuid, uuid, bigint, timestamptz, text, timestamptz, text) from public;
revoke all on function public.command_close_life_day(uuid, uuid, bigint, timestamptz, text, uuid, timestamptz, text) from public;
revoke all on function public.command_repair_previous_life_day(uuid, uuid, bigint, timestamptz, text, uuid, timestamptz, text, text, text) from public;
revoke all on function public.command_create_task(uuid, uuid, bigint, timestamptz, text, uuid, text, text, text, timestamptz, text, integer, numeric) from public;
revoke all on function public.command_update_task(uuid, uuid, bigint, timestamptz, text, uuid, uuid, text, text, text, text, timestamptz, text, integer, numeric) from public;
revoke all on function public.command_complete_task(uuid, uuid, bigint, timestamptz, text, uuid, timestamptz, uuid) from public;
revoke all on function public.command_reschedule_task(uuid, uuid, bigint, timestamptz, text, uuid, timestamptz, text, text, text) from public;
revoke all on function public.command_cancel_task(uuid, uuid, bigint, timestamptz, text, uuid, timestamptz, text, text) from public;

grant execute on function public.command_start_life_day(uuid, uuid, bigint, timestamptz, text, timestamptz, text) to authenticated;
grant execute on function public.command_close_life_day(uuid, uuid, bigint, timestamptz, text, uuid, timestamptz, text) to authenticated;
grant execute on function public.command_repair_previous_life_day(uuid, uuid, bigint, timestamptz, text, uuid, timestamptz, text, text, text) to authenticated;
grant execute on function public.command_create_task(uuid, uuid, bigint, timestamptz, text, uuid, text, text, text, timestamptz, text, integer, numeric) to authenticated;
grant execute on function public.command_update_task(uuid, uuid, bigint, timestamptz, text, uuid, uuid, text, text, text, text, timestamptz, text, integer, numeric) to authenticated;
grant execute on function public.command_complete_task(uuid, uuid, bigint, timestamptz, text, uuid, timestamptz, uuid) to authenticated;
grant execute on function public.command_reschedule_task(uuid, uuid, bigint, timestamptz, text, uuid, timestamptz, text, text, text) to authenticated;
grant execute on function public.command_cancel_task(uuid, uuid, bigint, timestamptz, text, uuid, timestamptz, text, text) to authenticated;
