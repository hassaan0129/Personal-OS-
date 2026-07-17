-- Phase 1B: authenticated, owner-scoped Today read models.
-- These functions expose only the small shapes consumed by the initial web
-- and mobile Today clients. They do not grant direct write access.

create function private.require_authenticated_user()
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise insufficient_privilege using message = 'Sign in before reading Today.';
  end if;

  return v_user_id;
end;
$$;

create function private.profile_read_model(p_profile public.profiles)
returns jsonb
language sql
stable
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'id', p_profile.id,
    'homeTimezone', p_profile.home_timezone,
    'revision', p_profile.revision,
    'createdAt', p_profile.created_at,
    'updatedAt', p_profile.updated_at
  );
$$;

create function private.life_day_read_model(p_life_day public.life_days)
returns jsonb
language sql
stable
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'id', p_life_day.id,
    'operationalDate', p_life_day.operational_date,
    'timezone', p_life_day.timezone,
    'wokeAt', p_life_day.woke_at,
    'sleptAt', p_life_day.slept_at,
    'revision', p_life_day.revision,
    'createdAt', p_life_day.created_at,
    'updatedAt', p_life_day.updated_at
  );
$$;

create function private.task_read_model(p_task public.tasks)
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
    'completedAt', p_task.completed_at,
    'revision', p_task.revision,
    'createdAt', p_task.created_at,
    'updatedAt', p_task.updated_at
  );
$$;

create function public.get_current_life_day()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := private.require_authenticated_user();
  v_life_day public.life_days%rowtype;
begin
  select * into v_life_day
  from public.life_days
  where user_id = v_user_id
    and slept_at is null;

  if not found then
    return null;
  end if;

  return private.life_day_read_model(v_life_day);
end;
$$;

create function public.get_today_tasks()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := private.require_authenticated_user();
  v_life_day_id uuid;
begin
  select id into v_life_day_id
  from public.life_days
  where user_id = v_user_id
    and slept_at is null;

  if not found then
    return '[]'::jsonb;
  end if;

  return (
    select coalesce(
      jsonb_agg(private.task_read_model(t) order by t.position asc, t.created_at asc),
      '[]'::jsonb
    )
    from public.tasks t
    where t.user_id = v_user_id
      and t.life_day_id = v_life_day_id
      and t.status <> 'archived'
  );
end;
$$;

create function public.get_today_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := private.require_authenticated_user();
  v_profile public.profiles%rowtype;
begin
  select * into v_profile
  from public.profiles
  where id = v_user_id;

  if not found then
    raise insufficient_privilege using message = 'Your profile is not available.';
  end if;

  return jsonb_build_object(
    'profile', private.profile_read_model(v_profile),
    'lifeDay', public.get_current_life_day(),
    'tasks', public.get_today_tasks()
  );
end;
$$;

revoke all on function private.require_authenticated_user() from public;
revoke all on function private.profile_read_model(public.profiles) from public;
revoke all on function private.life_day_read_model(public.life_days) from public;
revoke all on function private.task_read_model(public.tasks) from public;

revoke all on function public.get_current_life_day() from public;
revoke all on function public.get_today_tasks() from public;
revoke all on function public.get_today_snapshot() from public;

grant execute on function public.get_current_life_day() to authenticated;
grant execute on function public.get_today_tasks() to authenticated;
grant execute on function public.get_today_snapshot() to authenticated;
