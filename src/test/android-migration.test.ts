import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = (name: string) =>
  readFileSync(resolve(process.cwd(), "supabase/migrations", name), "utf8").replace(/\r\n/g, "\n");

describe("Android usage migration security contracts", () => {
  const schema = migration("20261119090000_android_usage_schema.sql");
  const rpcs = migration("20261119090100_android_usage_rpcs.sql");
  const existingDevices = migration("20261118200000_create_child_devices.sql");
  const childExperience = migration("20261120090000_android_child_experience.sql");
  const issueRpc = childExperience.slice(
    childExperience.indexOf("CREATE OR REPLACE FUNCTION public.issue_android_child_usage_snapshot("),
    childExperience.indexOf("CREATE OR REPLACE FUNCTION public.ingest_android_child_usage_snapshot("),
  );
  const ingestRpc = childExperience.slice(
    childExperience.indexOf("CREATE OR REPLACE FUNCTION public.ingest_android_child_usage_snapshot("),
    childExperience.indexOf("CREATE OR REPLACE FUNCTION public.get_parent_android_device_overview("),
  );

  it("allows permanent child deletion to cascade Android records without changing deactivation behavior", () => {
    expect(schema).toContain("REFERENCES public.child_profiles(id)\n    ON DELETE CASCADE");
  });

  it("preserves the existing one-active-device partial index", () => {
    expect(existingDevices).toContain(
      "CREATE UNIQUE INDEX child_devices_one_active_per_child\n  ON public.child_devices (child_id)\n  WHERE revoked_at IS NULL",
    );
  });

  it("uses only the confirmed positional manage_child signature", () => {
    expect(rpcs).toContain("'public.manage_child(uuid,uuid,uuid,text,text,text,boolean)'");
    expect(rpcs).toContain(
      "SELECT public.manage_child(\n    v_user_id,\n    p_family,\n    p_child,\n    p_name,\n    p_avatar,\n    p_pin,\n    p_active\n  )",
    );
  });

  it("locks every matching parent membership before child authorization", () => {
    expect(rpcs).toContain("PERFORM fm.id\n  FROM public.family_members fm");
    expect(rpcs).toContain("FOR UPDATE");
  });

  it("locks pairings before devices in parent device revocation", () => {
    const revocation = rpcs.slice(
      rpcs.indexOf("CREATE OR REPLACE FUNCTION public.revoke_child_device"),
      rpcs.indexOf("CREATE OR REPLACE FUNCTION public.issue_child_usage_snapshot"),
    );
    expect(revocation.indexOf("FROM public.child_device_pairings p")).toBeGreaterThan(-1);
    expect(revocation.indexOf("FROM public.child_device_pairings p")).toBeLessThan(
      revocation.indexOf("FROM public.child_devices d"),
    );
  });

  it("rejects mismatched ticket key IDs while resuming or finalizing tickets", () => {
    expect(rpcs).toContain("'ticket_key_conflict'");
  });

  it("does not recreate or weaken direct grants to ordinary users", () => {
    expect(rpcs).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.issue_child_usage_snapshot[^;]*\bTO authenticated\b/,
    );
    expect(rpcs).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.ingest_child_usage_snapshot[^;]*\bTO authenticated\b/,
    );
  });

  it("keeps Android tables private from anon and authenticated clients", () => {
    expect(schema).toContain(
      "REVOKE ALL ON public.child_reporting_timezones,\n  public.child_device_pairings,\n  public.child_device_usage_days\n  FROM PUBLIC, anon, authenticated",
    );
  });

  it("preserves accepted snapshot and manual record resolution contracts", () => {
    expect(rpcs).toContain("accepted");
    expect(rpcs).toContain("'device_import'");
  });

  it("creates pairing credentials only through authenticated parent RPCs", () => {
    expect(rpcs).toContain(
      "CREATE OR REPLACE FUNCTION public.create_child_device_pairing(\n  p_child_id uuid,\n  p_timezone text,",
    );
    expect(rpcs).toContain("CREATE OR REPLACE FUNCTION public.get_child_device_pairing_status(");
    expect(rpcs).toContain(
      "GRANT EXECUTE ON FUNCTION public.create_child_device_pairing(uuid, text, text, text, text, text)\n  TO authenticated",
    );
    expect(rpcs).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_child_device_pairing_status(uuid, uuid)\n  TO authenticated",
    );
    expect(rpcs).toContain(
      "GRANT EXECUTE ON FUNCTION public.redeem_child_device_pairing(text, text, text, text)\n  TO service_role",
    );
    expect(rpcs).toContain(
      "GRANT EXECUTE ON FUNCTION public.activate_child_device_pairing(text, text)\n  TO service_role",
    );
  });

  it("derives pairing status access from the authenticated parent and child authorization", () => {
    const statusRpc = rpcs.slice(
      rpcs.indexOf("CREATE OR REPLACE FUNCTION public.get_child_device_pairing_status"),
      rpcs.indexOf("CREATE OR REPLACE FUNCTION public.redeem_child_device_pairing"),
    );
    expect(statusRpc).toContain("v_parent_id uuid := auth.uid()");
    expect(statusRpc).toContain("PERFORM public.authorize_parent_child(p_child_id)");
    expect(statusRpc).toContain("AND p.created_by = v_parent_id");
    expect(statusRpc).not.toMatch(/mood_entries|reflections|activity_notes/);
  });

  it("initializes a validated reporting timezone and binds pairing retries to the same secret", () => {
    const createRpc = rpcs.slice(
      rpcs.indexOf("CREATE OR REPLACE FUNCTION public.create_child_device_pairing"),
      rpcs.indexOf("CREATE OR REPLACE FUNCTION public.get_child_device_pairing_status"),
    );
    expect(createRpc).toContain("pg_catalog.pg_timezone_names");
    expect(createRpc).toContain("v_pairing_hash IS DISTINCT FROM p_pairing_hash");
    expect(createRpc).toContain("v_key_id IS DISTINCT FROM p_pairing_key_id");
    expect(createRpc).toContain("'status', 'pairing_open'");
    expect(createRpc).toContain("'expires_at', v_open_expires");
  });

  it("saves accepted metadata and restores the same issue revision", () => {
    expect(issueRpc).toContain("v_old_accepted_at timestamptz;");
    expect(issueRpc).toContain("v_old_payload_hash text;");
    expect(issueRpc).toContain(
      "SELECT u.revision, u.issue_request_hash, u.state,\n         u.accepted_at, u.payload_hash\n  INTO v_old_revision, v_old_request_hash, v_old_state,\n       v_old_accepted_at, v_old_payload_hash",
    );
    expect(issueRpc).toContain(
      "SET state = 'replaced',\n        accepted_at = NULL,\n        payload_hash = NULL",
    );
    expect(issueRpc).toContain(
      "SET state = 'accepted',\n        accepted_at = v_old_accepted_at,\n        payload_hash = v_old_payload_hash\n    WHERE child_id = v_child_id\n      AND usage_date = v_usage_date\n      AND revision = v_old_revision\n      AND state = 'replaced';",
    );
  });

  it("raises when the locked issue revision cannot be restored", () => {
    expect(issueRpc).toContain("v_restored_rows bigint;");
    expect(issueRpc).toContain("GET DIAGNOSTICS v_restored_rows = ROW_COUNT;");
    expect(issueRpc).toContain(
      "IF v_restored_rows <> 1 THEN\n      RAISE EXCEPTION 'Accepted usage snapshot could not be restored'\n        USING ERRCODE = 'check_violation';",
    );
  });

  it("clears accepted metadata inside the ingestion exception subtransaction", () => {
    expect(ingestRpc).toContain(
      "  BEGIN\n    UPDATE public.child_device_usage_days\n    SET state = 'replaced',\n        accepted_at = NULL,\n        payload_hash = NULL\n    WHERE child_id = v_child_id\n      AND usage_date = v_usage_date\n      AND revision = v_old_revision;\n\n    v_result := public.ingest_child_usage_snapshot(",
    );
  });

  it("raises on non-accepted ingestion results so the replacement rolls back", () => {
    expect(ingestRpc).toContain(
      "IF v_result->>'status' IS DISTINCT FROM 'accepted' THEN\n      RAISE EXCEPTION 'Snapshot was not accepted'\n        USING ERRCODE = 'Z0001';\n    END IF;\n  EXCEPTION\n    WHEN SQLSTATE 'Z0001' THEN\n      RETURN v_result;\n  END;",
    );
  });

  it("leaves successful ingestion replacement to the base RPC", () => {
    expect(ingestRpc).toContain(
      "v_result := public.ingest_child_usage_snapshot(\n      p_device_token_hash,\n      p_ticket_hash,\n      p_apps\n    );",
    );
    expect(ingestRpc).not.toContain("SET state = 'accepted'");
    expect(rpcs).toContain("SET state = 'accepted',\n      accepted_at = clock_timestamp(),\n      payload_hash = v_payload_hash");
  });

  it("preserves the original state-fields constraint", () => {
    expect(schema).toContain(
      "(state IN ('expired', 'replaced', 'revoked')\n      AND accepted_at IS NULL\n      AND payload_hash IS NULL)",
    );
    expect(childExperience).not.toContain("child_device_usage_days_state_fields_check");
  });

  it("preserves snapshot RPC signatures, security settings, and grants", () => {
    expect(issueRpc).toContain(
      "CREATE OR REPLACE FUNCTION public.issue_android_child_usage_snapshot(\n  p_device_token_hash text,\n  p_issue_request_hash text,\n  p_ticket_key_id text,\n  p_ticket_hash text DEFAULT NULL\n) RETURNS jsonb",
    );
    expect(issueRpc).toContain("SECURITY DEFINER\nSET search_path = pg_catalog, public");
    expect(ingestRpc).toContain(
      "CREATE OR REPLACE FUNCTION public.ingest_android_child_usage_snapshot(\n  p_device_token_hash text,\n  p_ticket_hash text,\n  p_apps jsonb\n) RETURNS jsonb",
    );
    expect(ingestRpc).toContain("SECURITY DEFINER\nSET search_path = pg_catalog, public");
    expect(childExperience).toContain(
      "REVOKE ALL ON FUNCTION public.issue_android_child_usage_snapshot(text, text, text, text)\n  FROM PUBLIC, anon, authenticated;\nGRANT EXECUTE ON FUNCTION public.issue_android_child_usage_snapshot(text, text, text, text)\n  TO service_role;",
    );
    expect(childExperience).toContain(
      "REVOKE ALL ON FUNCTION public.ingest_android_child_usage_snapshot(text, text, jsonb)\n  FROM PUBLIC, anon, authenticated;\nGRANT EXECUTE ON FUNCTION public.ingest_android_child_usage_snapshot(text, text, jsonb)\n  TO service_role;",
    );
  });
});
