-- Phase 1C: daily Planner Mode task state and command boundary.
-- This migration deliberately extends the existing command-only task model.
-- It does not grant client write privileges to protected tables.

alter table public.tasks
  add column is_top_three boolean not null default false;

create index tasks_active_top_three_idx
  on public.tasks (user_id, life_day_id, position)
  where is_top_three and status in ('planned', 'in_progress', 'overdue');

alter table public.task_events
  drop constraint task_events_event_type_check;

alter table public.task_events
  add constraint task_events_event_type_check
  check (
    event_type in (
      'created', 'updated', 'completed', 'rescheduled', 'cancelled',
      'reordered', 'top_three_changed', 'reopened',
      'resolved_overdue', 'resolved_rescheduled'
    )
  );

create or replace function private.task_entity(p_task public.tasks)
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
      'isTopThree', p_task.is_top_three,
      'completedAt', p_task.completed_at
    )
  );
$$;

create or replace function private.task_read_model(p_task public.tasks)
returns jsonb
language sql
stable
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'id', p_task.id,
    'lifeDayId', p_task.life_day_id,
    'title', p_task.title,
    'description', p_task.description,
    'status', p_task.status,
    'priority', p_task.priority,
    'scheduledAt', p_task.scheduled_at,
    'scheduledTimezone', p_task.scheduled_timezone,
    'estimatedMinutes', p_task.estimated_minutes,
    'position', p_task.position,
    'isTopThree', p_task.is_top_three,
    'completedAt', p_task.completed_at,
    'revision', p_task.revision,
    'createdAt', p_task.created_at,
    'updatedAt', p_task.updated_at
  );
$$;

create function public.command_reorder_task(
  p_operation_id uuid,
  p_device_id uuid,
  p_expected_revision bigint,
  p_client_occurred_at timestamptz,
  p_client_timezone text,
  p_task_id uuid,
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
  v_task public.tasks%rowtype;
  v_before_revision bigint;
  v_before_position numeric;
  v_cursor bigint;
  v_result jsonb;
begin
  v_claim := private.claim_command(
    p_operation_id, p_device_id, 'task.reorder', p_expected_revision,
    p_client_occurred_at, p_client_timezone,
    jsonb_build_object('taskId', p_task_id, 'position', p_position)
  );
  if v_claim is not null then return v_claim; end if;

  if not private.is_valid_timezone(p_client_timezone) or p_position is null then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'rejected', 'validation_failed', 'A position and valid IANA time zone are required.'
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
      p_operation_id, 'conflict', 'invalid_transition', 'Only active tasks can be reordered.',
      private.task_entity(v_task)
    ));
  end if;

  v_before_revision := v_task.revision;
  v_before_position := v_task.position;
  update public.tasks
    set position = p_position,
        revision = revision + 1,
        updated_at = timezone('utc', now())
    where id = v_task.id
    returning * into v_task;

  insert into public.task_events (
    user_id, task_id, life_day_id, operation_id, event_type, occurred_at, metadata
  ) values (
    v_actor, v_task.id, v_task.life_day_id, p_operation_id, 'reordered', p_client_occurred_at,
    jsonb_build_object('fromPosition', v_before_position, 'toPosition', v_task.position)
  );
  v_cursor := private.emit_change(
    v_actor, p_operation_id, 'task', v_task.id, 'task.reorder', v_before_revision,
    v_task.revision, jsonb_build_object('fields', jsonb_build_array('position')),
    p_client_occurred_at
  );
  v_result := jsonb_build_object(
    'operationId', p_operation_id, 'status', 'accepted',
    'entity', private.task_entity(v_task), 'syncCursor', v_cursor
  );
  return private.finish_command(p_operation_id, v_result);
end;
$$;

create function public.command_set_task_top_three(
  p_operation_id uuid,
  p_device_id uuid,
  p_expected_revision bigint,
  p_client_occurred_at timestamptz,
  p_client_timezone text,
  p_task_id uuid,
  p_is_top_three boolean
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
  v_life_day public.life_days%rowtype;
  v_before_revision bigint;
  v_cursor bigint;
  v_result jsonb;
begin
  v_claim := private.claim_command(
    p_operation_id, p_device_id, 'task.set_top_three', p_expected_revision,
    p_client_occurred_at, p_client_timezone,
    jsonb_build_object('taskId', p_task_id, 'isTopThree', p_is_top_three)
  );
  if v_claim is not null then return v_claim; end if;

  if not private.is_valid_timezone(p_client_timezone) or p_is_top_three is null then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'rejected', 'validation_failed', 'A Top 3 value and valid IANA time zone are required.'
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

  if p_is_top_three then
    if v_task.life_day_id is null or v_task.status not in ('planned', 'in_progress', 'overdue') then
      return private.finish_command(p_operation_id, private.command_error(
        p_operation_id, 'conflict', 'invalid_transition', 'Only active Life Day tasks can be selected for Top 3.',
        private.task_entity(v_task)
      ));
    end if;

    select * into v_life_day from public.life_days
      where id = v_task.life_day_id and user_id = v_actor and slept_at is null;
    if not found then
      return private.finish_command(p_operation_id, private.command_error(
        p_operation_id, 'conflict', 'invalid_transition', 'Top 3 tasks must belong to the active Life Day.',
        private.task_entity(v_task)
      ));
    end if;

    perform pg_advisory_xact_lock(hashtextextended(v_actor::text || ':' || v_task.life_day_id::text, 0));
    if not v_task.is_top_three and (
      select count(*) from public.tasks
      where user_id = v_actor
        and life_day_id = v_task.life_day_id
        and is_top_three
        and status in ('planned', 'in_progress', 'overdue')
    ) >= 3 then
      return private.finish_command(p_operation_id, private.command_error(
        p_operation_id, 'conflict', 'top_three_limit', 'A Life Day can have at most three active Top 3 tasks.',
        private.task_entity(v_task)
      ));
    end if;
  end if;

  v_before_revision := v_task.revision;
  update public.tasks
    set is_top_three = p_is_top_three,
        revision = revision + 1,
        updated_at = timezone('utc', now())
    where id = v_task.id
    returning * into v_task;

  insert into public.task_events (
    user_id, task_id, life_day_id, operation_id, event_type, occurred_at, metadata
  ) values (
    v_actor, v_task.id, v_task.life_day_id, p_operation_id, 'top_three_changed', p_client_occurred_at,
    jsonb_build_object('isTopThree', v_task.is_top_three)
  );
  v_cursor := private.emit_change(
    v_actor, p_operation_id, 'task', v_task.id, 'task.set_top_three', v_before_revision,
    v_task.revision, jsonb_build_object('fields', jsonb_build_array('is_top_three')),
    p_client_occurred_at
  );
  v_result := jsonb_build_object(
    'operationId', p_operation_id, 'status', 'accepted',
    'entity', private.task_entity(v_task), 'syncCursor', v_cursor
  );
  return private.finish_command(p_operation_id, v_result);
end;
$$;

create function public.command_reopen_task(
  p_operation_id uuid,
  p_device_id uuid,
  p_expected_revision bigint,
  p_client_occurred_at timestamptz,
  p_client_timezone text,
  p_task_id uuid,
  p_life_day_id uuid
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
  v_life_day public.life_days%rowtype;
  v_before_revision bigint;
  v_cursor bigint;
  v_result jsonb;
begin
  v_claim := private.claim_command(
    p_operation_id, p_device_id, 'task.reopen', p_expected_revision,
    p_client_occurred_at, p_client_timezone,
    jsonb_build_object('taskId', p_task_id, 'lifeDayId', p_life_day_id)
  );
  if v_claim is not null then return v_claim; end if;

  if not private.is_valid_timezone(p_client_timezone) or p_life_day_id is null then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'rejected', 'validation_failed', 'An active target Life Day and valid IANA time zone are required.'
    ));
  end if;

  select * into v_task from public.tasks where id = p_task_id and user_id = v_actor for update;
  if not found then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'rejected', 'not_found', 'This task is not available.'
    ));
  end if;
  if p_expected_revision is null or p_expected_revision <> v_task.revision then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'conflict', 'revision_conflict', 'This task changed. Refresh before retrying.', private.task_entity(v_task)
    ));
  end if;
  if v_task.status <> 'completed' then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'conflict', 'invalid_transition', 'Only completed tasks can be moved back to planned.', private.task_entity(v_task)
    ));
  end if;
  select * into v_life_day from public.life_days
    where id = p_life_day_id and user_id = v_actor and slept_at is null;
  if not found then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'rejected', 'not_found', 'The selected active Life Day is not available.'
    ));
  end if;

  v_before_revision := v_task.revision;
  update public.tasks
    set life_day_id = v_life_day.id,
        status = 'planned',
        completed_at = null,
        is_top_three = false,
        revision = revision + 1,
        updated_at = timezone('utc', now())
    where id = v_task.id
    returning * into v_task;
  insert into public.task_events (
    user_id, task_id, life_day_id, operation_id, event_type, occurred_at, from_status, to_status
  ) values (
    v_actor, v_task.id, v_task.life_day_id, p_operation_id, 'reopened', p_client_occurred_at,
    'completed', 'planned'
  );
  v_cursor := private.emit_change(
    v_actor, p_operation_id, 'task', v_task.id, 'task.reopen', v_before_revision,
    v_task.revision, jsonb_build_object('fields', jsonb_build_array('life_day_id', 'status', 'completed_at', 'is_top_three')),
    p_client_occurred_at
  );
  v_result := jsonb_build_object(
    'operationId', p_operation_id, 'status', 'accepted',
    'entity', private.task_entity(v_task), 'syncCursor', v_cursor
  );
  return private.finish_command(p_operation_id, v_result);
end;
$$;

create function public.command_resolve_unfinished_task(
  p_operation_id uuid,
  p_device_id uuid,
  p_expected_revision bigint,
  p_client_occurred_at timestamptz,
  p_client_timezone text,
  p_task_id uuid,
  p_resolution text,
  p_target_life_day_id uuid,
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
  v_target_life_day public.life_days%rowtype;
  v_before_revision bigint;
  v_before_status text;
  v_cursor bigint;
  v_result jsonb;
begin
  v_claim := private.claim_command(
    p_operation_id, p_device_id, 'task.resolve_unfinished', p_expected_revision,
    p_client_occurred_at, p_client_timezone,
    jsonb_build_object(
      'taskId', p_task_id, 'resolution', p_resolution, 'targetLifeDayId', p_target_life_day_id,
      'scheduledAt', p_scheduled_at, 'scheduledTimezone', p_scheduled_timezone,
      'reasonCode', p_reason_code, 'reasonNote', p_reason_note
    )
  );
  if v_claim is not null then return v_claim; end if;

  if not private.is_valid_timezone(p_client_timezone)
    or p_resolution not in ('overdue', 'reschedule') then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'rejected', 'validation_failed', 'Choose overdue or reschedule with valid command metadata.'
    ));
  end if;

  select * into v_task from public.tasks where id = p_task_id and user_id = v_actor for update;
  if not found then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'rejected', 'not_found', 'This task is not available.'
    ));
  end if;
  if p_expected_revision is null or p_expected_revision <> v_task.revision then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'conflict', 'revision_conflict', 'This task changed. Refresh before retrying.', private.task_entity(v_task)
    ));
  end if;
  if v_task.status not in ('planned', 'in_progress') then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'conflict', 'invalid_transition', 'Only unfinished tasks can be resolved.', private.task_entity(v_task)
    ));
  end if;

  if p_resolution = 'reschedule' then
    if p_scheduled_at is null
      or p_scheduled_timezone is null
      or not private.is_valid_timezone(p_scheduled_timezone)
      or p_reason_code is null
      or p_reason_code not in ('user_rescheduled', 'capacity_limit', 'external_change', 'no_longer_relevant', 'duplicate', 'other')
      or (p_reason_code = 'other' and nullif(btrim(p_reason_note), '') is null) then
      return private.finish_command(p_operation_id, private.command_error(
        p_operation_id, 'rejected', 'validation_failed', 'Rescheduling requires a time, IANA zone, and structured reason.'
      ));
    end if;
    if p_target_life_day_id is not null then
      select * into v_target_life_day from public.life_days
        where id = p_target_life_day_id and user_id = v_actor and slept_at is null;
      if not found or p_target_life_day_id = v_task.life_day_id then
        return private.finish_command(p_operation_id, private.command_error(
          p_operation_id, 'rejected', 'not_found', 'Choose another active Life Day or leave it empty for a date-only reschedule.'
        ));
      end if;
    end if;
  elsif p_target_life_day_id is not null or p_scheduled_at is not null or p_scheduled_timezone is not null
    or p_reason_code is not null or p_reason_note is not null then
    return private.finish_command(p_operation_id, private.command_error(
      p_operation_id, 'rejected', 'validation_failed', 'Keeping a task overdue does not accept reschedule fields.'
    ));
  end if;

  v_before_revision := v_task.revision;
  v_before_status := v_task.status;
  if p_resolution = 'overdue' then
    update public.tasks
      set status = 'overdue',
          is_top_three = false,
          revision = revision + 1,
          updated_at = timezone('utc', now())
      where id = v_task.id
      returning * into v_task;
    insert into public.task_events (
      user_id, task_id, life_day_id, operation_id, event_type, occurred_at, from_status, to_status
    ) values (
      v_actor, v_task.id, v_task.life_day_id, p_operation_id, 'resolved_overdue', p_client_occurred_at,
      v_before_status, v_task.status
    );
  else
    update public.tasks
      set life_day_id = p_target_life_day_id,
          scheduled_at = p_scheduled_at,
          scheduled_timezone = p_scheduled_timezone,
          status = 'planned',
          is_top_three = false,
          revision = revision + 1,
          updated_at = timezone('utc', now())
      where id = v_task.id
      returning * into v_task;
    insert into public.task_events (
      user_id, task_id, life_day_id, operation_id, event_type, occurred_at, from_status, to_status, reason_code, reason_note
    ) values (
      v_actor, v_task.id, v_task.life_day_id, p_operation_id, 'resolved_rescheduled', p_client_occurred_at,
      v_before_status, v_task.status, p_reason_code, nullif(btrim(p_reason_note), '')
    );
  end if;

  v_cursor := private.emit_change(
    v_actor, p_operation_id, 'task', v_task.id, 'task.resolve_unfinished', v_before_revision,
    v_task.revision,
    jsonb_build_object('fields', jsonb_build_array('life_day_id', 'status', 'scheduled_at', 'is_top_three')),
    p_client_occurred_at
  );
  v_result := jsonb_build_object(
    'operationId', p_operation_id, 'status', 'accepted',
    'entity', private.task_entity(v_task), 'syncCursor', v_cursor
  );
  return private.finish_command(p_operation_id, v_result);
end;
$$;

revoke all on function public.command_reorder_task(uuid, uuid, bigint, timestamptz, text, uuid, numeric) from public;
revoke all on function public.command_set_task_top_three(uuid, uuid, bigint, timestamptz, text, uuid, boolean) from public;
revoke all on function public.command_reopen_task(uuid, uuid, bigint, timestamptz, text, uuid, uuid) from public;
revoke all on function public.command_resolve_unfinished_task(uuid, uuid, bigint, timestamptz, text, uuid, text, uuid, timestamptz, text, text, text) from public;

grant execute on function public.command_reorder_task(uuid, uuid, bigint, timestamptz, text, uuid, numeric) to authenticated;
grant execute on function public.command_set_task_top_three(uuid, uuid, bigint, timestamptz, text, uuid, boolean) to authenticated;
grant execute on function public.command_reopen_task(uuid, uuid, bigint, timestamptz, text, uuid, uuid) to authenticated;
grant execute on function public.command_resolve_unfinished_task(uuid, uuid, bigint, timestamptz, text, uuid, text, uuid, timestamptz, text, text, text) to authenticated;
