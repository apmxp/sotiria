-- Migration: add secure get_family_children(p_family_id uuid) function
-- Purpose: allow authenticated parents to load their children's safe profile
--          columns without granting direct SELECT on child_profiles (which
--          contains pin_hash).
-- Security:
--   - SECURITY DEFINER runs as function owner, bypassing table-level grant
--     restriction on child_profiles, but enforces its own parent check.
--   - auth.uid() must match a family_members row with role='parent' AND
--     family_id = p_family_id (the exact family requested — no LIMIT 1).
--   - pin_hash is never projected.
--   - search_path is pinned to prevent search-path injection.
--   - EXECUTE revoked from PUBLIC and anon; granted only to authenticated.
--   - No change to child_profiles table grants or any RLS policy.

CREATE OR REPLACE FUNCTION public.get_family_children(p_family_id uuid)
RETURNS TABLE (
  id           uuid,
  family_id    uuid,
  display_name text,
  avatar       text,
  is_active    boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_is_parent boolean;
BEGIN
  -- Confirm auth.uid() is a parent of this exact family
  SELECT EXISTS (
    SELECT 1
      FROM public.family_members fm
     WHERE fm.user_id   = auth.uid()
       AND fm.family_id = p_family_id
       AND fm.role      = 'parent'
  ) INTO v_is_parent;

  -- Reject if not a verified parent of p_family_id
  IF NOT v_is_parent THEN
    RETURN;
  END IF;

  -- Return safe columns only — pin_hash is never selected
  RETURN QUERY
  SELECT cp.id,
         cp.family_id,
         cp.display_name,
         cp.avatar,
         cp.is_active
    FROM public.child_profiles cp
   WHERE cp.family_id = p_family_id
   ORDER BY cp.created_at;
END;
$$;

-- Revoke default public/anon execute, grant only to authenticated
REVOKE ALL ON FUNCTION public.get_family_children(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_family_children(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_family_children(uuid) TO authenticated;
