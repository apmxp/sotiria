BEGIN;
CREATE TABLE public.child_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  child_id uuid NOT NULL
    REFERENCES public.child_profiles(id)
    ON DELETE CASCADE,

  device_name text NOT NULL
    CHECK (length(trim(device_name)) BETWEEN 1 AND 80),

  token_hash text NOT NULL
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),

  created_at timestamptz NOT NULL DEFAULT now(),

  last_seen_at timestamptz,

  revoked_at timestamptz
);

-- Only one active device per child.
CREATE UNIQUE INDEX child_devices_one_active_per_child
  ON public.child_devices (child_id)
  WHERE revoked_at IS NULL;

-- Efficient lookup of active device registrations.
CREATE INDEX child_devices_active_lookup
  ON public.child_devices (id, child_id)
  WHERE revoked_at IS NULL;

-- Enable RLS, with no direct client policies.
ALTER TABLE public.child_devices ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.child_devices FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.child_devices TO service_role;
COMMIT;
