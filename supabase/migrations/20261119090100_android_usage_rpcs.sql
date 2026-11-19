BEGIN;

DO $$
BEGIN
  IF to_regprocedure(
    'public.manage_child(uuid,uuid,uuid,text,text,text,boolean)'
  ) IS NULL THEN
    RAISE EXCEPTION
      'Expected public.manage_child(uuid,uuid,uuid,text,text,text,boolean) from the existing project schema';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.authorize_parent_family(
  p_family_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_membership_id uuid;
BEGIN
  IF v_user_id IS NULL OR p_family_id IS NULL THEN
    RAISE EXCEPTION 'Parent authorization required'
      USING ERRCODE = '42501';
  END IF;

  PERFORM fm.id
  FROM public.family_members fm
  WHERE fm.user_id = v_user_id
    AND fm.family_id = p_family_id
    AND fm.role = 'parent'
  ORDER BY fm.id
  FOR UPDATE;

  SELECT fm.id INTO v_membership_id
  FROM public.family_members fm
  WHERE fm.user_id = v_user_id
    AND fm.family_id = p_family_id
    AND fm.role = 'parent'
  LIMIT 1;

  IF v_membership_id IS NULL THEN
    RAISE EXCEPTION 'Parent does not own this family'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.authorize_parent_child(
  p_child_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_family_id uuid;
  v_current_family_id uuid;
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL OR p_child_id IS NULL THEN
    RAISE EXCEPTION 'Parent authorization required'
      USING ERRCODE = '42501';
  END IF;

  SELECT cp.family_id INTO v_family_id
  FROM public.child_profiles cp
  WHERE cp.id = p_child_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Child profile is unavailable'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.authorize_parent_family(v_family_id);

  SELECT cp.family_id INTO v_current_family_id
  FROM public.child_profiles cp
  WHERE cp.id = p_child_id
  FOR UPDATE;

  IF NOT FOUND OR v_current_family_id IS DISTINCT FROM v_family_id THEN
    RAISE EXCEPTION 'Child ownership changed'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_family_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_child_family_transfer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.family_id IS DISTINCT FROM OLD.family_id THEN
    RAISE EXCEPTION 'Child family transfer is not supported'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER child_profiles_no_family_transfer
BEFORE UPDATE OF family_id ON public.child_profiles
FOR EACH ROW
EXECUTE FUNCTION public.guard_child_family_transfer();

CREATE OR REPLACE FUNCTION public.guard_child_device_pairing_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'pending' AND NEW.status IN ('redeemed', 'cancelled', 'expired'))
    OR
    (OLD.status = 'redeemed' AND NEW.status IN ('activated', 'cancelled', 'expired'))
  ) THEN
    RAISE EXCEPTION 'Illegal pairing state transition'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER child_device_pairings_transition_guard
BEFORE UPDATE OF status ON public.child_device_pairings
FOR EACH ROW
EXECUTE FUNCTION public.guard_child_device_pairing_transition();

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
  ) THEN
    RAISE EXCEPTION 'Illegal usage-day state transition'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER child_device_usage_days_transition_guard
BEFORE UPDATE OF state ON public.child_device_usage_days
FOR EACH ROW
EXECUTE FUNCTION public.guard_child_usage_day_transition();

CREATE OR REPLACE FUNCTION public.close_child_device_usage_state(
  p_child_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM p.id
  FROM public.child_device_pairings p
  WHERE p.child_id = p_child_id
    AND p.status IN ('pending', 'redeemed')
  ORDER BY p.id
  FOR UPDATE;

  UPDATE public.child_device_pairings p
  SET status = 'cancelled'
  WHERE p.child_id = p_child_id
    AND p.status IN ('pending', 'redeemed');

  PERFORM d.id
  FROM public.child_devices d
  WHERE d.child_id = p_child_id
    AND d.revoked_at IS NULL
  ORDER BY d.id
  FOR UPDATE;

  UPDATE public.child_devices d
  SET revoked_at = COALESCE(d.revoked_at, clock_timestamp())
  WHERE d.child_id = p_child_id
    AND d.revoked_at IS NULL;

  PERFORM u.revision
  FROM public.child_device_usage_days u
  WHERE u.child_id = p_child_id
    AND u.state IN ('preparing', 'outstanding')
  ORDER BY u.usage_date, u.revision
  FOR UPDATE;

  UPDATE public.child_device_usage_days u
  SET state = 'revoked'
  WHERE u.child_id = p_child_id
    AND u.state IN ('preparing', 'outstanding');
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_inactive_child_device_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.is_active IS FALSE THEN
    PERFORM public.close_child_device_usage_state(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER child_profiles_close_device_state
AFTER UPDATE OF is_active ON public.child_profiles
FOR EACH ROW
WHEN (NEW.is_active IS FALSE)
EXECUTE FUNCTION public.cleanup_inactive_child_device_state();

CREATE OR REPLACE FUNCTION public.manage_child_authorized(
  p_family uuid,
  p_child uuid,
  p_name text,
  p_avatar text,
  p_pin text,
  p_active boolean
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_current_family uuid;
  v_child_id uuid;
  v_new_child boolean;
BEGIN
  IF v_user_id IS NULL OR p_family IS NULL OR p_child IS NULL THEN
    RAISE EXCEPTION 'Parent authorization required'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.authorize_parent_family(p_family);

  v_new_child := p_child = '00000000-0000-0000-0000-000000000000'::uuid;
  IF v_new_child THEN
    IF EXISTS (
      SELECT 1 FROM public.child_profiles cp
      WHERE cp.id = p_child
    ) THEN
      RAISE EXCEPTION 'Reserved child identifier already exists'
        USING ERRCODE = '23505';
    END IF;
  ELSE
    SELECT cp.family_id INTO v_current_family
    FROM public.child_profiles cp
    WHERE cp.id = p_child
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Child profile is unavailable'
        USING ERRCODE = '42501';
    END IF;

    IF v_current_family IS DISTINCT FROM p_family THEN
      RAISE EXCEPTION 'Child does not belong to this family'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT public.manage_child(
    v_user_id,
    p_family,
    p_child,
    p_name,
    p_avatar,
    p_pin,
    p_active
  ) INTO v_child_id;

  RETURN v_child_id;
END;
$$;

COMMENT ON FUNCTION public.manage_child_authorized(uuid, uuid, text, text, text, boolean) IS
  'Authenticates via auth.uid(), locks parent membership before child, then delegates to the existing manage_child implementation. Deployment requires prior review of that live function definition.';

CREATE OR REPLACE FUNCTION public.set_child_reporting_timezone(
  p_child_id uuid,
  p_timezone text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_active boolean;
  v_current text;
BEGIN
  IF p_timezone IS NULL OR length(p_timezone) > 100
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_timezone_names z WHERE z.name = p_timezone
     ) THEN
    RAISE EXCEPTION 'Invalid IANA timezone'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.authorize_parent_child(p_child_id);

  SELECT cp.is_active INTO v_active
  FROM public.child_profiles cp
  WHERE cp.id = p_child_id;

  IF v_active IS DISTINCT FROM TRUE THEN
    RETURN jsonb_build_object('status', 'child_inactive');
  END IF;

  SELECT t.timezone INTO v_current
  FROM public.child_reporting_timezones t
  WHERE t.child_id = p_child_id
  ORDER BY t.valid_from DESC
  LIMIT 1;

  IF v_current IS DISTINCT FROM p_timezone THEN
    INSERT INTO public.child_reporting_timezones(child_id, timezone)
    VALUES (p_child_id, p_timezone);
  END IF;

  RETURN jsonb_build_object('status', 'ok', 'timezone', p_timezone);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_accepted_child_usage_dates(
  p_child_id uuid,
  p_since date
) RETURNS TABLE (usage_date date)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
BEGIN
  IF p_since IS NULL THEN
    RAISE EXCEPTION 'A lower date bound is required'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.authorize_parent_child(p_child_id);

  RETURN QUERY
  SELECT u.usage_date
  FROM public.child_device_usage_days u
  WHERE u.child_id = p_child_id
    AND u.usage_date >= p_since
    AND u.state = 'accepted'
  ORDER BY u.usage_date;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_child_device_pairing(
  p_child_id uuid,
  p_timezone text,
  p_idempotency_key_hash text,
  p_request_fingerprint text,
  p_pairing_hash text,
  p_pairing_key_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_parent_id uuid := auth.uid();
  v_active boolean;
  v_id uuid;
  v_existing_child uuid;
  v_fingerprint text;
  v_pairing_hash text;
  v_key_id text;
  v_status text;
  v_expires timestamptz;
  v_open_id uuid;
  v_open_expires timestamptz;
  v_reporting_timezone text;
BEGIN
  IF p_idempotency_key_hash IS NULL OR p_idempotency_key_hash !~ '^[0-9a-f]{64}$'
     OR p_request_fingerprint IS NULL OR p_request_fingerprint !~ '^[0-9a-f]{64}$'
     OR p_pairing_hash IS NULL OR p_pairing_hash !~ '^[0-9a-f]{64}$'
     OR p_pairing_key_id IS NULL OR p_pairing_key_id !~ '^[A-Za-z0-9_-]{1,32}$'
     OR p_timezone IS NULL OR length(p_timezone) > 100
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_timezone_names z WHERE z.name = p_timezone
     ) THEN
    RAISE EXCEPTION 'Invalid pairing request'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.authorize_parent_child(p_child_id);

  SELECT cp.is_active INTO v_active
  FROM public.child_profiles cp
  WHERE cp.id = p_child_id;

  IF v_active IS DISTINCT FROM TRUE THEN
    RETURN jsonb_build_object('status', 'child_inactive');
  END IF;

  SELECT t.timezone INTO v_reporting_timezone
  FROM public.child_reporting_timezones t
  WHERE t.child_id = p_child_id
  ORDER BY t.valid_from DESC
  LIMIT 1
  FOR UPDATE;

  IF v_reporting_timezone IS NULL THEN
    INSERT INTO public.child_reporting_timezones(child_id, timezone)
    VALUES (p_child_id, p_timezone)
    RETURNING timezone INTO v_reporting_timezone;
  END IF;

  SELECT p.id, p.child_id, p.request_fingerprint, p.pairing_hash,
         p.pairing_key_id, p.status, p.expires_at
  INTO v_id, v_existing_child, v_fingerprint, v_pairing_hash,
       v_key_id, v_status, v_expires
  FROM public.child_device_pairings p
  WHERE p.created_by = v_parent_id
    AND p.idempotency_key_hash = p_idempotency_key_hash
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing_child IS DISTINCT FROM p_child_id
       OR v_fingerprint IS DISTINCT FROM p_request_fingerprint
       OR v_pairing_hash IS DISTINCT FROM p_pairing_hash
       OR v_key_id IS DISTINCT FROM p_pairing_key_id THEN
      RETURN jsonb_build_object('status', 'idempotency_conflict');
    END IF;

    IF v_status IN ('pending', 'redeemed') AND v_expires <= clock_timestamp() THEN
      UPDATE public.child_device_pairings
      SET status = 'expired'
      WHERE id = v_id;
      RETURN jsonb_build_object('status', 'pairing_expired');
    END IF;

    IF v_status IN ('pending', 'redeemed', 'activated') THEN
      RETURN jsonb_build_object('status', 'ok', 'pairing_id', v_id,
                                'expires_at', v_expires, 'key_id', v_key_id,
                                'reporting_timezone', v_reporting_timezone, 'retry', true);
    END IF;

    RETURN jsonb_build_object('status', 'pairing_unavailable');
  END IF;

  SELECT p.id, p.expires_at
  INTO v_open_id, v_open_expires
  FROM public.child_device_pairings p
  WHERE p.child_id = p_child_id
    AND p.status IN ('pending', 'redeemed')
  ORDER BY p.id
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_open_expires <= clock_timestamp() THEN
      UPDATE public.child_device_pairings
      SET status = 'expired'
      WHERE id = v_open_id;
    ELSE
      RETURN jsonb_build_object(
        'status', 'pairing_open',
        'expires_at', v_open_expires
      );
    END IF;
  END IF;

  v_expires := clock_timestamp() + interval '10 minutes';
  INSERT INTO public.child_device_pairings(
    child_id, created_by, idempotency_key_hash, request_fingerprint,
    pairing_hash, pairing_key_id, status, expires_at
  ) VALUES (
    p_child_id, v_parent_id, p_idempotency_key_hash, p_request_fingerprint,
    p_pairing_hash, p_pairing_key_id, 'pending', v_expires
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('status', 'ok', 'pairing_id', v_id,
                            'expires_at', v_expires, 'key_id', p_pairing_key_id,
                            'reporting_timezone', v_reporting_timezone, 'retry', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_child_device_pairing_status(
  p_child_id uuid,
  p_pairing_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_parent_id uuid := auth.uid();
  v_status text;
  v_expires timestamptz;
  v_device_name text;
  v_activated_at timestamptz;
BEGIN
  IF v_parent_id IS NULL OR p_child_id IS NULL OR p_pairing_id IS NULL THEN
    RAISE EXCEPTION 'Parent authorization required'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.authorize_parent_child(p_child_id);

  SELECT p.status, p.expires_at, p.device_name, p.activated_at
  INTO v_status, v_expires, v_device_name, v_activated_at
  FROM public.child_device_pairings p
  WHERE p.id = p_pairing_id
    AND p.child_id = p_child_id
    AND p.created_by = v_parent_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pairing is unavailable'
      USING ERRCODE = '42501';
  END IF;

  IF v_status IN ('pending', 'redeemed') AND v_expires <= clock_timestamp() THEN
    v_status := 'expired';
  END IF;

  RETURN jsonb_build_object(
    'status', v_status,
    'expires_at', v_expires,
    'device_name', CASE WHEN v_status = 'activated' THEN v_device_name ELSE NULL END,
    'activated_at', v_activated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_child_device_pairing(
  p_pairing_hash text,
  p_pending_token_hash text,
  p_credential_key_id text,
  p_device_name text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_child_id uuid;
  v_active boolean;
  v_pairing_id uuid;
  v_status text;
  v_expires timestamptz;
  v_pending_hash text;
  v_key_id text;
BEGIN
  IF p_pairing_hash IS NULL OR p_pairing_hash !~ '^[0-9a-f]{64}$'
     OR p_pending_token_hash IS NULL OR p_pending_token_hash !~ '^[0-9a-f]{64}$'
     OR p_credential_key_id IS NULL OR p_credential_key_id !~ '^[A-Za-z0-9_-]{1,32}$'
     OR p_device_name IS NULL OR length(btrim(p_device_name)) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Invalid redemption request'
      USING ERRCODE = '22023';
  END IF;

  SELECT p.child_id INTO v_child_id
  FROM public.child_device_pairings p
  WHERE p.pairing_hash = p_pairing_hash;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'invalid_pairing');
  END IF;

  SELECT cp.is_active INTO v_active
  FROM public.child_profiles cp
  WHERE cp.id = v_child_id
  FOR UPDATE;
  IF NOT FOUND OR v_active IS DISTINCT FROM TRUE THEN
    RETURN jsonb_build_object('status', 'child_inactive');
  END IF;

  SELECT p.id, p.status, p.expires_at, p.pending_token_hash, p.credential_key_id
  INTO v_pairing_id, v_status, v_expires, v_pending_hash, v_key_id
  FROM public.child_device_pairings p
  WHERE p.pairing_hash = p_pairing_hash
    AND p.child_id = v_child_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'invalid_pairing');
  END IF;

  IF v_status = 'redeemed'
     AND v_pending_hash = p_pending_token_hash
     AND v_key_id = p_credential_key_id THEN
    RETURN jsonb_build_object('status', 'ok', 'pairing_id', v_pairing_id, 'retry', true);
  END IF;

  IF v_status <> 'pending' THEN
    RETURN jsonb_build_object('status', 'pairing_unavailable');
  END IF;

  IF v_expires <= clock_timestamp() THEN
    UPDATE public.child_device_pairings
    SET status = 'expired'
    WHERE id = v_pairing_id;
    RETURN jsonb_build_object('status', 'pairing_expired');
  END IF;

  UPDATE public.child_device_pairings
  SET status = 'redeemed',
      pending_token_hash = p_pending_token_hash,
      credential_key_id = p_credential_key_id,
      device_name = btrim(p_device_name),
      redeemed_at = clock_timestamp()
  WHERE id = v_pairing_id;

  RETURN jsonb_build_object('status', 'ok', 'pairing_id', v_pairing_id, 'retry', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_child_device_pairing(
  p_pending_token_hash text,
  p_device_token_hash text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_child_id uuid;
  v_child_found boolean;
  v_active boolean;
  v_pairing_id uuid;
  v_pairing_found boolean;
  v_status text;
  v_expires timestamptz;
  v_device_name text;
  v_existing_device uuid;
  v_new_device uuid;
BEGIN
  IF p_pending_token_hash IS NULL OR p_pending_token_hash !~ '^[0-9a-f]{64}$'
     OR p_device_token_hash IS NULL OR p_device_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid activation request'
      USING ERRCODE = '22023';
  END IF;

  SELECT p.child_id INTO v_child_id
  FROM public.child_device_pairings p
  WHERE p.pending_token_hash = p_pending_token_hash;
  v_child_found := FOUND;
  IF NOT v_child_found THEN
    RETURN jsonb_build_object('status', 'invalid_pending_credential');
  END IF;

  SELECT cp.is_active INTO v_active
  FROM public.child_profiles cp
  WHERE cp.id = v_child_id
  FOR UPDATE;
  v_child_found := FOUND;

  SELECT p.id, p.status, p.expires_at, p.device_name
  INTO v_pairing_id, v_status, v_expires, v_device_name
  FROM public.child_device_pairings p
  WHERE p.pending_token_hash = p_pending_token_hash
    AND p.child_id = v_child_id
  FOR UPDATE;
  v_pairing_found := FOUND;

  IF NOT v_pairing_found THEN
    RETURN jsonb_build_object('status', 'invalid_pending_credential');
  END IF;

  IF NOT v_child_found OR v_active IS DISTINCT FROM TRUE THEN
    IF v_status = 'redeemed' THEN
      UPDATE public.child_device_pairings
      SET status = 'cancelled'
      WHERE id = v_pairing_id;
    END IF;
    RETURN jsonb_build_object('status', 'child_inactive');
  END IF;

  IF v_status = 'activated' THEN
    SELECT d.id INTO v_existing_device
    FROM public.child_devices d
    WHERE d.pairing_id = v_pairing_id
      AND d.child_id = v_child_id
      AND d.token_hash = p_device_token_hash
      AND d.revoked_at IS NULL;
    IF FOUND THEN
      RETURN jsonb_build_object('status', 'ok', 'device_id', v_existing_device, 'retry', true);
    END IF;
    RETURN jsonb_build_object('status', 'device_revoked');
  END IF;

  IF v_status <> 'redeemed' THEN
    RETURN jsonb_build_object('status', 'pairing_unavailable');
  END IF;

  IF v_expires <= clock_timestamp() THEN
    UPDATE public.child_device_pairings
    SET status = 'expired'
    WHERE id = v_pairing_id;
    RETURN jsonb_build_object('status', 'pairing_expired');
  END IF;

  PERFORM d.id
  FROM public.child_devices d
  WHERE d.child_id = v_child_id
    AND d.revoked_at IS NULL
  ORDER BY d.id
  FOR UPDATE;

  PERFORM u.revision
  FROM public.child_device_usage_days u
  WHERE u.child_id = v_child_id
    AND u.state IN ('preparing', 'outstanding')
  ORDER BY u.usage_date, u.revision
  FOR UPDATE;

  UPDATE public.child_devices d
  SET revoked_at = clock_timestamp()
  WHERE d.child_id = v_child_id
    AND d.revoked_at IS NULL;

  UPDATE public.child_device_usage_days u
  SET state = 'replaced'
  WHERE u.child_id = v_child_id
    AND u.state IN ('preparing', 'outstanding');

  INSERT INTO public.child_devices(
    child_id, device_name, token_hash, pairing_id
  ) VALUES (
    v_child_id, v_device_name, p_device_token_hash, v_pairing_id
  )
  RETURNING id INTO v_new_device;

  UPDATE public.child_device_pairings
  SET status = 'activated',
      device_id = v_new_device,
      activated_at = clock_timestamp()
  WHERE id = v_pairing_id;

  RETURN jsonb_build_object('status', 'ok', 'device_id', v_new_device, 'retry', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_child_device(
  p_child_id uuid,
  p_device_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_found boolean;
BEGIN
  PERFORM public.authorize_parent_child(p_child_id);

  PERFORM p.id
  FROM public.child_device_pairings p
  WHERE p.child_id = p_child_id
    AND (
      p.device_id = p_device_id
      OR EXISTS (
        SELECT 1
        FROM public.child_devices d
        WHERE d.id = p_device_id
          AND d.child_id = p_child_id
          AND d.pairing_id = p.id
      )
    )
  ORDER BY p.id
  FOR UPDATE;

  PERFORM d.id
  FROM public.child_devices d
  WHERE d.id = p_device_id
    AND d.child_id = p_child_id
  FOR UPDATE;
  v_found := FOUND;
  IF NOT v_found THEN
    RETURN jsonb_build_object('status', 'device_not_found');
  END IF;

  PERFORM u.revision
  FROM public.child_device_usage_days u
  WHERE u.device_id = p_device_id
    AND u.state IN ('preparing', 'outstanding')
  ORDER BY u.usage_date, u.revision
  FOR UPDATE;

  UPDATE public.child_devices d
  SET revoked_at = COALESCE(d.revoked_at, clock_timestamp())
  WHERE d.id = p_device_id
    AND d.child_id = p_child_id;

  UPDATE public.child_device_usage_days u
  SET state = 'revoked'
  WHERE u.device_id = p_device_id
    AND u.state IN ('preparing', 'outstanding');

  RETURN jsonb_build_object('status', 'ok');
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_child_usage_snapshot(
  p_device_token_hash text,
  p_usage_date date,
  p_issue_request_hash text,
  p_ticket_key_id text,
  p_ticket_hash text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_child_id uuid;
  v_device_id uuid;
  v_active boolean;
  v_timezone text;
  v_today date;
  v_revision integer;
  v_state text;
  v_request_hash text;
  v_ticket_hash text;
  v_key_id text;
  v_prepare_expires timestamptz;
  v_ticket_expires timestamptz;
BEGIN
  IF p_device_token_hash IS NULL OR p_device_token_hash !~ '^[0-9a-f]{64}$'
     OR p_usage_date IS NULL
     OR p_issue_request_hash IS NULL OR p_issue_request_hash !~ '^[0-9a-f]{64}$'
     OR p_ticket_key_id IS NULL OR p_ticket_key_id !~ '^[A-Za-z0-9_-]{1,32}$'
     OR (p_ticket_hash IS NOT NULL AND p_ticket_hash !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'Invalid ticket request'
      USING ERRCODE = '22023';
  END IF;

  SELECT d.child_id, d.id INTO v_child_id, v_device_id
  FROM public.child_devices d
  WHERE d.token_hash = p_device_token_hash;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'invalid_device');
  END IF;

  SELECT cp.is_active INTO v_active
  FROM public.child_profiles cp
  WHERE cp.id = v_child_id
  FOR UPDATE;
  IF NOT FOUND OR v_active IS DISTINCT FROM TRUE THEN
    RETURN jsonb_build_object('status', 'child_inactive');
  END IF;

  PERFORM d.id
  FROM public.child_devices d
  WHERE d.id = v_device_id
    AND d.child_id = v_child_id
    AND d.token_hash = p_device_token_hash
    AND d.revoked_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'device_revoked');
  END IF;

  SELECT t.timezone INTO v_timezone
  FROM public.child_reporting_timezones t
  WHERE t.child_id = v_child_id
  ORDER BY t.valid_from DESC
  LIMIT 1;
  IF v_timezone IS NULL THEN
    RETURN jsonb_build_object('status', 'timezone_required');
  END IF;
  v_today := (clock_timestamp() AT TIME ZONE v_timezone)::date;

  SELECT u.revision, u.state, u.issue_request_hash, u.ticket_hash,
         u.ticket_key_id, u.prepare_expires_at, u.ticket_expires_at
  INTO v_revision, v_state, v_request_hash, v_ticket_hash,
       v_key_id, v_prepare_expires, v_ticket_expires
  FROM public.child_device_usage_days u
  WHERE u.child_id = v_child_id
    AND u.usage_date = p_usage_date
    AND u.device_id = v_device_id
    AND u.issue_request_hash = p_issue_request_hash
  FOR UPDATE;

  IF FOUND THEN
    IF v_state = 'preparing' AND v_prepare_expires <= clock_timestamp() THEN
      UPDATE public.child_device_usage_days
      SET state = 'expired'
      WHERE child_id = v_child_id AND usage_date = p_usage_date AND revision = v_revision;
      RETURN jsonb_build_object('status', 'ticket_issue_expired');
    END IF;

    IF v_state = 'preparing' THEN
      IF p_ticket_hash IS NULL THEN
        IF p_ticket_key_id IS DISTINCT FROM v_key_id THEN
          RETURN jsonb_build_object('status', 'ticket_key_conflict');
        END IF;
        RETURN jsonb_build_object('status', 'preparing', 'revision', v_revision,
                                  'expires_at', v_prepare_expires, 'key_id', v_key_id);
      END IF;
      IF p_ticket_key_id IS DISTINCT FROM v_key_id THEN
        RETURN jsonb_build_object('status', 'ticket_key_conflict');
      END IF;
      v_ticket_expires := clock_timestamp() + interval '30 days';
      UPDATE public.child_device_usage_days
      SET state = 'outstanding',
          ticket_hash = p_ticket_hash,
          ticket_expires_at = v_ticket_expires
      WHERE child_id = v_child_id AND usage_date = p_usage_date AND revision = v_revision;
      RETURN jsonb_build_object('status', 'outstanding', 'revision', v_revision,
                                'expires_at', v_ticket_expires,
                                'key_id', v_key_id);
    END IF;

    IF v_state = 'outstanding' THEN
      IF v_ticket_expires <= clock_timestamp() THEN
        UPDATE public.child_device_usage_days
        SET state = 'expired'
        WHERE child_id = v_child_id
          AND usage_date = p_usage_date
          AND revision = v_revision;
        RETURN jsonb_build_object('status', 'ticket_expired');
      END IF;
      IF p_ticket_hash IS NOT NULL AND p_ticket_hash <> v_ticket_hash THEN
        RETURN jsonb_build_object('status', 'ticket_conflict');
      END IF;
      IF p_ticket_key_id IS DISTINCT FROM v_key_id THEN
        RETURN jsonb_build_object('status', 'ticket_key_conflict');
      END IF;
      RETURN jsonb_build_object('status', 'outstanding', 'revision', v_revision,
                                'expires_at', v_ticket_expires, 'key_id', v_key_id);
    END IF;

    IF v_state = 'accepted' THEN
      RETURN jsonb_build_object('status', 'already_accepted');
    END IF;

    RETURN jsonb_build_object('status', 'ticket_issue_expired');
  END IF;

  IF p_ticket_hash IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'ticket_not_prepared');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.child_device_usage_days u
    WHERE u.child_id = v_child_id
      AND u.usage_date = p_usage_date
      AND u.state = 'accepted'
  ) THEN
    RETURN jsonb_build_object('status', 'already_accepted');
  END IF;

  SELECT u.revision, u.state, u.issue_request_hash, u.ticket_hash,
         u.ticket_key_id, u.prepare_expires_at, u.ticket_expires_at
  INTO v_revision, v_state, v_request_hash, v_ticket_hash,
       v_key_id, v_prepare_expires, v_ticket_expires
  FROM public.child_device_usage_days u
  WHERE u.child_id = v_child_id
    AND u.usage_date = p_usage_date
    AND u.state IN ('preparing', 'outstanding')
  ORDER BY u.revision DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_state = 'preparing' AND v_prepare_expires <= clock_timestamp() THEN
      UPDATE public.child_device_usage_days
      SET state = 'expired'
      WHERE child_id = v_child_id AND usage_date = p_usage_date AND revision = v_revision;
    ELSE
      IF v_state = 'preparing' THEN
        IF p_ticket_key_id IS DISTINCT FROM v_key_id THEN
          RETURN jsonb_build_object('status', 'ticket_key_conflict');
        END IF;
        IF p_ticket_hash IS NOT NULL THEN
          RETURN jsonb_build_object('status', 'ticket_preparing', 'revision', v_revision,
                                    'expires_at', v_prepare_expires, 'key_id', v_key_id);
        END IF;
        RETURN jsonb_build_object('status', 'ticket_preparing', 'revision', v_revision,
                                  'expires_at', v_prepare_expires, 'key_id', v_key_id);
      END IF;
      IF p_ticket_key_id IS DISTINCT FROM v_key_id THEN
        RETURN jsonb_build_object('status', 'ticket_key_conflict');
      END IF;
      IF p_ticket_hash IS NOT NULL AND p_ticket_hash <> v_ticket_hash THEN
        RETURN jsonb_build_object('status', 'ticket_conflict');
      END IF;
      IF v_ticket_expires <= clock_timestamp() THEN
        UPDATE public.child_device_usage_days
        SET state = 'expired'
        WHERE child_id = v_child_id
          AND usage_date = p_usage_date
          AND revision = v_revision;
      ELSE
        RETURN jsonb_build_object('status', 'outstanding', 'revision', v_revision,
                                  'expires_at', v_ticket_expires, 'key_id', v_key_id);
      END IF;
    END IF;
  END IF;

  IF p_usage_date NOT IN (v_today, v_today - 1) THEN
    RETURN jsonb_build_object('status', 'collection_window_closed');
  END IF;

  SELECT COALESCE(max(u.revision), 0) + 1
  INTO v_revision
  FROM public.child_device_usage_days u
  WHERE u.child_id = v_child_id AND u.usage_date = p_usage_date;

  v_prepare_expires := clock_timestamp() + interval '2 minutes';
  INSERT INTO public.child_device_usage_days(
    child_id, usage_date, revision, device_id, state, issue_request_hash,
    ticket_key_id, prepare_expires_at, reporting_timezone
  ) VALUES (
    v_child_id, p_usage_date, v_revision, v_device_id, 'preparing',
    p_issue_request_hash, p_ticket_key_id, v_prepare_expires, v_timezone
  );

  RETURN jsonb_build_object('status', 'preparing', 'revision', v_revision,
                            'expires_at', v_prepare_expires, 'key_id', p_ticket_key_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.ingest_child_usage_snapshot(
  p_device_token_hash text,
  p_ticket_hash text,
  p_apps jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_child_id uuid;
  v_device_id uuid;
  v_ticket_child uuid;
  v_date date;
  v_revision integer;
  v_state text;
  v_ticket_expires timestamptz;
  v_old_hash text;
  v_payload_hash text;
  v_app jsonb;
  v_package text;
  v_name text;
  v_category text;
  v_minutes integer;
  v_total integer := 0;
  v_active boolean;
  v_revoked_at timestamptz;
BEGIN
  IF p_device_token_hash IS NULL OR p_device_token_hash !~ '^[0-9a-f]{64}$'
     OR p_ticket_hash IS NULL OR p_ticket_hash !~ '^[0-9a-f]{64}$'
     OR p_apps IS NULL OR jsonb_typeof(p_apps) IS DISTINCT FROM 'array'
     OR octet_length(convert_to(p_apps::text, 'UTF8')) > 65536
     OR jsonb_array_length(p_apps) > 200 THEN
    RAISE EXCEPTION 'Invalid snapshot payload'
      USING ERRCODE = '22023';
  END IF;

  FOR v_app IN SELECT e.value FROM jsonb_array_elements(p_apps) AS e(value)
  LOOP
    IF jsonb_typeof(v_app) IS DISTINCT FROM 'object'
       OR (SELECT count(*) FROM jsonb_object_keys(v_app)) <> 4
       OR NOT (v_app ?& ARRAY['package', 'app_name', 'category', 'duration_minutes'])
       OR jsonb_typeof(v_app->'package') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_app->'app_name') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_app->'category') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_app->'duration_minutes') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Invalid app object'
        USING ERRCODE = '22023';
    END IF;

    v_package := v_app->>'package';
    v_name := v_app->>'app_name';
    v_category := v_app->>'category';

    IF length(v_package) NOT BETWEEN 1 AND 255
       OR v_package !~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
       OR length(v_name) NOT BETWEEN 1 AND 60
       OR v_name <> btrim(v_name)
       OR v_name ~ '[[:cntrl:]]'
       OR v_category NOT IN ('Learning', 'Videos', 'Games', 'Other')
       OR (v_app->>'duration_minutes') !~ '^[1-9][0-9]*$'
       OR (v_app->>'duration_minutes')::numeric > 1440 THEN
      RAISE EXCEPTION 'App field outside allowed range'
        USING ERRCODE = '22023';
    END IF;

    v_minutes := (v_app->>'duration_minutes')::integer;
    v_total := v_total + v_minutes;
  END LOOP;

  IF v_total > 1440 THEN
    RAISE EXCEPTION 'Daily usage exceeds 1440 minutes'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_apps) AS e(value)
    GROUP BY e.value->>'package'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate package in snapshot'
      USING ERRCODE = '22023';
  END IF;

  v_payload_hash := encode(
    extensions.digest(convert_to(p_apps::text, 'UTF8'), 'sha256'),
    'hex'
  );

  SELECT d.child_id, d.id INTO v_child_id, v_device_id
  FROM public.child_devices d
  WHERE d.token_hash = p_device_token_hash;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'invalid_device');
  END IF;

  SELECT u.child_id, u.usage_date INTO v_ticket_child, v_date
  FROM public.child_device_usage_days u
  WHERE u.ticket_hash = p_ticket_hash;
  IF NOT FOUND OR v_ticket_child IS DISTINCT FROM v_child_id THEN
    RETURN jsonb_build_object('status', 'invalid_ticket');
  END IF;

  SELECT cp.is_active INTO v_active
  FROM public.child_profiles cp
  WHERE cp.id = v_child_id
  FOR UPDATE;
  IF NOT FOUND OR v_active IS DISTINCT FROM TRUE THEN
    RETURN jsonb_build_object('status', 'child_inactive');
  END IF;

  SELECT d.revoked_at INTO v_revoked_at
  FROM public.child_devices d
  WHERE d.id = v_device_id
    AND d.child_id = v_child_id
    AND d.token_hash = p_device_token_hash
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'invalid_device');
  END IF;
  IF v_revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'device_revoked');
  END IF;

  SELECT u.revision, u.state, u.ticket_expires_at, u.payload_hash
  INTO v_revision, v_state, v_ticket_expires, v_old_hash
  FROM public.child_device_usage_days u
  WHERE u.child_id = v_child_id
    AND u.usage_date = v_date
    AND u.device_id = v_device_id
    AND u.ticket_hash = p_ticket_hash
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'invalid_ticket');
  END IF;

  IF v_state = 'accepted' THEN
    IF v_old_hash = v_payload_hash THEN
      RETURN jsonb_build_object('status', 'accepted', 'revision', v_revision, 'retry', true);
    END IF;
    RETURN jsonb_build_object('status', 'payload_conflict');
  END IF;

  IF v_state = 'replaced' THEN
    RETURN jsonb_build_object('status', 'ticket_replaced');
  ELSIF v_state = 'revoked' THEN
    RETURN jsonb_build_object('status', 'device_revoked');
  ELSIF v_state = 'expired'
     OR (v_state IN ('preparing', 'outstanding')
         AND v_ticket_expires IS NOT NULL
         AND v_ticket_expires <= clock_timestamp()) THEN
    IF v_state IN ('preparing', 'outstanding') THEN
      UPDATE public.child_device_usage_days
      SET state = 'expired'
      WHERE child_id = v_child_id AND usage_date = v_date AND revision = v_revision;
    END IF;
    RETURN jsonb_build_object('status', 'ticket_expired');
  ELSIF v_state <> 'outstanding' THEN
    RETURN jsonb_build_object('status', 'ticket_not_ready');
  END IF;

  PERFORM l.id
  FROM public.screen_time_logs l
  WHERE l.child_id = v_child_id
    AND l.usage_date = v_date
    AND l.source = 'device_import'
    AND l.device_id IS NOT NULL
  ORDER BY l.id
  FOR UPDATE;

  DELETE FROM public.screen_time_logs l
  WHERE l.child_id = v_child_id
    AND l.usage_date = v_date
    AND l.source = 'device_import'
    AND l.device_id IS NOT NULL;

  INSERT INTO public.screen_time_logs(
    child_id, usage_date, app_name, category, duration_minutes,
    source, notes, device_id, package_name
  )
  SELECT v_child_id, v_date, e.value->>'app_name', e.value->>'category',
         (e.value->>'duration_minutes')::integer, 'device_import', NULL,
         v_device_id, e.value->>'package'
  FROM jsonb_array_elements(p_apps) AS e(value);

  UPDATE public.child_device_usage_days
  SET state = 'accepted',
      accepted_at = clock_timestamp(),
      payload_hash = v_payload_hash
  WHERE child_id = v_child_id
    AND usage_date = v_date
    AND revision = v_revision;

  RETURN jsonb_build_object('status', 'accepted', 'revision', v_revision, 'retry', false);
END;
$$;

REVOKE ALL ON FUNCTION public.authorize_parent_family(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.authorize_parent_child(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_child_family_transfer()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_child_device_pairing_transition()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_child_usage_day_transition()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.close_child_device_usage_state(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_inactive_child_device_state()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.manage_child_authorized(uuid, uuid, text, text, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_child_authorized(uuid, uuid, text, text, text, boolean)
  TO authenticated;

REVOKE ALL ON FUNCTION public.set_child_reporting_timezone(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_child_reporting_timezone(uuid, text)
  TO authenticated;

REVOKE ALL ON FUNCTION public.get_accepted_child_usage_dates(uuid, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_accepted_child_usage_dates(uuid, date)
  TO authenticated;

REVOKE ALL ON FUNCTION public.create_child_device_pairing(uuid, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_child_device_pairing(uuid, text, text, text, text, text)
  TO authenticated;

REVOKE ALL ON FUNCTION public.get_child_device_pairing_status(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_child_device_pairing_status(uuid, uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.redeem_child_device_pairing(text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_child_device_pairing(text, text, text, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.activate_child_device_pairing(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_child_device_pairing(text, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.revoke_child_device(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_child_device(uuid, uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.issue_child_usage_snapshot(text, date, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_child_usage_snapshot(text, date, text, text, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.ingest_child_usage_snapshot(text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_child_usage_snapshot(text, text, jsonb)
  TO service_role;

COMMIT;
