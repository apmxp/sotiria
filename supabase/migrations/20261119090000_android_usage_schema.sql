BEGIN;

LOCK TABLE public.child_devices IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.child_devices
    GROUP BY token_hash
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot add child_devices token hash uniqueness: duplicate hashes exist';
  END IF;
END;
$$;

ALTER TABLE public.child_devices
  ADD COLUMN pairing_id uuid;

ALTER TABLE public.child_devices
  ADD CONSTRAINT child_devices_id_child_id_key UNIQUE (id, child_id);

CREATE UNIQUE INDEX child_devices_token_hash_key
  ON public.child_devices (token_hash);

CREATE TABLE public.child_reporting_timezones (
  child_id uuid NOT NULL
    REFERENCES public.child_profiles(id)
    ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED,
  valid_from timestamptz NOT NULL DEFAULT clock_timestamp(),
  timezone text NOT NULL,
  PRIMARY KEY (child_id, valid_from)
);

CREATE TABLE public.child_device_pairings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL
    REFERENCES public.child_profiles(id)
    ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED,
  created_by uuid NOT NULL,
  idempotency_key_hash text NOT NULL
    CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  request_fingerprint text NOT NULL
    CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  pairing_hash text NOT NULL
    CHECK (pairing_hash ~ '^[0-9a-f]{64}$'),
  pairing_key_id text NOT NULL
    CHECK (pairing_key_id ~ '^[A-Za-z0-9_-]{1,32}$'),
  pending_token_hash text
    CHECK (pending_token_hash IS NULL OR pending_token_hash ~ '^[0-9a-f]{64}$'),
  credential_key_id text
    CHECK (credential_key_id IS NULL OR credential_key_id ~ '^[A-Za-z0-9_-]{1,32}$'),
  device_name text
    CHECK (device_name IS NULL OR length(btrim(device_name)) BETWEEN 1 AND 80),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'redeemed', 'activated', 'cancelled', 'expired')),
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  activated_at timestamptz,
  device_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT child_device_pairings_parent_idempotency_key
    UNIQUE (created_by, idempotency_key_hash),
  CONSTRAINT child_device_pairings_status_fields_check CHECK (
    (status = 'pending'
      AND pending_token_hash IS NULL
      AND credential_key_id IS NULL
      AND redeemed_at IS NULL
      AND activated_at IS NULL
      AND device_id IS NULL)
    OR
    (status = 'redeemed'
      AND pending_token_hash IS NOT NULL
      AND credential_key_id IS NOT NULL
      AND redeemed_at IS NOT NULL
      AND activated_at IS NULL
      AND device_id IS NULL)
    OR
    (status = 'activated'
      AND pending_token_hash IS NOT NULL
      AND credential_key_id IS NOT NULL
      AND redeemed_at IS NOT NULL
      AND activated_at IS NOT NULL
      AND device_id IS NOT NULL)
    OR
    (status IN ('cancelled', 'expired')
      AND activated_at IS NULL
      AND device_id IS NULL)
  )
);

CREATE UNIQUE INDEX child_device_pairings_pairing_hash_key
  ON public.child_device_pairings (pairing_hash);

CREATE UNIQUE INDEX child_device_pairings_pending_token_hash_key
  ON public.child_device_pairings (pending_token_hash)
  WHERE pending_token_hash IS NOT NULL;

CREATE UNIQUE INDEX child_device_pairings_one_open_per_child
  ON public.child_device_pairings (child_id)
  WHERE status IN ('pending', 'redeemed');

CREATE TABLE public.child_device_usage_days (
  child_id uuid NOT NULL
    REFERENCES public.child_profiles(id)
    ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED,
  usage_date date NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  device_id uuid NOT NULL,
  state text NOT NULL
    CHECK (state IN ('preparing', 'outstanding', 'accepted', 'expired', 'replaced', 'revoked')),
  issue_request_hash text NOT NULL
    CHECK (issue_request_hash ~ '^[0-9a-f]{64}$'),
  ticket_key_id text NOT NULL
    CHECK (ticket_key_id ~ '^[A-Za-z0-9_-]{1,32}$'),
  prepare_expires_at timestamptz NOT NULL,
  ticket_hash text
    CHECK (ticket_hash IS NULL OR ticket_hash ~ '^[0-9a-f]{64}$'),
  ticket_expires_at timestamptz,
  reporting_timezone text NOT NULL,
  accepted_at timestamptz,
  payload_hash text
    CHECK (payload_hash IS NULL OR payload_hash ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (child_id, usage_date, revision),
  CONSTRAINT child_device_usage_days_state_fields_check CHECK (
    (state = 'preparing'
      AND ticket_hash IS NULL
      AND ticket_expires_at IS NULL
      AND accepted_at IS NULL
      AND payload_hash IS NULL)
    OR
    (state = 'outstanding'
      AND ticket_hash IS NOT NULL
      AND ticket_expires_at IS NOT NULL
      AND accepted_at IS NULL
      AND payload_hash IS NULL)
    OR
    (state = 'accepted'
      AND ticket_hash IS NOT NULL
      AND ticket_expires_at IS NOT NULL
      AND accepted_at IS NOT NULL
      AND payload_hash IS NOT NULL)
    OR
    (state IN ('expired', 'replaced', 'revoked')
      AND accepted_at IS NULL
      AND payload_hash IS NULL)
  )
);

CREATE UNIQUE INDEX child_device_usage_days_ticket_hash_key
  ON public.child_device_usage_days (ticket_hash)
  WHERE ticket_hash IS NOT NULL;

CREATE UNIQUE INDEX child_device_usage_days_one_open_ticket
  ON public.child_device_usage_days (child_id, usage_date)
  WHERE state IN ('preparing', 'outstanding');

CREATE UNIQUE INDEX child_device_usage_days_one_accepted_snapshot
  ON public.child_device_usage_days (child_id, usage_date)
  WHERE state = 'accepted';

CREATE UNIQUE INDEX child_device_usage_days_issue_request_key
  ON public.child_device_usage_days (child_id, usage_date, device_id, issue_request_hash);

CREATE INDEX child_device_usage_days_device_state
  ON public.child_device_usage_days (device_id, state, usage_date);

ALTER TABLE public.child_devices
  ADD CONSTRAINT child_devices_pairing_id_key UNIQUE (pairing_id),
  ADD CONSTRAINT child_devices_pairing_child_device_key
    UNIQUE (pairing_id, child_id, id),
  ADD CONSTRAINT child_devices_pairing_id_fkey
    FOREIGN KEY (pairing_id)
    REFERENCES public.child_device_pairings(id)
    ON DELETE SET NULL
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.child_device_pairings
  ADD CONSTRAINT child_device_pairings_device_child_fkey
    FOREIGN KEY (device_id, child_id)
    REFERENCES public.child_devices(id, child_id)
    ON DELETE NO ACTION
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.child_device_pairings
  ADD CONSTRAINT child_device_pairings_device_pairing_fkey
    FOREIGN KEY (id, child_id, device_id)
    REFERENCES public.child_devices(pairing_id, child_id, id)
    ON DELETE NO ACTION
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.child_device_usage_days
  ADD CONSTRAINT child_device_usage_days_device_child_fkey
    FOREIGN KEY (device_id, child_id)
    REFERENCES public.child_devices(id, child_id)
    ON DELETE NO ACTION
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.screen_time_logs
  ADD COLUMN device_id uuid,
  ADD COLUMN package_name text;

ALTER TABLE public.screen_time_logs
  ADD CONSTRAINT screen_time_logs_device_child_fkey
    FOREIGN KEY (device_id, child_id)
    REFERENCES public.child_devices(id, child_id)
    ON DELETE NO ACTION
    DEFERRABLE INITIALLY DEFERRED
    NOT VALID;

ALTER TABLE public.screen_time_logs
  VALIDATE CONSTRAINT screen_time_logs_device_child_fkey;

CREATE INDEX screen_time_logs_device_import_by_day
  ON public.screen_time_logs (child_id, usage_date, id)
  WHERE source = 'device_import'
    AND device_id IS NOT NULL;

ALTER TABLE public.child_reporting_timezones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_device_pairings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_device_usage_days ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.child_reporting_timezones,
  public.child_device_pairings,
  public.child_device_usage_days
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.child_reporting_timezones,
  public.child_device_pairings,
  public.child_device_usage_days
  TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.child_devices TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.screen_time_logs TO service_role;

COMMENT ON TABLE public.child_device_pairings IS
  'Stores only keyed pairing verifiers and credential hashes; raw pairing and device credentials are never stored.';
COMMENT ON TABLE public.child_device_usage_days IS
  'One revision ledger per child/date. Accepted rows distinguish a zero-usage snapshot from no received snapshot.';
COMMENT ON COLUMN public.child_devices.pairing_id IS
  'Unique pairing that created this device; NULL is permitted for existing registrations.';
COMMENT ON COLUMN public.child_devices.token_hash IS
  'SHA-256 of the permanent Android bearer credential, lowercase hexadecimal; plaintext is never stored.';
COMMENT ON COLUMN public.screen_time_logs.device_id IS
  'NULL for manual and legacy records; non-NULL records are constrained to the same child as the device.';

COMMIT;
