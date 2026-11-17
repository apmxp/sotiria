CREATE OR REPLACE FUNCTION public.record_daily_screen_total(
  p_id uuid,
  p_child_id uuid,
  p_usage_date date,
  p_minutes integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, extensions
SET datestyle = 'ISO, YMD'
AS $function$
DECLARE
  v_expected_id uuid;
BEGIN
  IF p_minutes IS NULL OR p_minutes < 0 OR p_minutes > 1440 THEN
    RAISE EXCEPTION 'Invalid daily screen-time minutes'
      USING ERRCODE = '22023';
  END IF;

  v_expected_id := extensions.uuid_generate_v5(
    'bd2f9761-59e2-56d3-b9c2-2e3f0a608a5b'::uuid,
    lower(p_child_id::text) || ':' || p_usage_date::text
  );
  IF p_id IS DISTINCT FROM v_expected_id THEN
    RAISE EXCEPTION 'Invalid daily-total identifier'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.screen_time_logs AS existing (
    id,
    child_id,
    usage_date,
    category,
    duration_minutes,
    app_name,
    notes,
    source
  )
  VALUES (
    p_id,
    p_child_id,
    p_usage_date,
    'Other',
    GREATEST(1, p_minutes),
    NULL,
    'sotiria:daily-total:' || p_minutes::text,
    'manual'
  )
  ON CONFLICT (id) DO UPDATE
  SET duration_minutes = EXCLUDED.duration_minutes,
      notes = EXCLUDED.notes
  WHERE existing.child_id = EXCLUDED.child_id
    AND existing.usage_date = EXCLUDED.usage_date
    AND existing.notes LIKE 'sotiria:daily-total:%';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Daily-total identifier is already in use'
      USING ERRCODE = '23505';
  END IF;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_daily_screen_total(uuid, uuid, date, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_daily_screen_total(uuid, uuid, date, integer)
  TO service_role;
