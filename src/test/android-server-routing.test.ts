import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AndroidDeviceRpc } from "@/lib/android-device.api.server";

const mocks = vi.hoisted(() => ({
  handleAndroidPairingRequest: vi.fn(),
  handleAndroidDeviceRequest: vi.fn(),
  supabaseRpc: vi.fn(),
  ssrFetch: vi.fn(),
}));

vi.mock("../lib/android-pairing.api.server", () => ({
  handleAndroidPairingRequest: mocks.handleAndroidPairingRequest,
}));

vi.mock("../lib/android-device.api.server", () => ({
  handleAndroidDeviceRequest: mocks.handleAndroidDeviceRequest,
}));

vi.mock("../integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: mocks.supabaseRpc },
}));

vi.mock("@tanstack/react-start/server-entry", () => ({
  default: { fetch: mocks.ssrFetch },
}));

import server from "../server";

const deviceTokenHash = "a".repeat(64);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.handleAndroidPairingRequest.mockResolvedValue(null);
  mocks.handleAndroidDeviceRequest.mockImplementation(
    async (request: Request, rpc: AndroidDeviceRpc) => {
      if (new URL(request.url).pathname === "/api/android/device/profile") {
        await rpc.profile({ p_device_token_hash: deviceTokenHash });
      } else {
        await rpc.issue({
          p_device_token_hash: deviceTokenHash,
          p_issue_request_hash: "b".repeat(64),
          p_ticket_key_id: "android-keystore-v1",
          p_ticket_hash: null,
        });
        await rpc.ingest({
          p_device_token_hash: deviceTokenHash,
          p_ticket_hash: "c".repeat(64),
          p_apps: [],
        });
      }
      return Response.json({ handled: "device" });
    },
  );
  mocks.supabaseRpc.mockResolvedValue({ data: { status: "ok" }, error: null });
  mocks.ssrFetch.mockResolvedValue(Response.json({ handled: "ssr" }));
});

describe("Android Worker routing", () => {
  it.each(["/api/android/device/profile", "/api/android/usage/snapshot"])(
    "intercepts %s before SSR and wires its Supabase RPCs",
    async (path) => {
      const response = await server.fetch(
        new Request(`https://sotiria.example${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        }),
        {} as Env,
        {},
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ handled: "device" });
      expect(mocks.handleAndroidDeviceRequest).toHaveBeenCalledOnce();
      expect(mocks.ssrFetch).not.toHaveBeenCalled();

      const rpcNames = mocks.supabaseRpc.mock.calls.map(([name]) => name);
      if (path.endsWith("/profile")) {
        expect(rpcNames).toContain("get_android_child_device_profile");
      } else {
        expect(rpcNames).toContain("issue_android_child_usage_snapshot");
        expect(rpcNames).toContain("ingest_android_child_usage_snapshot");
      }
    },
  );

  it.each(["/api/android/pairing/redeem", "/api/android/pairing/activate"])(
    "keeps %s on the pairing handler",
    async (path) => {
      mocks.handleAndroidPairingRequest.mockResolvedValue(Response.json({ handled: "pairing" }));

      const response = await server.fetch(
        new Request(`https://sotiria.example${path}`, { method: "POST" }),
        {} as Env,
        {},
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ handled: "pairing" });
      expect(mocks.handleAndroidPairingRequest).toHaveBeenCalledOnce();
      expect(mocks.handleAndroidDeviceRequest).not.toHaveBeenCalled();
      expect(mocks.ssrFetch).not.toHaveBeenCalled();
    },
  );
});
