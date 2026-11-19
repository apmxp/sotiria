import { z } from "zod";

type RedeemArgs = {
  p_pairing_hash: string;
  p_pending_token_hash: string;
  p_credential_key_id: string;
  p_device_name: string;
};

type ActivateArgs = {
  p_pending_token_hash: string;
  p_device_token_hash: string;
};

type RpcResult = {
  data: unknown;
  error: { code?: string } | null;
};

export type AndroidPairingRpc = {
  redeem: (args: RedeemArgs) => PromiseLike<RpcResult>;
  activate: (args: ActivateArgs) => PromiseLike<RpcResult>;
};

const redeemInput = z
  .object({
    pairingToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    pendingTokenHash: z.string().regex(/^[0-9a-f]{64}$/),
    credentialKeyId: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/),
    deviceName: z.string().trim().min(1).max(80),
  })
  .strict();

const activateInput = z
  .object({
    pendingTokenHash: z.string().regex(/^[0-9a-f]{64}$/),
    deviceTokenHash: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

const rpcResult = z.object({
  status: z.string(),
  retry: z.boolean().optional(),
});

function jsonResponse(status: number, body: Record<string, unknown>) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function readJson(request: Request): Promise<unknown | Response> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return jsonResponse(415, { error: "JSON is required." });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 4096) {
    return jsonResponse(413, { error: "Request is too large." });
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return jsonResponse(400, { error: "Request body is invalid." });
  }

  if (text.length > 4096) return jsonResponse(413, { error: "Request is too large." });
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
      return 200;
    case "invalid_pairing":
    case "invalid_pending_credential":
      return 401;
    case "pairing_expired":
      return 410;
    case "child_inactive":
    case "pairing_unavailable":
    case "device_revoked":
      return 409;
    default:
      return 503;
  }
}

export async function handleAndroidPairingRequest(
  request: Request,
  rpc: AndroidPairingRpc,
): Promise<Response | null> {
  const { pathname, protocol, hostname } = new URL(request.url);
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";
  if (pathname !== "/api/android/pairing/redeem" && pathname !== "/api/android/pairing/activate") {
    return null;
  }

  if (protocol !== "https:" && !isLocalHost) {
    return jsonResponse(400, { error: "HTTPS is required." });
  }
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "POST is required." });
  }

  const body = await readJson(request);
  if (body instanceof Response) return body;

  if (pathname === "/api/android/pairing/redeem") {
    const parsed = redeemInput.safeParse(body);
    if (!parsed.success) return jsonResponse(400, { error: "Pairing request is invalid." });

    let result: RpcResult | null;
    try {
      result = await rpc.redeem({
        p_pairing_hash: await sha256Hex(parsed.data.pairingToken),
        p_pending_token_hash: parsed.data.pendingTokenHash,
        p_credential_key_id: parsed.data.credentialKeyId,
        p_device_name: parsed.data.deviceName,
      });
    } catch {
      result = null;
    }

    if (!result || result.error) {
      console.error(
        "[Android pairing] Redemption RPC failed",
        result?.error?.code ?? "network error",
      );
      return jsonResponse(503, { error: "Pairing could not be completed. Try again." });
    }

    const response = rpcResult.safeParse(result.data);
    if (!response.success) {
      console.error("[Android pairing] Redemption RPC returned an invalid response");
      return jsonResponse(503, { error: "Pairing could not be completed. Try again." });
    }
    return jsonResponse(statusCode(response.data.status), {
      status: response.data.status,
      retry: response.data.retry ?? false,
    });
  }

  const parsed = activateInput.safeParse(body);
  if (!parsed.success) return jsonResponse(400, { error: "Activation request is invalid." });

  let result: RpcResult | null;
  try {
    result = await rpc.activate({
      p_pending_token_hash: parsed.data.pendingTokenHash,
      p_device_token_hash: parsed.data.deviceTokenHash,
    });
  } catch {
    result = null;
  }

  if (!result || result.error) {
    console.error(
      "[Android pairing] Activation RPC failed",
      result?.error?.code ?? "network error",
    );
    return jsonResponse(503, { error: "Phone activation could not be completed. Try again." });
  }

  const response = rpcResult.safeParse(result.data);
  if (!response.success) {
    console.error("[Android pairing] Activation RPC returned an invalid response");
    return jsonResponse(503, { error: "Phone activation could not be completed. Try again." });
  }
  return jsonResponse(statusCode(response.data.status), {
    status: response.data.status,
    retry: response.data.retry ?? false,
  });
}
