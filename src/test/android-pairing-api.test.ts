import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  handleAndroidPairingRequest,
  type AndroidPairingRpc,
} from "@/lib/android-pairing.api.server";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const response = (status: string) => ({ data: { status, retry: false }, error: null });

function rpcStub(): AndroidPairingRpc {
  return {
    redeem: vi.fn(async () => response("ok")),
    activate: vi.fn(async () => response("ok")),
  };
}

function post(path: string, body: unknown) {
  return new Request(`https://sotiria.example${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Android pairing Worker API", () => {
  it("hashes the one-time pairing token and never returns it", async () => {
    const rpc = rpcStub();
    const pairingToken = "A".repeat(43);
    const result = await handleAndroidPairingRequest(
      post("/api/android/pairing/redeem", {
        pairingToken,
        pendingTokenHash: "b".repeat(64),
        credentialKeyId: "android-keystore-v1",
        deviceName: "Sotiria phone",
      }),
      rpc,
    );

    expect(rpc.redeem).toHaveBeenCalledWith({
      p_pairing_hash: hash(pairingToken),
      p_pending_token_hash: "b".repeat(64),
      p_credential_key_id: "android-keystore-v1",
      p_device_name: "Sotiria phone",
    });
    const body = await result?.json();
    expect(body).toEqual({ status: "ok", retry: false });
    expect(JSON.stringify(body)).not.toContain(pairingToken);
  });

  it("rejects a caller-supplied child ID and unknown request fields", async () => {
    const rpc = rpcStub();
    const result = await handleAndroidPairingRequest(
      post("/api/android/pairing/redeem", {
        pairingToken: "A".repeat(43),
        pendingTokenHash: "b".repeat(64),
        credentialKeyId: "android-keystore-v1",
        deviceName: "Sotiria phone",
        childId: "00000000-0000-0000-0000-000000000001",
      }),
      rpc,
    );

    expect(result?.status).toBe(400);
    expect(rpc.redeem).not.toHaveBeenCalled();
  });

  it("activates using only pending and device credential hashes", async () => {
    const rpc = rpcStub();
    const result = await handleAndroidPairingRequest(
      post("/api/android/pairing/activate", {
        pendingTokenHash: "b".repeat(64),
        deviceTokenHash: "c".repeat(64),
      }),
      rpc,
    );

    expect(rpc.activate).toHaveBeenCalledWith({
      p_pending_token_hash: "b".repeat(64),
      p_device_token_hash: "c".repeat(64),
    });
    expect(result?.status).toBe(200);
  });

  it("does not execute pairing RPCs for non-HTTPS requests or unsupported methods", async () => {
    const rpc = rpcStub();
    const httpRequest = new Request("http://sotiria.example/api/android/pairing/redeem", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const methodRequest = new Request("https://sotiria.example/api/android/pairing/redeem");

    expect((await handleAndroidPairingRequest(httpRequest, rpc))?.status).toBe(400);
    expect((await handleAndroidPairingRequest(methodRequest, rpc))?.status).toBe(405);
    expect(rpc.redeem).not.toHaveBeenCalled();
  });
});
