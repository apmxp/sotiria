import { z } from "zod";
import { MOOD_VALUES } from "./wellbeing-db";

type RpcResult = {
  data: unknown;
  error: { code?: string } | null;
};

type DeviceProfileArgs = {
  p_device_token_hash: string;
};

type IssueSnapshotArgs = {
  p_device_token_hash: string;
  p_issue_request_hash: string;
  p_ticket_key_id: string;
  p_ticket_hash: string | null;
};

type IngestSnapshotArgs = {
  p_device_token_hash: string;
  p_ticket_hash: string;
  p_apps: Array<{
    package: string;
    app_name: string;
    category: "Learning" | "Videos" | "Games" | "Other";
    duration_minutes: number;
  }>;
};

type ChildSpaceArgs = {
  p_device_token_hash: string;
};

type SaveMoodArgs = ChildSpaceArgs & {
  p_mood: (typeof MOOD_VALUES)[number];
};

type CompleteActivityArgs = ChildSpaceArgs & {
  p_activity_key: string;
};

type ChildSpaceData = {
  usage_date: string;
  mood: (typeof MOOD_VALUES)[number] | null;
  activities: z.infer<typeof activityOutput>[];
};

export type AndroidDeviceRpc = {
  profile: (args: DeviceProfileArgs) => PromiseLike<RpcResult>;
  issue: (args: IssueSnapshotArgs) => PromiseLike<RpcResult>;
  ingest: (args: IngestSnapshotArgs) => PromiseLike<RpcResult>;
  childSpace: (args: ChildSpaceArgs) => PromiseLike<RpcResult>;
  saveMood: (args: SaveMoodArgs) => PromiseLike<RpcResult>;
  completeActivity: (args: CompleteActivityArgs) => PromiseLike<RpcResult>;
};

const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const profileInput = z.object({ deviceToken: token }).strict();
const childSpaceInput = profileInput;
const moodInput = z.object({ deviceToken: token, mood: z.enum(MOOD_VALUES) }).strict();
const activityCompletionInput = z
  .object({
    deviceToken: token,
    activityKey: z.string().regex(/^[a-z0-9-]{1,40}$/),
  })
  .strict();
const activityOutput = z
  .object({
    key: z.string(),
    title: z.string(),
    description: z.string(),
    category: z.string(),
    duration_minutes: z.number().int().positive(),
    difficulty: z.string(),
    materials: z.string(),
    instructions: z.array(z.string()),
    supervision_required: z.boolean(),
  })
  .strict();
function statusError(status: string) {
  const error =
    status === "activity_unavailable"
      ? "This activity is no longer available."
      : status === "invalid_mood" || status === "invalid_activity_key"
        ? "The child-space request is invalid."
        : status === "timezone_required"
          ? "The child's reporting timezone is not configured."
          : status === "invalid_device" ||
              status === "device_revoked" ||
              status === "child_inactive"
            ? "This phone is no longer authorized. Ask the parent to authorize it again."
            : "Child Space could not be completed. Try again.";
  return jsonResponse(statusCode(status), { status, error });
}

async function callChildSpaceRpc(
  deviceToken: string,
  rpc: AndroidDeviceRpc,
): Promise<{ data: ChildSpaceData } | { response: Response }> {
  let result: RpcResult | null;
  try {
    result = await rpc.childSpace({ p_device_token_hash: await sha256Hex(deviceToken) });
  } catch {
    result = null;
  }
  if (!result || result.error) {
    console.error("[Android child space] Read RPC failed", result?.error?.code ?? "network error");
    return { response: jsonResponse(503, { error: "Child Space could not be loaded." }) };
  }

  const status = z.object({ status: z.string() }).safeParse(result.data);
  if (!status.success) {
    console.error("[Android child space] Read RPC returned an invalid response");
    return { response: jsonResponse(503, { error: "Child Space could not be loaded." }) };
  }
  if (status.data.status !== "ok") {
    return { response: statusError(status.data.status) };
  }

  const parsed = z
    .object({
      status: z.literal("ok"),
      usage_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      mood: z.enum(MOOD_VALUES).nullable(),
      activities: z.array(activityOutput),
    })
    .strict()
    .safeParse(result.data);
  if (!parsed.success) {
    console.error("[Android child space] Read RPC returned invalid child-space data");
    return { response: jsonResponse(503, { error: "Child Space could not be loaded." }) };
  }
  return { data: parsed.data };
}

async function callChildSpaceWriteRpc(
  label: string,
  call: () => PromiseLike<RpcResult>,
): Promise<{ status: "ok"; usage_date: string } | { response: Response }> {
  let result: RpcResult | null;
  try {
    result = await call();
  } catch {
    result = null;
  }
  if (!result || result.error) {
    console.error(
      `[Android child space] ${label} RPC failed`,
      result?.error?.code ?? "network error",
    );
    return { response: jsonResponse(503, { error: "Child Space could not be saved." }) };
  }

  const parsed = z
    .object({
      status: z.string(),
      usage_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    })
    .safeParse(result.data);
  if (!parsed.success) {
    console.error(`[Android child space] ${label} RPC returned an invalid response`);
    return { response: jsonResponse(503, { error: "Child Space could not be saved." }) };
  }
  if (parsed.data.status !== "ok") {
    return { response: statusError(parsed.data.status) };
  }
  if (!parsed.data.usage_date) {
    console.error(`[Android child space] ${label} RPC omitted the reporting date`);
    return { response: jsonResponse(503, { error: "Child Space could not be saved." }) };
  }
  return { status: "ok", usage_date: parsed.data.usage_date };
}

const appInput = z
  .object({
    package: z
      .string()
      .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/)
      .max(255),
    app_name: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .refine(
        (value) =>
          !value
            .split("")
            .some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127),
      ),
    category: z.enum(["Learning", "Videos", "Games", "Other"]),
    duration_minutes: z.number().int().min(1).max(1440),
  })
  .strict();
const snapshotInput = z
  .object({
    deviceToken: token,
    issueRequestToken: token,
    ticketToken: token,
    usageDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    apps: z.array(appInput).max(200),
  })
  .strict();

function jsonResponse(status: number, body: Record<string, unknown>) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function readJson(request: Request, maxBytes: number): Promise<unknown | Response> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return jsonResponse(415, { error: "JSON is required." });
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return jsonResponse(413, { error: "Request is too large." });
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return jsonResponse(400, { error: "Request body is invalid." });
  }
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    return jsonResponse(413, { error: "Request is too large." });
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return jsonResponse(400, { error: "Request body is invalid." });
  }
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function statusCode(status: string) {
  switch (status) {
    case "ok":
    case "accepted":
      return 200;
    case "invalid_device":
      return 401;
    case "device_revoked":
    case "child_inactive":
      return 403;
    case "invalid_mood":
    case "invalid_activity_key":
      return 400;
    case "activity_unavailable":
      return 404;
    case "ticket_expired":
    case "ticket_issue_expired":
      return 410;
    case "usage_day_changed":
    case "collection_window_closed":
    case "ticket_preparing":
    case "ticket_conflict":
    case "ticket_key_conflict":
    case "ticket_replaced":
    case "invalid_ticket":
    case "ticket_not_ready":
    case "ticket_not_prepared":
    case "timezone_required":
      return 409;
    default:
      return 503;
  }
}

async function readProfile(deviceToken: string, rpc: AndroidDeviceRpc) {
  let result: RpcResult | null;
  try {
    result = await rpc.profile({ p_device_token_hash: await sha256Hex(deviceToken) });
  } catch {
    result = null;
  }
  if (!result || result.error) {
    console.error("[Android device] Profile RPC failed", result?.error?.code ?? "network error");
    return {
      response: jsonResponse(503, { error: "The phone authorization could not be checked." }),
    };
  }

  const parsed = z
    .object({
      status: z.string(),
      display_name: z.string().optional(),
      avatar: z.string().optional(),
      timezone: z.string().optional(),
      usage_date: z.string().optional(),
      goal_minutes: z.number().int().nullable().optional(),
    })
    .safeParse(result.data);
  if (!parsed.success) {
    console.error("[Android device] Profile RPC returned an invalid response");
    return {
      response: jsonResponse(503, { error: "The phone authorization could not be checked." }),
    };
  }
  if (parsed.data.status !== "ok") {
    return {
      response: jsonResponse(statusCode(parsed.data.status), {
        status: parsed.data.status,
        error: "This phone is no longer authorized. Ask the parent to authorize it again.",
      }),
    };
  }
  if (
    !parsed.data.display_name ||
    !parsed.data.avatar ||
    !parsed.data.timezone ||
    !parsed.data.usage_date ||
    parsed.data.goal_minutes === undefined
  ) {
    console.error("[Android device] Profile RPC omitted required profile fields");
    return { response: jsonResponse(503, { error: "The phone profile could not be loaded." }) };
  }
  return { profile: parsed.data };
}

export async function handleAndroidDeviceRequest(
  request: Request,
  rpc: AndroidDeviceRpc,
): Promise<Response | null> {
  const { pathname, protocol, hostname } = new URL(request.url);
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";
  const childSpacePaths = [
    "/api/android/child-space/today",
    "/api/android/child-space/activities",
    "/api/android/child-space/mood",
    "/api/android/child-space/activities/complete",
  ];
  if (
    pathname !== "/api/android/device/profile" &&
    pathname !== "/api/android/usage/snapshot" &&
    !childSpacePaths.includes(pathname)
  ) {
    return null;
  }
  if (protocol !== "https:" && !isLocalHost) {
    return jsonResponse(400, { error: "HTTPS is required." });
  }
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "POST is required." });
  }

  const body = await readJson(request, pathname.endsWith("/snapshot") ? 90_000 : 4096);
  if (body instanceof Response) return body;

  if (pathname === "/api/android/device/profile") {
    const parsed = profileInput.safeParse(body);
    if (!parsed.success) return jsonResponse(400, { error: "Device request is invalid." });
    const result = await readProfile(parsed.data.deviceToken, rpc);
    if (result.response) return result.response;
    return jsonResponse(200, {
      status: "ok",
      displayName: result.profile.display_name,
      avatar: result.profile.avatar,
      timezone: result.profile.timezone,
      usageDate: result.profile.usage_date,
      goalMinutes: result.profile.goal_minutes,
    });
  }

  if (pathname === "/api/android/child-space/today") {
    const parsed = childSpaceInput.safeParse(body);
    if (!parsed.success) return jsonResponse(400, { error: "Child Space request is invalid." });
    const result = await callChildSpaceRpc(parsed.data.deviceToken, rpc);
    if ("response" in result) return result.response;
    return jsonResponse(200, {
      status: "ok",
      usageDate: result.data.usage_date,
      mood: result.data.mood,
    });
  }

  if (pathname === "/api/android/child-space/activities") {
    const parsed = childSpaceInput.safeParse(body);
    if (!parsed.success) return jsonResponse(400, { error: "Child Space request is invalid." });
    const result = await callChildSpaceRpc(parsed.data.deviceToken, rpc);
    if ("response" in result) return result.response;
    return jsonResponse(200, {
      status: "ok",
      activities: result.data.activities,
    });
  }

  if (pathname === "/api/android/child-space/mood") {
    const parsed = moodInput.safeParse(body);
    if (!parsed.success) return jsonResponse(400, { error: "Mood check-in is invalid." });
    const deviceTokenHash = await sha256Hex(parsed.data.deviceToken);
    const result = await callChildSpaceWriteRpc("Mood save", () =>
      rpc.saveMood({ p_device_token_hash: deviceTokenHash, p_mood: parsed.data.mood }),
    );
    if ("response" in result) return result.response;
    return jsonResponse(200, { status: result.status, usageDate: result.usage_date });
  }

  if (pathname === "/api/android/child-space/activities/complete") {
    const parsed = activityCompletionInput.safeParse(body);
    if (!parsed.success) {
      return jsonResponse(400, { error: "Activity completion request is invalid." });
    }
    const deviceTokenHash = await sha256Hex(parsed.data.deviceToken);
    const result = await callChildSpaceWriteRpc("Activity completion", () =>
      rpc.completeActivity({
        p_device_token_hash: deviceTokenHash,
        p_activity_key: parsed.data.activityKey,
      }),
    );
    if ("response" in result) return result.response;
    return jsonResponse(200, { status: result.status, usageDate: result.usage_date });
  }

  const parsed = snapshotInput.safeParse(body);
  if (!parsed.success) return jsonResponse(400, { error: "Usage snapshot is invalid." });
  const totalMinutes = parsed.data.apps.reduce((total, app) => total + app.duration_minutes, 0);
  if (totalMinutes > 1440) return jsonResponse(400, { error: "Usage snapshot exceeds one day." });
  if (new TextEncoder().encode(JSON.stringify(parsed.data.apps)).byteLength > 65_536) {
    return jsonResponse(413, { error: "Usage snapshot is too large." });
  }

  const profileResult = await readProfile(parsed.data.deviceToken, rpc);
  if (profileResult.response) return profileResult.response;
  if (parsed.data.usageDate !== profileResult.profile.usage_date) {
    return jsonResponse(409, {
      status: "usage_day_changed",
      error: "The usage day changed. Refresh and try again.",
    });
  }

  const deviceTokenHash = await sha256Hex(parsed.data.deviceToken);
  const issueRequestHash = await sha256Hex(parsed.data.issueRequestToken);
  const ticketHash = await sha256Hex(parsed.data.ticketToken);
  const issueArgs: IssueSnapshotArgs = {
    p_device_token_hash: deviceTokenHash,
    p_issue_request_hash: issueRequestHash,
    p_ticket_key_id: "android-usage-v1",
    p_ticket_hash: null,
  };

  let issueResult: RpcResult | null;
  try {
    issueResult = await rpc.issue(issueArgs);
  } catch {
    issueResult = null;
  }
  if (!issueResult || issueResult.error) {
    console.error("[Android usage] Ticket RPC failed", issueResult?.error?.code ?? "network error");
    return jsonResponse(503, { error: "Usage could not be uploaded. Try again." });
  }

  let issue = z
    .object({ status: z.string(), usage_date: z.string().optional() })
    .safeParse(issueResult.data);
  if (!issue.success) {
    console.error("[Android usage] Ticket RPC returned an invalid response");
    return jsonResponse(503, { error: "Usage could not be uploaded. Try again." });
  }
  if (issue.data.usage_date && issue.data.usage_date !== parsed.data.usageDate) {
    return jsonResponse(409, {
      status: "usage_day_changed",
      error: "The usage day changed. Refresh and try again.",
    });
  }

  if (issue.data.status === "preparing") {
    try {
      issueResult = await rpc.issue({ ...issueArgs, p_ticket_hash: ticketHash });
    } catch {
      issueResult = null;
    }
    if (!issueResult || issueResult.error) {
      console.error(
        "[Android usage] Ticket finalization failed",
        issueResult?.error?.code ?? "network error",
      );
      return jsonResponse(503, { error: "Usage could not be uploaded. Try again." });
    }
    issue = z
      .object({ status: z.string(), usage_date: z.string().optional() })
      .safeParse(issueResult.data);
    if (!issue.success) {
      console.error("[Android usage] Ticket RPC returned an invalid response");
      return jsonResponse(503, { error: "Usage could not be uploaded. Try again." });
    }
    if (issue.data.usage_date && issue.data.usage_date !== parsed.data.usageDate) {
      return jsonResponse(409, {
        status: "usage_day_changed",
        error: "The usage day changed. Refresh and try again.",
      });
    }
  }

  if (issue.data.status === "already_accepted") {
    return jsonResponse(200, { status: "accepted", retry: true });
  }
  if (issue.data.status !== "outstanding") {
    return jsonResponse(statusCode(issue.data.status), {
      status: issue.data.status,
      error: "Usage could not be uploaded. Refresh and try again.",
    });
  }

  let ingestResult: RpcResult | null;
  try {
    ingestResult = await rpc.ingest({
      p_device_token_hash: deviceTokenHash,
      p_ticket_hash: ticketHash,
      p_apps: parsed.data.apps,
    });
  } catch {
    ingestResult = null;
  }
  if (!ingestResult || ingestResult.error) {
    console.error(
      "[Android usage] Snapshot RPC failed",
      ingestResult?.error?.code ?? "network error",
    );
    return jsonResponse(503, { error: "Usage could not be uploaded. Try again." });
  }

  const ingested = z
    .object({ status: z.string(), retry: z.boolean().optional() })
    .safeParse(ingestResult.data);
  if (!ingested.success) {
    console.error("[Android usage] Snapshot RPC returned an invalid response");
    return jsonResponse(503, { error: "Usage could not be uploaded. Try again." });
  }
  const status = ingested.data.status === "already_accepted" ? "accepted" : ingested.data.status;
  return jsonResponse(statusCode(status), {
    status,
    retry: ingested.data.retry ?? false,
    error:
      status === "accepted" ? undefined : "Usage could not be uploaded. Refresh and try again.",
  });
}
