import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { handleAndroidDeviceRequest, type AndroidDeviceRpc } from "@/lib/android-device.api.server";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const profile = (status = "ok") => ({
  data: {
    status,
    display_name: "Mia",
    avatar: "🌱",
    timezone: "Africa/Addis_Ababa",
    usage_date: "2026-11-20",
    goal_minutes: 180,
  },
  error: null,
});

function rpcStub(): AndroidDeviceRpc {
  return {
    profile: vi.fn(async () => profile()),
    issue: vi
      .fn()
      .mockResolvedValueOnce({ data: { status: "preparing" }, error: null })
      .mockResolvedValueOnce({ data: { status: "outstanding" }, error: null }),
    ingest: vi.fn(async () => ({
      data: { status: "accepted", retry: false },
      error: null,
    })),
    childSpace: vi.fn(async () => ({
      data: {
        status: "ok",
        usage_date: "2026-11-20",
        mood: null,
        activities: [
          {
            key: "draw",
            title: "Draw Your Dream World",
            description: "A creative activity.",
            category: "Creativity",
            duration_minutes: 20,
            difficulty: "Easy",
            materials: "Paper and pencils",
            instructions: ["Draw a picture."],
            supervision_required: false,
          },
        ],
      },
      error: null,
    })),
    saveMood: vi.fn(async () => ({
      data: { status: "ok", usage_date: "2026-11-20" },
      error: null,
    })),
    completeActivity: vi.fn(async () => ({
      data: { status: "ok", usage_date: "2026-11-20" },
      error: null,
    })),
  };
}

function post(path: string, body: unknown) {
  return new Request(`https://sotiria.example${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function migrationFunctionBody(migration: string, functionName: string) {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${functionName}(`);
  if (start < 0) return "";
  const nextFunction = migration.indexOf("\nCREATE OR REPLACE FUNCTION", start + 1);
  const grants = migration.indexOf("\nREVOKE ALL", start + 1);
  const ends = [nextFunction, grants, migration.indexOf("\nCOMMIT;", start + 1)].filter(
    (index) => index >= 0,
  );
  return migration.slice(start, Math.min(...ends));
}

function activityCompletionUniquenessGuard() {
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20261120130000_android_child_space_device_api.sql"),
    "utf8",
  ).replace(/\r\n/g, "\n");
  const start = migration.indexOf("LOCK TABLE public.activity_completions");
  const end = migration.indexOf("\nCREATE OR REPLACE FUNCTION", start);
  return migration.slice(start, end);
}

function activityCompletionPrerequisiteGuard() {
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20261120130000_android_child_space_device_api.sql"),
    "utf8",
  ).replace(/\r\n/g, "\n");
  const start = migration.indexOf("DO $$");
  const end = migration.indexOf("\nLOCK TABLE public.activity_completions", start);
  return migration.slice(start, end);
}

function moodEntryPrerequisiteGuard() {
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20261120130000_android_child_space_device_api.sql"),
    "utf8",
  ).replace(/\r\n/g, "\n");
  const moodTableCheck = migration.indexOf(
    "v_mood_table oid := to_regclass('public.mood_entries')",
  );
  const start = migration.lastIndexOf("DO $$", moodTableCheck);
  const end = migration.indexOf("\nLOCK TABLE public.activity_completions", moodTableCheck);
  return migration.slice(start, end);
}

function moodEntryUniquenessGuard() {
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20261120130000_android_child_space_device_api.sql"),
    "utf8",
  ).replace(/\r\n/g, "\n");
  const start = migration.indexOf("LOCK TABLE public.mood_entries");
  const end = migration.indexOf("\nCREATE OR REPLACE FUNCTION", start);
  return migration.slice(start, end);
}

describe("Android registered-device APIs", () => {
  it("returns the server-bound child profile after validating the device credential", async () => {
    const rpc = rpcStub();
    const deviceToken = "A".repeat(43);
    const response = await handleAndroidDeviceRequest(
      post("/api/android/device/profile", { deviceToken }),
      rpc,
    );

    expect(rpc.profile).toHaveBeenCalledWith({
      p_device_token_hash: hash(deviceToken),
    });
    expect(await response?.json()).toEqual({
      status: "ok",
      displayName: "Mia",
      avatar: "🌱",
      timezone: "Africa/Addis_Ababa",
      usageDate: "2026-11-20",
      goalMinutes: 180,
    });
  });

  it("rejects revoked or inactive devices without exposing a profile", async () => {
    const rpc = rpcStub();
    vi.mocked(rpc.profile).mockResolvedValue({
      data: { status: "device_revoked" },
      error: null,
    });
    const response = await handleAndroidDeviceRequest(
      post("/api/android/device/profile", { deviceToken: "A".repeat(43) }),
      rpc,
    );

    expect(response?.status).toBe(403);
    expect(await response?.json()).toMatchObject({
      status: "device_revoked",
      error: "This phone is no longer authorized. Ask the parent to authorize it again.",
    });
  });

  it("derives child association from the registered device and accepts an empty snapshot", async () => {
    const rpc = rpcStub();
    const deviceToken = "A".repeat(43);
    const issueRequestToken = "B".repeat(43);
    const ticketToken = "C".repeat(43);
    const response = await handleAndroidDeviceRequest(
      post("/api/android/usage/snapshot", {
        deviceToken,
        issueRequestToken,
        ticketToken,
        usageDate: "2026-11-20",
        apps: [],
      }),
      rpc,
    );

    expect(rpc.issue).toHaveBeenNthCalledWith(1, {
      p_device_token_hash: hash(deviceToken),
      p_issue_request_hash: hash(issueRequestToken),
      p_ticket_key_id: "android-usage-v1",
      p_ticket_hash: null,
    });
    expect(rpc.issue).toHaveBeenNthCalledWith(2, {
      p_device_token_hash: hash(deviceToken),
      p_issue_request_hash: hash(issueRequestToken),
      p_ticket_key_id: "android-usage-v1",
      p_ticket_hash: hash(ticketToken),
    });
    expect(rpc.ingest).toHaveBeenCalledWith({
      p_device_token_hash: hash(deviceToken),
      p_ticket_hash: hash(ticketToken),
      p_apps: [],
    });
    expect(JSON.stringify(await response?.json())).not.toContain(deviceToken);
    expect(response?.status).toBe(200);
  });

  it("does not issue an upload ticket for a client-supplied date that differs from server time", async () => {
    const rpc = rpcStub();
    const response = await handleAndroidDeviceRequest(
      post("/api/android/usage/snapshot", {
        deviceToken: "A".repeat(43),
        issueRequestToken: "B".repeat(43),
        ticketToken: "C".repeat(43),
        usageDate: "2026-11-19",
        apps: [],
      }),
      rpc,
    );

    expect(response?.status).toBe(409);
    expect(rpc.issue).not.toHaveBeenCalled();
    expect(rpc.ingest).not.toHaveBeenCalled();
  });

  it("rejects client-selected child IDs and oversized daily totals", async () => {
    const rpc = rpcStub();
    const withChildId = await handleAndroidDeviceRequest(
      post("/api/android/usage/snapshot", {
        deviceToken: "A".repeat(43),
        issueRequestToken: "B".repeat(43),
        ticketToken: "C".repeat(43),
        usageDate: "2026-11-20",
        childId: "00000000-0000-4000-8000-000000000001",
        apps: [],
      }),
      rpc,
    );
    const overLimit = await handleAndroidDeviceRequest(
      post("/api/android/usage/snapshot", {
        deviceToken: "A".repeat(43),
        issueRequestToken: "B".repeat(43),
        ticketToken: "C".repeat(43),
        usageDate: "2026-11-20",
        apps: [
          {
            package: "com.example.one",
            app_name: "One",
            category: "Other",
            duration_minutes: 900,
          },
          {
            package: "com.example.two",
            app_name: "Two",
            category: "Other",
            duration_minutes: 600,
          },
        ],
      }),
      rpc,
    );

    expect(withChildId?.status).toBe(400);
    expect(overLimit?.status).toBe(400);
    expect(rpc.issue).not.toHaveBeenCalled();
  });

  it("rejects missing or malformed device credentials and client-selected child/date data", async () => {
    const rpc = rpcStub();
    const requests = [
      post("/api/android/child-space/today", {}),
      post("/api/android/child-space/today", { deviceToken: "invalid" }),
      post("/api/android/child-space/today", {
        deviceToken: "A".repeat(43),
        childId: "00000000-0000-4000-8000-000000000001",
      }),
      post("/api/android/child-space/today", {
        deviceToken: "A".repeat(43),
        date: "2026-11-20",
      }),
    ];

    for (const request of requests) {
      expect((await handleAndroidDeviceRequest(request, rpc))?.status).toBe(400);
    }
    expect(rpc.childSpace).not.toHaveBeenCalled();
  });

  it("returns today's mood only and hashes the device credential", async () => {
    const rpc = rpcStub();
    const deviceToken = "A".repeat(43);
    const response = await handleAndroidDeviceRequest(
      post("/api/android/child-space/today", { deviceToken }),
      rpc,
    );

    expect(rpc.childSpace).toHaveBeenCalledWith({
      p_device_token_hash: hash(deviceToken),
    });
    expect(await response?.json()).toEqual({
      status: "ok",
      usageDate: "2026-11-20",
      mood: null,
    });
  });

  it("surfaces revoked and inactive device states without returning child data", async () => {
    const rpc = rpcStub();
    vi.mocked(rpc.childSpace).mockResolvedValueOnce({
      data: { status: "invalid_device" },
      error: null,
    });
    const invalid = await handleAndroidDeviceRequest(
      post("/api/android/child-space/today", { deviceToken: "A".repeat(43) }),
      rpc,
    );
    expect(invalid?.status).toBe(401);

    for (const status of ["device_revoked", "child_inactive"]) {
      vi.mocked(rpc.childSpace).mockResolvedValueOnce({
        data: { status },
        error: null,
      });
      const response = await handleAndroidDeviceRequest(
        post("/api/android/child-space/today", { deviceToken: "A".repeat(43) }),
        rpc,
      );
      expect(response?.status).toBe(403);
      expect(await response?.json()).toMatchObject({ status });
    }
  });

  it("accepts only known moods and sends no child identity, date, or reflection", async () => {
    const rpc = rpcStub();
    const deviceToken = "A".repeat(43);
    const response = await handleAndroidDeviceRequest(
      post("/api/android/child-space/mood", { deviceToken, mood: "Joyful" }),
      rpc,
    );

    expect(response?.status).toBe(200);
    expect(rpc.saveMood).toHaveBeenCalledWith({
      p_device_token_hash: hash(deviceToken),
      p_mood: "Joyful",
    });

    const invalidMood = await handleAndroidDeviceRequest(
      post("/api/android/child-space/mood", { deviceToken, mood: "Unknown" }),
      rpc,
    );
    const privateFields = await handleAndroidDeviceRequest(
      post("/api/android/child-space/mood", {
        deviceToken,
        mood: "Calm",
        childId: "00000000-0000-4000-8000-000000000001",
        date: "2026-11-20",
        reflection: "unexpected",
      }),
      rpc,
    );
    expect(invalidMood?.status).toBe(400);
    expect(privateFields?.status).toBe(400);
    expect(rpc.saveMood).toHaveBeenCalledTimes(1);
  });

  it("returns published activity data and records valid completion requests", async () => {
    const rpc = rpcStub();
    const deviceToken = "A".repeat(43);
    const activitiesResponse = await handleAndroidDeviceRequest(
      post("/api/android/child-space/activities", { deviceToken }),
      rpc,
    );
    expect(await activitiesResponse?.json()).toMatchObject({
      status: "ok",
      activities: [{ key: "draw", title: "Draw Your Dream World" }],
    });

    const completionResponse = await handleAndroidDeviceRequest(
      post("/api/android/child-space/activities/complete", {
        deviceToken,
        activityKey: "draw",
      }),
      rpc,
    );
    expect(completionResponse?.status).toBe(200);
    expect(rpc.completeActivity).toHaveBeenCalledWith({
      p_device_token_hash: hash(deviceToken),
      p_activity_key: "draw",
    });

    const invalidCompletion = await handleAndroidDeviceRequest(
      post("/api/android/child-space/activities/complete", {
        deviceToken,
        activityKey: "not a key",
      }),
      rpc,
    );
    expect(invalidCompletion?.status).toBe(400);
    expect(rpc.completeActivity).toHaveBeenCalledTimes(1);
  });
});

describe("parent device overview privacy contract", () => {
  it("limits the parent RPC to authorized usage summaries, device state, and screen-time goal", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20261120090000_android_child_experience.sql"),
      "utf8",
    ).replace(/\r\n/g, "\n");
    const overview = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.get_parent_android_device_overview"),
      migration.indexOf("REVOKE ALL ON FUNCTION public.get_android_child_device_profile"),
    );

    expect(overview).toContain("PERFORM public.authorize_parent_child(p_child_id)");
    expect(overview).toContain("u.state = 'accepted'");
    expect(overview).toContain("'snapshot_received', v_snapshot_received");
    expect(overview).toContain("'app_name', l.app_name");
    expect(overview).toContain("'duration_minutes', l.duration_minutes");
    expect(overview).not.toMatch(/mood_entries|reflections|activity_notes|l\.notes/);
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_parent_android_device_overview(uuid)\n  TO authenticated",
    );
  });

  it("authorizes each Child Space RPC through the active device and derives child identity", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20261120130000_android_child_space_device_api.sql",
      ),
      "utf8",
    ).replace(/\r\n/g, "\n");
    const rpcNames = [
      "get_android_child_space",
      "save_android_child_mood",
      "complete_android_child_activity",
    ];

    for (const name of rpcNames) {
      const body = migrationFunctionBody(migration, name);
      expect(body).toContain("SECURITY DEFINER");
      expect(body).not.toContain("public.get_android_child_device_profile");
      expect(body).toContain("p_device_token_hash !~ '^[0-9a-f]{64}$'");
      expect(body).toContain("FROM public.child_devices d");
      expect(body).toContain("d.token_hash = p_device_token_hash");
      expect(body).toContain("SELECT cp.is_active");
      expect(body).toContain("FROM public.child_profiles cp");
      expect(body).toContain("v_child_active IS DISTINCT FROM TRUE");
      expect(body).toContain("IF v_revoked_at IS NOT NULL");
      expect(body).toContain("SET last_seen_at = clock_timestamp()");
      expect(body).toContain("FROM public.child_reporting_timezones t");
      expect(body).toContain("(clock_timestamp() AT TIME ZONE v_timezone)::date");
      expect(body).toMatch(
        /FROM public\.child_profiles cp[\s\S]*?FOR UPDATE;[\s\S]*?SELECT d\.revoked_at[\s\S]*?FROM public\.child_devices d[\s\S]*?FOR UPDATE;/,
      );
      expect(body).not.toMatch(/p_child_id|p_usage_date|p_reflection|optional_reflection/i);
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${name}(`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${name}(`);
      expect(migration).toMatch(
        new RegExp(
          `GRANT EXECUTE ON FUNCTION public\\.${name}\\([^\\n]*\\)[\\s\\S]*?TO service_role`,
        ),
      );
    }
  });

  it("preserves reflections, filters unpublished activities, and makes completion idempotent", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20261120130000_android_child_space_device_api.sql",
      ),
      "utf8",
    ).replace(/\r\n/g, "\n");
    const readBody = migrationFunctionBody(migration, "get_android_child_space");
    const moodBody = migrationFunctionBody(migration, "save_android_child_mood");
    const completionBody = migrationFunctionBody(migration, "complete_android_child_activity");

    expect(migration).toContain(
      "ADD CONSTRAINT activity_completions_child_activity_day_key UNIQUE (child_id, activity_id, completed_on)",
    );
    expect(migration).toContain(
      "GROUP BY child_id, activity_id, completed_on\n      HAVING count(*) > 1",
    );
    expect(readBody).toContain("WHERE a.is_published IS TRUE");
    expect(readBody).toContain("SELECT m.mood");
    expect(readBody).not.toMatch(/reflection|optional_reflection/i);
    expect(moodBody).toContain("DO UPDATE SET mood = EXCLUDED.mood");
    expect(moodBody).not.toMatch(/reflection|optional_reflection/i);
    expect(completionBody).toContain("AND a.is_published IS TRUE");
    expect(completionBody).toContain(
      "ON CONFLICT (child_id, activity_id, completed_on) DO NOTHING",
    );
    expect(completionBody).not.toMatch(/reflection|optional_reflection/i);
  });

  it("keeps the existing parent snapshot and export projections free of mood and reflection data", () => {
    const wellbeing = readFileSync(
      resolve(process.cwd(), "src/lib/wellbeing.functions.ts"),
      "utf8",
    );
    const parentStart = wellbeing.indexOf("export const getParentSnapshot");
    const parentEnd = wellbeing.indexOf("\nexport const setScreenTimeGoal", parentStart);
    const parentProjection = wellbeing.slice(parentStart, parentEnd);
    const wellbeingExports = readFileSync(resolve(process.cwd(), "src/lib/wellbeing.ts"), "utf8");

    expect(parentProjection).not.toMatch(/mood_entries|reflection|optional_reflection/i);
    expect(parentProjection).not.toContain("moods:");
    expect(wellbeingExports).toContain("'Mood check-ins'");
    expect(wellbeingExports).toContain("'Private reflections and journal notes'");
  });
});

describe("activity completion uniqueness migration contract", () => {
  it("fails clearly before RPC creation unless the existing completion schema is valid", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20261120130000_android_child_space_device_api.sql",
      ),
      "utf8",
    ).replace(/\r\n/g, "\n");
    const prerequisite = activityCompletionPrerequisiteGuard();
    const firstFunction = migration.indexOf("\nCREATE OR REPLACE FUNCTION");

    expect(prerequisite).toContain("to_regclass('public.activity_completions')");
    expect(prerequisite).toContain("public.activity_completions table");
    expect(prerequisite).toContain("a.attname = 'child_id'");
    expect(prerequisite).toContain("a.attname = 'activity_id'");
    expect(prerequisite).toContain("a.attname = 'completed_on'");
    expect(prerequisite).toContain("'uuid'::regtype");
    expect(prerequisite).toContain("'date'::regtype");
    expect(prerequisite).toContain("c.contype = 'f'");
    expect(prerequisite).toContain("c.convalidated");
    expect(prerequisite).toContain("public.child_profiles and public.activities");
    expect(migration).not.toMatch(/CREATE TABLE\s+public\.activity_completions/i);
    expect(migration.indexOf("LOCK TABLE public.activity_completions")).toBeLessThan(firstFunction);
    expect(migration.indexOf("activity_completions_child_activity_day_key UNIQUE")).toBeLessThan(
      firstFunction,
    );
  });

  it("recognizes an existing matching non-deferrable unique constraint", () => {
    const guard = activityCompletionUniquenessGuard();
    expect(guard).toContain("FROM pg_constraint c");
    expect(guard).toContain("c.contype = 'u'");
    expect(guard).toContain("AND NOT c.condeferrable");
    expect(guard).toContain("c.conkey @> v_expected_attnums");
    expect(guard).toContain("v_expected_attnums @> c.conkey");
  });

  it("recognizes an equivalent usable standalone unique index", () => {
    const guard = activityCompletionUniquenessGuard();
    expect(guard).toContain("FROM pg_index i");
    expect(guard).toContain("i.indisunique");
    expect(guard).toContain("i.indisvalid");
    expect(guard).toContain("i.indisready");
    expect(guard).toContain("i.indimmediate");
    expect(guard).toContain("i.indpred IS NULL");
    expect(guard).toContain("i.indexprs IS NULL");
    expect(guard).toContain("i.indnkeyatts = 3");
    expect(guard).toContain("key_column.key_position <= i.indnkeyatts");
    expect(guard).toContain(") = v_expected_attnums");
  });

  it("adds the unique constraint only when neither catalog has a usable key", () => {
    const guard = activityCompletionUniquenessGuard();
    expect(guard).toContain("IF NOT v_has_unique_constraint AND NOT v_has_unique_index THEN");
    expect(guard).toContain(
      "ADD CONSTRAINT activity_completions_child_activity_day_key UNIQUE (child_id, activity_id, completed_on)",
    );
  });

  it("aborts on duplicate completion rows before adding uniqueness", () => {
    const guard = activityCompletionUniquenessGuard();
    const duplicatePreflight = guard.indexOf("GROUP BY child_id, activity_id, completed_on");
    const addConstraint = guard.indexOf("ALTER TABLE public.activity_completions ADD CONSTRAINT");

    expect(guard).toContain("HAVING count(*) > 1");
    expect(guard).toContain("RAISE EXCEPTION");
    expect(duplicatePreflight).toBeGreaterThanOrEqual(0);
    expect(addConstraint).toBeGreaterThan(duplicatePreflight);
  });
});

describe("mood entry uniqueness migration contract", () => {
  it("fails before RPC creation unless the existing mood schema is compatible", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20261120130000_android_child_space_device_api.sql",
      ),
      "utf8",
    ).replace(/\r\n/g, "\n");
    const prerequisite = moodEntryPrerequisiteGuard();
    const firstFunction = migration.indexOf("\nCREATE OR REPLACE FUNCTION");

    expect(prerequisite).toContain("to_regclass('public.mood_entries')");
    expect(prerequisite).toContain("a.attname = 'child_id'");
    expect(prerequisite).toContain("a.attname = 'entry_date'");
    expect(prerequisite).toContain("a.attname = 'mood'");
    expect(prerequisite).toContain("t.typcategory = 'S'");
    expect(prerequisite).toContain("a.attnotnull");
    expect(prerequisite).toContain("c.contype = 'f'");
    expect(prerequisite).toContain("c.convalidated");
    expect(prerequisite).toContain("c.confrelid = v_child_table");
    expect(prerequisite).toContain("c.conkey = ARRAY[v_child_id_attnum]::smallint[]");
    expect(prerequisite).toContain("c.confkey = ARRAY[v_child_pk_attnum]::smallint[]");
    expect(prerequisite).toContain("public.mood_entries must have a validated child_id");
    expect(migration.indexOf("LOCK TABLE public.activity_completions")).toBeLessThan(firstFunction);
  });

  it("recognizes an existing matching non-deferrable unique constraint", () => {
    const guard = moodEntryUniquenessGuard();
    expect(guard).toContain("FROM pg_constraint c");
    expect(guard).toContain("c.contype = 'u'");
    expect(guard).toContain("AND NOT c.condeferrable");
    expect(guard).toContain("c.conkey @> v_expected_attnums");
    expect(guard).toContain("v_expected_attnums @> c.conkey");
  });

  it("recognizes an equivalent usable standalone unique index", () => {
    const guard = moodEntryUniquenessGuard();
    expect(guard).toContain("FROM pg_index i");
    expect(guard).toContain("i.indisunique");
    expect(guard).toContain("i.indisvalid");
    expect(guard).toContain("i.indisready");
    expect(guard).toContain("i.indimmediate");
    expect(guard).toContain("i.indpred IS NULL");
    expect(guard).toContain("i.indexprs IS NULL");
    expect(guard).toContain("i.indnkeyatts = 2");
    expect(guard).toContain("key_column.key_position <= i.indnkeyatts");
    expect(guard).toContain(") = v_expected_attnums");
  });

  it("adds uniqueness only when neither catalog has a usable key", () => {
    const guard = moodEntryUniquenessGuard();
    expect(guard).toContain("IF NOT v_has_unique_constraint AND NOT v_has_unique_index THEN");
    expect(guard).toContain(
      "ADD CONSTRAINT mood_entries_child_entry_date_key UNIQUE (child_id, entry_date)",
    );
  });

  it("aborts on duplicate mood rows before adding uniqueness", () => {
    const guard = moodEntryUniquenessGuard();
    const duplicatePreflight = guard.indexOf("GROUP BY child_id, entry_date");
    const addConstraint = guard.indexOf("ALTER TABLE public.mood_entries ADD CONSTRAINT");

    expect(guard).toContain("HAVING count(*) > 1");
    expect(guard).toContain("RAISE EXCEPTION");
    expect(duplicatePreflight).toBeGreaterThanOrEqual(0);
    expect(addConstraint).toBeGreaterThan(duplicatePreflight);
  });
});
