import { cleanup, fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FamilyManagement } from "@/components/sotiria/family";

const mocks = vi.hoisted(() => ({
  childId: "00000000-0000-4000-8000-000000000001",
  pairingId: "00000000-0000-4000-8000-000000000002",
  createPairing: vi.fn(),
  getPairingStatus: vi.fn(),
  identity: {
    familyData: {
      family: { id: "00000000-0000-4000-8000-000000000003", name: "Test family" },
      children: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          display_name: "Mia",
          avatar: "🌱",
          is_active: true,
        },
      ],
    },
    selected: "00000000-0000-4000-8000-000000000001",
    selectChild: vi.fn(),
    user: { user_metadata: {} },
  },
  navigate: vi.fn(),
}));

const { childId, pairingId } = mocks;
const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

vi.mock("@/components/identity-provider", () => ({
  useIdentity: () => mocks.identity,
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/lib/identity.functions", () => ({
  createChildDevicePairing: mocks.createPairing,
  getChildDevicePairingStatus: mocks.getPairingStatus,
  openChildPicker: vi.fn(),
  saveChildProfile: vi.fn(),
  saveParentProfile: vi.fn(),
  setupFamily: vi.fn(),
}));

vi.mock("@/components/sotiria/common", () => ({
  Panel: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
}));

function renderFamily() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <FamilyManagement />
    </QueryClientProvider>,
  );
  return queryClient;
}

function connectButton() {
  return screen.getByRole("button", { name: /connect phone/i });
}

function pairingCode() {
  return screen.getByText(/^[A-Za-z0-9_-]{43}$/);
}

describe("parent Android pairing UI", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", webcrypto);
    mocks.createPairing.mockResolvedValue({
      status: "ok",
      pairingId,
      expiresAt,
      reportingTimezone: "UTC",
    });
    mocks.getPairingStatus.mockResolvedValue({
      status: "pending",
      device_name: null,
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("shows a code only after creation succeeds and keeps it through redeemed status until expiry", async () => {
    let status: "pending" | "redeemed" | "expired" = "pending";
    let resolveCreation!: (result: {
      status: "ok";
      pairingId: string;
      expiresAt: string;
      reportingTimezone: string;
    }) => void;
    mocks.createPairing.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreation = resolve;
        }),
    );
    mocks.getPairingStatus.mockImplementation(async () => ({
      status,
      device_name: null,
    }));
    const queryClient = renderFamily();

    fireEvent.click(connectButton());
    await waitFor(() => expect(mocks.createPairing).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Creating a secure pairing…")).toBeInTheDocument();
    expect(screen.queryByText(/^[A-Za-z0-9_-]{43}$/)).not.toBeInTheDocument();
    await act(async () => {
      resolveCreation({
        status: "ok",
        pairingId,
        expiresAt,
        reportingTimezone: "UTC",
      });
    });
    await screen.findByText("Waiting for the Android phone to use this code…");
    const code = pairingCode();
    expect(code).toBeInTheDocument();

    status = "redeemed";
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: ["android-pairing-status", childId, pairingId],
      });
    });
    expect(
      await screen.findByText("The phone is verifying its secure credential…"),
    ).toBeInTheDocument();
    expect(pairingCode()).toBeInTheDocument();

    status = "expired";
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: ["android-pairing-status", childId, pairingId],
      });
    });
    await waitFor(() => expect(screen.queryByText(/^[A-Za-z0-9_-]{43}$/)).not.toBeInTheDocument());
    expect(screen.getByText("This pairing code is no longer active.")).toBeInTheDocument();
  });

  it("coalesces connect events dispatched before React can rerender", async () => {
    const queryClient = renderFamily();
    const button = connectButton();

    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitFor(() => expect(mocks.createPairing).toHaveBeenCalledTimes(1));
    await screen.findByText("Waiting for the Android phone to use this code…");
    expect(pairingCode()).toBeInTheDocument();
    queryClient.clear();
  });

  it("does not display or regenerate a code while another pairing is open", async () => {
    mocks.createPairing.mockResolvedValue({
      status: "pairing_open",
      expiresAt,
    });
    renderFamily();
    const button = connectButton();

    fireEvent.click(button);
    await screen.findByText(/Its code cannot be recovered here/);
    expect(screen.queryByText(/^[A-Za-z0-9_-]{43}$/)).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(mocks.createPairing).toHaveBeenCalledTimes(1);
  });

  it("keeps the accepted code until activation succeeds", async () => {
    mocks.getPairingStatus.mockResolvedValue({
      status: "activated",
      device_name: "Mia’s phone",
    });
    renderFamily();

    fireEvent.click(connectButton());
    expect(await screen.findByText("Phone paired successfully: Mia’s phone.")).toBeInTheDocument();
    expect(screen.queryByText(/^[A-Za-z0-9_-]{43}$/)).not.toBeInTheDocument();
  });
});
