import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

const usageSync = source("android-companion/app/src/main/java/com/sotiria/companion/UsageSync.kt");
const credentialStore = source(
  "android-companion/app/src/main/java/com/sotiria/companion/PairingCredentialStore.kt",
);
const childExperienceMigration = source(
  "supabase/migrations/20261120090000_android_child_experience.sql",
);
const androidDeviceApi = source("src/lib/android-device.api.server.ts");
const mainActivity = source("android-companion/app/src/main/java/com/sotiria/companion/MainActivity.kt");

function functionBody(contents: string, start: string, end: string) {
  const startIndex = contents.indexOf(start);
  const endIndex = contents.indexOf(end, startIndex + start.length);
  return startIndex < 0 || endIndex < 0 ? "" : contents.slice(startIndex, endIndex);
}

describe("Android pending usage recovery contracts", () => {
  const refresh = functionBody(
    usageSync,
    "fun refreshDashboard(): ChildDashboardData",
    "\n    private fun upload(",
  );
  const uploadState = functionBody(
    usageSync,
    "private fun uploadState(",
    "\n    private fun recoverableUsageDates()",
  );
  const savePending = functionBody(
    credentialStore,
    "fun savePendingUsageUpload(",
    "\n    @Synchronized\n    fun archivePendingUsageUpload(",
  );
  const archivePending = functionBody(
    credentialStore,
    "fun archivePendingUsageUpload(",
    "\n    @Synchronized\n    fun loadRecoverableUsageSnapshots()",
  );

  it("retries a same-day pending snapshot without replacing its payload", () => {
    const pendingBranch = functionBody(
      refresh,
      "if (pendingUpload != null)",
      "\n\n        val usageAccessGranted = reader.hasUsageAccess()",
    );
    expect(pendingBranch).toContain("pendingUpload.usageDate != profile.usageDate");
    expect(pendingBranch).toMatch(
      /else\s*\{\s*pendingUploadSynced = uploadState\(deviceToken, pendingUpload\)/,
    );
    expect(savePending).toContain(
      "existing.usageDate != upload.usageDate || existing.apps != upload.apps",
    );
  });

  it("rejects excess app summaries before allocating or uploading them", () => {
    const rounding = functionBody(usageSync, "internal fun roundUsageApps(", "\nclass UsageSync");
    const limitCheck = rounding.indexOf("summaries.size > MAX_APPS");
    const allocation = rounding.indexOf("val wholeMinutes");
    expect(limitCheck).toBeGreaterThanOrEqual(0);
    expect(allocation).toBeGreaterThan(limitCheck);
    expect(refresh).not.toContain(".take(MAX_APPS)");
    expect(rounding).toContain("UsageValidationException");
  });

  it("displays the accepted pending apps rather than a newer unsent collection", () => {
    const acceptedPendingApps = functionBody(
      refresh,
      "val acceptedPendingApps =",
      "\n        val apps = acceptedPendingApps",
    );
    const displayedApps = functionBody(
      refresh,
      "val apps = acceptedPendingApps",
      "\n        val totalMinutes =",
    );
    expect(acceptedPendingApps).toContain("pendingUploadSynced");
    expect(acceptedPendingApps).toContain("pendingUpload?.apps");
    expect(acceptedPendingApps).toContain("isSafeSnapshotForDisplay");
    expect(displayedApps).toContain("reader.readForDay");
    expect(displayedApps).toContain("roundUsageApps(summaries)");
    expect(refresh).toContain("Current usage is not synced.");
    expect(refresh.indexOf("pendingUpload?.apps")).toBeLessThan(
      refresh.indexOf("reader.readForDay"),
    );
  });

  it("uses explicit Usage Access state and avoids presenting unavailable usage as zero", () => {
    const renderUsage = functionBody(
      mainActivity,
      "private fun renderUsage(",
      "\n    private fun confirmDiscardRecoverableUsageSnapshots()",
    );
    expect(usageSync).toMatch(/usageAccessGranted:\s*Boolean/);
    expect(refresh).toMatch(/reader\.hasUsageAccess\(\)/);
    expect(refresh).toContain("usageAccessUnavailableData");
    expect(refresh).toContain("catch (error: SecurityException)");
    expect(refresh).toContain("if (!reader.hasUsageAccess())");
    expect(refresh).toContain("throw error");
    expect(refresh).not.toContain("clearPairedDevice");
    expect(renderUsage).toContain("val usageAccessGranted = data.usageAccessGranted");
    expect(renderUsage).not.toContain('data.syncMessage != "Enable Usage Access');
    expect(renderUsage).toContain(
      'screenTimeTotal.text = if (usageAccessGranted) formatMinutes(totalMinutes.toDouble()) else "—"',
    );
    expect(renderUsage).toContain("Enable Usage Access to see progress.");
  });

  it("archives a stale-date snapshot before creating a current-date upload", () => {
    expect(refresh).toContain("UsageUploadRecoveryReason.REPORTING_DATE_CHANGED");
    expect(refresh.indexOf("archivePendingUsageUpload")).toBeLessThan(
      refresh.indexOf("upload(deviceToken, profile, apps)"),
    );
    expect(archivePending).toContain("recoverable + RecoverableUsageSnapshot");
    expect(archivePending).toContain("removePendingUsageUpload(editor)");
  });

  it("persists the one-time ticket renewal across refreshes", () => {
    expect(uploadState).toContain("repeat(2)");
    expect(uploadState).toContain('"ticket_expired" -> UsageUploadRecoveryReason.TICKET_EXPIRED');
    expect(uploadState).toContain(
      '"ticket_issue_expired" -> UsageUploadRecoveryReason.TICKET_ISSUE_EXPIRED',
    );
    expect(uploadState).toContain("if (!state.renewalAttempted)");
    expect(uploadState).toContain("renewalAttempted = true");
    expect(credentialStore).toContain('"renewal_attempted", upload.renewalAttempted');
    expect(credentialStore).toContain(
      'snapshotObject.optBoolean("renewal_attempted", false)',
    );
    expect(uploadState).toContain("credentials.savePendingUsageUpload(state)");
  });

  it("archives repeated terminal ticket failures instead of retrying them on every refresh", () => {
    expect(uploadState).toContain("credentials.archivePendingUsageUpload(state, recoveryReason)");
    expect(uploadState).toContain("return false");
    expect(uploadState).toContain('"payload_conflict"');
    expect(uploadState).toContain('"collection_window_closed"');
    expect(archivePending).toContain("removePendingUsageUpload(editor)");
    expect(refresh).toContain("it.usageDate == profile.usageDate");
    expect(refresh).toContain("it.reason in setOf(");
    expect(refresh).toContain(
      "Today’s upload is saved for recovery and will not be retried automatically.",
    );
    const pendingLoader = functionBody(
      credentialStore,
      "fun loadPendingUsageUpload()",
      "\n    @Synchronized\n    fun savePendingUsageUpload(",
    );
    expect(pendingLoader).not.toContain("USAGE_RECOVERY_SNAPSHOTS");
  });

  it("caps the encrypted archive without silently deleting existing snapshots", () => {
    expect(credentialStore).toContain("MAX_RECOVERABLE_USAGE_SNAPSHOTS = 20");
    expect(credentialStore).toContain("MAX_RECOVERABLE_ARCHIVE_BYTES = 512 * 1024");
    expect(credentialStore).toContain("throw RecoveryArchiveFullException()");
    expect(credentialStore).toContain(
      "encrypted.toByteArray(Charsets.UTF_8).size > MAX_RECOVERABLE_ARCHIVE_BYTES",
    );
    expect(archivePending).toContain("recoverable + RecoverableUsageSnapshot");
    expect(archivePending).not.toContain("takeLast");
    expect(refresh).toContain("catch (_: RecoveryArchiveFullException)");
    expect(refresh).toContain("archiveBlocked = true");
  });

  it("routes terminal ticket-state responses into local recovery", () => {
    const statusCode = functionBody(
      androidDeviceApi,
      "function statusCode(status: string)",
      "\n}\n\nasync function readProfile",
    );
    expect(statusCode).toContain('case "invalid_ticket":');
    expect(statusCode).toContain('case "ticket_not_ready":');
    expect(statusCode).toContain('case "ticket_not_prepared":');
    expect(statusCode).toContain("return 409;");
    expect(uploadState).toContain('"invalid_ticket"');
    expect(uploadState).toContain('"ticket_not_ready"');
    expect(uploadState).toContain('"ticket_not_prepared"');
  });

  it("preserves the pending snapshot across network and retryable server failures", () => {
    const upload = functionBody(usageSync, "private fun upload(", "\n    private fun uploadState(");
    expect(upload.indexOf("credentials.savePendingUsageUpload(state)")).toBeLessThan(
      upload.indexOf("uploadState(deviceToken, state)"),
    );
    expect(uploadState).toContain("catch (error: PairingApiException)");
    expect(uploadState).not.toContain("catch (error: IOException)");
  });

  it("uploads fresh data using the server profile date after archiving a stale snapshot", () => {
    const upload = functionBody(usageSync, "private fun upload(", "\n    private fun uploadState(");
    expect(upload).toContain("newUploadState(profile.usageDate, apps)");
    expect(upload).toContain("credentials.savePendingUsageUpload(state)");
  });

  it("keeps terminal recovery data encrypted and exposes an explicit local discard action", () => {
    expect(credentialStore).toContain("USAGE_RECOVERY_SNAPSHOTS");
    expect(credentialStore).toContain("encrypt(json.toString())");
    expect(credentialStore).toContain("fun clearRecoverableUsageSnapshots()");
    expect(mainActivity).toContain("confirmDiscardRecoverableUsageSnapshots()");
    expect(mainActivity).toContain("permanently removes archived unsent snapshots");
    expect(mainActivity).toContain("Usage already accepted by the server will not be changed.");
  });

  it("archives a pending snapshot when confirmed device authorization is lost", () => {
    const clearDevice = functionBody(
      credentialStore,
      "fun clearPairedDevice()",
      "\n    @Synchronized\n    fun loadPendingUsageUpload()",
    );
    expect(clearDevice).toContain("UsageUploadRecoveryReason.DEVICE_AUTHORIZATION_LOST");
    expect(clearDevice).toContain(".remove(DEVICE_TOKEN)");
    expect(clearDevice).toContain("            archived");
    expect(usageSync).toContain('"invalid_device" ||');
    expect(usageSync).toContain('"device_revoked" ||');
    expect(usageSync).toContain('"child_inactive"');
  });

  it("retains the existing database rollback protections for failed replacement", () => {
    const issueWrapper = functionBody(
      childExperienceMigration,
      "CREATE OR REPLACE FUNCTION public.issue_android_child_usage_snapshot(",
      "CREATE OR REPLACE FUNCTION public.ingest_android_child_usage_snapshot(",
    );
    const ingestWrapper = functionBody(
      childExperienceMigration,
      "CREATE OR REPLACE FUNCTION public.ingest_android_child_usage_snapshot(",
      "CREATE OR REPLACE FUNCTION public.get_parent_android_device_overview(",
    );
    expect(issueWrapper).toContain("GET DIAGNOSTICS v_restored_rows = ROW_COUNT");
    expect(issueWrapper).toContain("IF v_restored_rows <> 1 THEN");
    expect(issueWrapper).toContain(
      "RAISE EXCEPTION 'Accepted usage snapshot could not be restored'",
    );
    expect(ingestWrapper).toContain("IF v_result->>'status' IS DISTINCT FROM 'accepted' THEN");
    expect(ingestWrapper).toContain("WHEN SQLSTATE 'Z0001' THEN");
  });
});
