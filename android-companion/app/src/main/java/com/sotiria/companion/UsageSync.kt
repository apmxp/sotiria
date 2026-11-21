package com.sotiria.companion

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.math.floor
import kotlin.math.roundToInt

data class ChildDashboardData(
    val profile: DeviceProfile,
    val apps: List<DeviceUsageApp>,
    val syncMessage: String,
    val usageAccessGranted: Boolean,
    val recoverableUsageDates: List<String> = emptyList()
)

internal class UsageValidationException(message: String) : IOException(message)

private const val MAX_APPS = 200
private const val MINUTES_PER_DAY = 1440

internal fun roundUsageApps(summaries: List<AppUsageSummary>): List<DeviceUsageApp> {
    if (summaries.size > MAX_APPS) {
        throw UsageValidationException(
            "Usage includes more than $MAX_APPS apps. No app usage was omitted or uploaded."
        )
    }

    val totalDuration = summaries.fold(0.0) { total, summary ->
        val duration = summary.durationMinutes
        if (!duration.isFinite() || duration < 0.0) {
            throw UsageValidationException("Android reported invalid app usage. Usage was not uploaded.")
        }
        total + duration
    }
    if (!totalDuration.isFinite() || totalDuration > MINUTES_PER_DAY.toDouble()) {
        throw UsageValidationException("Android reported more than 24 hours of app use. Usage was not uploaded.")
    }

    val wholeMinutes = summaries.map { floor(it.durationMinutes).toInt() }
    val minutesToAllocate = totalDuration.roundToInt() - wholeMinutes.sum()
    if (minutesToAllocate !in 0..summaries.size) {
        throw UsageValidationException("Android app usage could not be rounded safely. Usage was not uploaded.")
    }

    // Allocate aggregate rounding remainder to the largest fractional app durations.
    val remainderIndexes = summaries.indices
        .sortedWith(
            compareByDescending<Int> { summaries[it].durationMinutes - wholeMinutes[it] }
                .thenBy { it }
        )
        .take(minutesToAllocate)
        .toSet()

    return summaries.mapIndexedNotNull { index, summary ->
        val minutes = wholeMinutes[index] + if (index in remainderIndexes) 1 else 0
        if (minutes == 0) {
            null
        } else {
            DeviceUsageApp(
                packageName = summary.packageName,
                displayName = summary.displayName,
                category = summary.category,
                durationMinutes = minutes
            )
        }
    }
}

class UsageSync(private val context: Context) {
    private val credentials = PairingCredentialStore(context)
    private val api = PairingApiClient()
    private val reader = UsageSummaryReader(context)

    fun refreshDashboard(): ChildDashboardData {
        val deviceToken = credentials.loadDeviceToken()
            ?: throw PairingApiException("invalid_device")
        val profile = try {
            api.profile(deviceToken)
        } catch (error: PairingApiException) {
            clearIfUnauthorized(error)
            throw error
        }

        val pendingUpload = credentials.loadPendingUsageUpload()
        var pendingUploadSynced = false
        var archiveBlocked = false
        if (pendingUpload != null) {
            try {
                if (pendingUpload.usageDate != profile.usageDate) {
                    credentials.archivePendingUsageUpload(
                        pendingUpload,
                        UsageUploadRecoveryReason.REPORTING_DATE_CHANGED
                    )
                } else {
                    pendingUploadSynced = uploadState(deviceToken, pendingUpload)
                }
            } catch (_: RecoveryArchiveFullException) {
                archiveBlocked = true
            }
        }
        val terminalUploadForToday = credentials.loadRecoverableUsageSnapshots().any {
            it.usageDate == profile.usageDate &&
                it.reason in setOf(
                    UsageUploadRecoveryReason.TICKET_EXPIRED,
                UsageUploadRecoveryReason.TICKET_ISSUE_EXPIRED,
                UsageUploadRecoveryReason.SERVER_REJECTED
                )
        }

        val usageAccessGranted = reader.hasUsageAccess()
        if (!usageAccessGranted) {
            return usageAccessUnavailableData(profile, archiveBlocked, pendingUploadSynced)
        }

        val acceptedPendingApps = if (pendingUploadSynced) {
            pendingUpload?.apps?.takeIf(::isSafeSnapshotForDisplay)
                ?: throw UsageValidationException(
                    "The saved snapshot was accepted, but its app data cannot be displayed safely. " +
                        "Current usage is not synced."
                )
        } else {
            null
        }
        val apps = acceptedPendingApps ?: run {
            val summaries = try {
                reader.readForDay(profile.usageDate, profile.timezone)
            } catch (error: SecurityException) {
                if (!reader.hasUsageAccess()) {
                    return usageAccessUnavailableData(profile, archiveBlocked, pendingUploadSynced)
                }
                throw error
            }
            roundUsageApps(summaries)
        }
        val totalMinutes = apps.sumOf { it.durationMinutes.toLong() }
        if (totalMinutes > MINUTES_PER_DAY) {
            throw UsageValidationException("Android reported more than 24 hours of app use. Usage was not uploaded.")
        }

        val uploadMessage = when {
            pendingUploadSynced -> "Saved usage snapshot synced securely."
            archiveBlocked ->
                "A saved usage snapshot remains encrypted on this phone. Discard archived snapshots to make room for recovery."
            terminalUploadForToday ->
                "Today’s upload is saved for recovery and will not be retried automatically. Resolve the saved snapshot to try again."
            else -> try {
                upload(deviceToken, profile, apps)
            } catch (_: RecoveryArchiveFullException) {
                archiveBlocked = true
                "A saved usage snapshot remains encrypted on this phone. Discard archived snapshots to make room for recovery."
            }
        }
        return ChildDashboardData(
            profile = profile,
            apps = apps,
            syncMessage = uploadMessage,
            usageAccessGranted = true,
            recoverableUsageDates = recoverableUsageDates()
        )
    }

    private fun usageAccessUnavailableData(
        profile: DeviceProfile,
        archiveBlocked: Boolean,
        pendingUploadSynced: Boolean
    ) = ChildDashboardData(
        profile = profile,
        apps = emptyList(),
        syncMessage = if (archiveBlocked) {
            "A saved usage snapshot remains encrypted on this phone. Discard archived snapshots to make room for recovery. " +
                "Enable Usage Access in Android Settings to read and sync app time."
        } else if (pendingUploadSynced) {
            "Saved usage snapshot synced securely. Enable Usage Access in Android Settings to read and sync app time."
        } else {
            "Enable Usage Access in Android Settings to read and sync app time."
        },
        usageAccessGranted = false,
        recoverableUsageDates = recoverableUsageDates()
    )

    private fun isSafeSnapshotForDisplay(apps: List<DeviceUsageApp>): Boolean =
        apps.size <= MAX_APPS &&
            apps.all {
                it.packageName.isNotBlank() &&
                    it.displayName.isNotBlank() &&
                    it.category in setOf("Learning", "Videos", "Games", "Other") &&
                    it.durationMinutes in 1..MINUTES_PER_DAY
            } &&
            apps.sumOf { it.durationMinutes.toLong() } <= MINUTES_PER_DAY

    private fun upload(
        deviceToken: String,
        profile: DeviceProfile,
        apps: List<DeviceUsageApp>
    ): String {
        val state = newUploadState(profile.usageDate, apps)
        credentials.savePendingUsageUpload(state)
        return if (uploadState(deviceToken, state)) {
            "Usage synced securely."
        } else {
            "This usage snapshot is saved for recovery and will not be retried automatically."
        }
    }

    private fun uploadState(deviceToken: String, initialState: PendingUsageUpload): Boolean {
        var state = initialState
        repeat(2) {
            try {
                val result = api.uploadSnapshot(deviceToken, state, state.apps)
                if (result.status == "accepted") {
                    credentials.clearPendingUsageUpload()
                    return true
                }
                val recoveryReason = when (result.status) {
                    "ticket_expired" -> UsageUploadRecoveryReason.TICKET_EXPIRED
                    "ticket_issue_expired" -> UsageUploadRecoveryReason.TICKET_ISSUE_EXPIRED
                    "ticket_replaced",
                    "ticket_conflict",
                    "payload_conflict",
                    "collection_window_closed",
                    "usage_day_changed",
                    "invalid_ticket",
                    "ticket_not_ready",
                    "ticket_not_prepared" -> UsageUploadRecoveryReason.SERVER_REJECTED
                    else -> null
                }
                if (recoveryReason == null) throw PairingApiException(result.status)

                if (recoveryReason == UsageUploadRecoveryReason.SERVER_REJECTED) {
                    credentials.archivePendingUsageUpload(state, recoveryReason)
                    return false
                }

                if (!state.renewalAttempted) {
                    state = state.copy(
                        issueRequestToken = PairingCredentialStore.newToken(),
                        ticketToken = PairingCredentialStore.newToken(),
                        renewalAttempted = true
                    )
                    credentials.savePendingUsageUpload(state)
                } else {
                    credentials.archivePendingUsageUpload(state, recoveryReason)
                    return false
                }
            } catch (error: PairingApiException) {
                clearIfUnauthorized(error)
                throw error
            }
        }
        throw IOException("Usage could not be synced. The saved snapshot has been preserved.")
    }

    private fun recoverableUsageDates(): List<String> =
        credentials.loadRecoverableUsageSnapshots().map(RecoverableUsageSnapshot::usageDate)

    private fun newUploadState(usageDate: String, apps: List<DeviceUsageApp>) = PendingUsageUpload(
        usageDate = usageDate,
        issueRequestToken = PairingCredentialStore.newToken(),
        ticketToken = PairingCredentialStore.newToken(),
        apps = apps.toList()
    )

    private fun clearIfUnauthorized(error: PairingApiException) {
        if (error.pairingStatus == "invalid_device" ||
            error.pairingStatus == "device_revoked" ||
            error.pairingStatus == "child_inactive"
        ) {
            credentials.clearPairedDevice()
        }
    }

}

class UsageSyncWorker(
    context: Context,
    parameters: WorkerParameters
) : Worker(context, parameters) {
    override fun doWork(): Result = try {
        if (!PairingCredentialStore(applicationContext).hasPairedDevice()) {
            Result.success()
        } else {
            UsageSync(applicationContext).refreshDashboard()
            Result.success()
        }
    } catch (_: UsageValidationException) {
        Result.success()
    } catch (error: PairingApiException) {
        when (error.pairingStatus) {
            "invalid_device", "device_revoked", "child_inactive" -> Result.success()
            else -> Result.retry()
        }
    } catch (_: IOException) {
        Result.retry()
    } catch (_: SecurityException) {
        Result.success()
    } catch (_: IllegalStateException) {
        Result.failure()
    }
}

object UsageSyncScheduler {
    private const val UNIQUE_WORK_NAME = "sotiria-android-usage-sync"

    fun schedule(context: Context) {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()
        val request = PeriodicWorkRequestBuilder<UsageSyncWorker>(6, TimeUnit.HOURS)
            .setConstraints(constraints)
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            UNIQUE_WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            request
        )
    }

    fun cancel(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(UNIQUE_WORK_NAME)
    }
}
