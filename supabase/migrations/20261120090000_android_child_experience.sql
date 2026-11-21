BEGIN;

CREATE OR REPLACE FUNCTION public.guard_child_usage_day_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.state = OLD.state THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.state = 'preparing' AND NEW.state IN ('outstanding', 'expired', 'replaced', 'revoked'))
    OR
    (OLD.state = 'outstanding' AND NEW.state IN ('accepted', 'expired', 'replaced', 'revoked'))
    OR
    (OLD.state = 'accepted' AND NEW.state = 'replaced')
    OR
    (OLD.state = 'replaced' AND NEW.state = 'accepted')
  ) THEN
    RAISE EXCEPTION 'Illegal usage-day state transition'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_android_child_device_profile(
  p_device_token_hash text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_child_id uuid;
  v_device_id uuid;
  v_revoked_at timestamptz;
  v_active boolean;
  v_display_name text;
  v_avatar text;
  v_timezone text;
  v_usage_date date;
  v_goal_minutes integer;
BEGIN
  IF p_device_token_hash IS NULL OR p_device_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid device credential'
      USING ERRCODE = '22023';
  END IF;

  SELECT d.id, d.child_id, d.revoked_at
  INTO v_device_id, v_child_id, v_revoked_at
  FROM public.child_devices d
  WHERE d.token_hash = p_device_token_hash;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'invalid_device');
  END IF;

  SELECT cp.is_active, cp.display_name, cp.avatar
  INTO v_active, v_display_name, v_avatar
  FROM public.child_profiles cp
  WHERE cp.id = v_child_id
  FOR UPDATE;
  IF NOT FOUND OR v_active IS DISTINCT FROM TRUE THEN
    RETURN jsonb_build_object('status', 'child_inactive');
  END IF;

  SELECT d.revoked_at
  INTO v_revoked_at
  FROM public.child_devices d
  WHERE d.id = v_device_id
    AND d.child_id = v_child_id
    AND d.token_hash = p_device_token_hash
  FOR UPDATE;
  IF NOT FOUND OR v_revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'device_revoked');
  END IF;

  UPDATE public.child_devices d
  SET last_seen_at = clock_timestamp()
  WHERE d.id = v_device_id
    AND d.child_id = v_child_id
    AND d.revoked_at IS NULL;

  SELECT t.timezone
  INTO v_timezone
  FROM public.child_reporting_timezones t
  WHERE t.child_id = v_child_id
  ORDER BY t.valid_from DESC
  LIMIT 1;
  IF v_timezone IS NULL THEN
    RETURN jsonb_build_object('status', 'timezone_required');
  END IF;

  v_usage_date := (clock_timestamp() AT TIME ZONE v_timezone)::date;

  SELECT g.daily_limit_minutes
  INTO v_goal_minutes
  FROM public.screen_time_goals g
  WHERE g.child_id = v_child_id
    AND g.effective_from <= v_usage_date
  ORDER BY g.effective_from DESC, g.created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'status', 'ok',
    'display_name', v_display_name,
    'avatar', v_avatar,
    'timezone', v_timezone,
    'usage_date', v_usage_date,
    'goal_minutes', v_goal_minutes
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_android_child_usage_snapshot(
  p_device_token_hash text,
  p_issue_request_hash text,
  p_ticket_key_id text,
  p_ticket_hash text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_profile jsonb;
  v_child_id uuid;
  v_usage_date date;
  v_old_revision integer;
  v_old_request_hash text;
  v_old_state text;
  v_old_accepted_at timestamptz;
  v_old_payload_hash text;
  v_restored_rows bigint;
  v_restore_accepted boolean := false;
  v_result jsonb;
BEGIN
  v_profile := public.get_android_child_device_profile(p_device_token_hash);
  IF v_profile->>'status' IS DISTINCT FROM 'ok' THEN
    RETURN v_profile;
  END IF;

  v_usage_date := (v_profile->>'usage_date')::date;
  SELECT d.child_id
  INTO v_child_id
  FROM public.child_devices d
  WHERE d.token_hash = p_device_token_hash
    AND d.revoked_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'device_revoked', 'usage_date', v_usage_date);
  END IF;

  SELECT u.revision, u.issue_request_hash, u.state,
         u.accepted_at, u.payload_hash
  INTO v_old_revision, v_old_request_hash, v_old_state,
       v_old_accepted_at, v_old_payload_hash
  FROM public.child_device_usage_days u
  WHERE u.child_id = v_child_id
    AND u.usage_date = v_usage_date
    AND u.state = 'accepted'
  FOR UPDATE;

  IF FOUND AND v_old_request_hash IS DISTINCT FROM p_issue_request_hash THEN
    UPDATE public.child_device_usage_days
    SET state = 'replaced',
        accepted_at = NULL,
        payload_hash = NULL
    WHERE child_id = v_child_id
      AND usage_date = v_usage_date
      AND revision = v_old_revision;
    v_restore_accepted := true;
  END IF;

  v_result := public.issue_child_usage_snapshot(
    p_device_token_hash,
    v_usage_date,
    p_issue_request_hash,
    p_ticket_key_id,
    p_ticket_hash
  );

  IF v_restore_accepted THEN
    UPDATE public.child_device_usage_days
    SET state = 'accepted',
        accepted_at = v_old_accepted_at,
        payload_hash = v_old_payload_hash
    WHERE child_id = v_child_id
      AND usage_date = v_usage_date
      AND revision = v_old_revision
      AND state = 'replaced';

    GET DIAGNOSTICS v_restored_rows = ROW_COUNT;
    IF v_restored_rows <> 1 THEN
      RAISE EXCEPTION 'Accepted usage snapshot could not be restored'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN v_result || jsonb_build_object('usage_date', v_usage_date);
END;
$$;

CREATE OR REPLACE FUNCTION public.ingest_android_child_usage_snapshot(
  p_device_token_hash text,
  p_ticket_hash text,
  p_apps jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_profile jsonb;
  v_child_id uuid;
  v_device_id uuid;
  v_usage_date date;
  v_ticket_state text;
  v_old_revision integer;
  v_result jsonb;
BEGIN
  v_profile := public.get_android_child_device_profile(p_device_token_hash);
  IF v_profile->>'status' IS DISTINCT FROM 'ok' THEN
    RETURN v_profile;
  END IF;

  SELECT d.child_id, d.id
  INTO v_child_id, v_device_id
  FROM public.child_devices d
  WHERE d.token_hash = p_device_token_hash
    AND d.revoked_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'device_revoked');
  END IF;

  SELECT u.usage_date, u.state
  INTO v_usage_date, v_ticket_state
  FROM public.child_device_usage_days u
  WHERE u.ticket_hash = p_ticket_hash
    AND u.child_id = v_child_id
    AND u.device_id = v_device_id
  FOR UPDATE;
  IF NOT FOUND OR v_ticket_state NOT IN ('outstanding', 'accepted') THEN
    RETURN public.ingest_child_usage_snapshot(p_device_token_hash, p_ticket_hash, p_apps);
  END IF;

  SELECT u.revision
  INTO v_old_revision
  FROM public.child_device_usage_days u
  WHERE u.child_id = v_child_id
    AND u.usage_date = v_usage_date
    AND u.state = 'accepted'
    AND u.ticket_hash IS DISTINCT FROM p_ticket_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN public.ingest_child_usage_snapshot(p_device_token_hash, p_ticket_hash, p_apps);
  END IF;

  BEGIN
    UPDATE public.child_device_usage_days
    SET state = 'replaced',
        accepted_at = NULL,
        payload_hash = NULL
    WHERE child_id = v_child_id
      AND usage_date = v_usage_date
      AND revision = v_old_revision;

    v_result := public.ingest_child_usage_snapshot(
      p_device_token_hash,
      p_ticket_hash,
      p_apps
    );
    IF v_result->>'status' IS DISTINCT FROM 'accepted' THEN
      RAISE EXCEPTION 'Snapshot was not accepted'
        USING ERRCODE = 'Z0001';
    END IF;
  EXCEPTION
    WHEN SQLSTATE 'Z0001' THEN
      RETURN v_result;
  END;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_parent_android_device_overview(
  p_child_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_active boolean;
  v_timezone text;
  v_usage_date date;
  v_goal_minutes integer;
  v_device_id uuid;
  v_device jsonb;
  v_snapshot_received boolean := false;
  v_last_successful_sync timestamptz;
  v_total_minutes integer := 0;
  v_apps jsonb := '[]'::jsonb;
BEGIN
  IF p_child_id IS NULL THEN
    RAISE EXCEPTION 'A child profile is required'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.authorize_parent_child(p_child_id);

  SELECT cp.is_active
  INTO v_active
  FROM public.child_profiles cp
  WHERE cp.id = p_child_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Child profile not found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT t.timezone
  INTO v_timezone
  FROM public.child_reporting_timezones t
  WHERE t.child_id = p_child_id
  ORDER BY t.valid_from DESC
  LIMIT 1;
  v_timezone := COALESCE(v_timezone, 'UTC');
  v_usage_date := (clock_timestamp() AT TIME ZONE v_timezone)::date;

  SELECT g.daily_limit_minutes
  INTO v_goal_minutes
  FROM public.screen_time_goals g
  WHERE g.child_id = p_child_id
    AND g.effective_from <= v_usage_date
  ORDER BY g.effective_from DESC, g.created_at DESC
  LIMIT 1;

  SELECT d.id,
         jsonb_build_object(
           'device_name', d.device_name,
           'last_seen_at', d.last_seen_at
         )
  INTO v_device_id, v_device
  FROM public.child_devices d
  WHERE d.child_id = p_child_id
    AND d.revoked_at IS NULL
  ORDER BY d.created_at DESC
  LIMIT 1;

  SELECT true,
         u.accepted_at,
         COALESCE(sum(l.duration_minutes), 0)::integer,
         COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'app_name', l.app_name,
               'package_name', l.package_name,
               'category', l.category,
               'duration_minutes', l.duration_minutes
             )
             ORDER BY l.duration_minutes DESC, l.app_name
           ) FILTER (WHERE l.id IS NOT NULL),
           '[]'::jsonb
         )
  INTO v_snapshot_received, v_last_successful_sync, v_total_minutes, v_apps
  FROM public.child_device_usage_days u
  LEFT JOIN public.screen_time_logs l
    ON l.child_id = u.child_id
   AND l.usage_date = u.usage_date
   AND l.device_id = u.device_id
   AND l.source = 'device_import'
  WHERE u.child_id = p_child_id
    AND u.usage_date = v_usage_date
    AND u.device_id = v_device_id
    AND u.state = 'accepted'
  GROUP BY u.accepted_at
  ORDER BY u.accepted_at DESC
  LIMIT 1;

  IF NOT COALESCE(v_snapshot_received, false) THEN
    v_snapshot_received := false;
    v_apps := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'device_connected', v_active IS TRUE AND v_device_id IS NOT NULL,
    'device', v_device,
    'usage_date', v_usage_date,
    'snapshot_received', v_snapshot_received,
    'last_successful_sync', v_last_successful_sync,
    'total_minutes', v_total_minutes,
    'apps', v_apps,
    'goal_minutes', v_goal_minutes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_android_child_device_profile(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_android_child_device_profile(text)
  TO service_role;

REVOKE ALL ON FUNCTION public.issue_android_child_usage_snapshot(text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_android_child_usage_snapshot(text, text, text, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.ingest_android_child_usage_snapshot(text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_android_child_usage_snapshot(text, text, jsonb)
  TO service_role;

REVOKE ALL ON FUNCTION public.get_parent_android_device_overview(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_parent_android_device_overview(uuid)
  TO authenticated;

COMMIT;
