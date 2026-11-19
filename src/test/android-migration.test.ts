import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = (name: string) =>
  readFileSync(resolve(process.cwd(), "supabase/migrations", name), "utf8").replace(/\r\n/g, "\n");

describe("Android usage migration security contracts", () => {
  const schema = migration("20261119090000_android_usage_schema.sql");
  const rpcs = migration("20261119090100_android_usage_rpcs.sql");
  const existingDevices = migration("20261118200000_create_child_devices.sql");

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
});
