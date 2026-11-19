package com.sotiria.companion

import android.app.AppOpsManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.pm.ApplicationInfo
import java.time.LocalDate
import java.time.ZoneId

data class AppUsageSummary(
    val packageName: String,
    val displayName: String,
    val durationMinutes: Double,
    val usageDate: LocalDate
)

class UsageSummaryReader(context: Context) {
    private val appContext = context.applicationContext

    fun hasUsageAccess(): Boolean {
        val appOps = appContext.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        return appOps.checkOpNoThrow(
            AppOpsManager.OPSTR_GET_USAGE_STATS,
            appContext.applicationInfo.uid,
            appContext.packageName
        ) == AppOpsManager.MODE_ALLOWED
    }

    @Throws(SecurityException::class)
    fun readToday(): List<AppUsageSummary> {
        if (!hasUsageAccess()) {
            throw SecurityException("Usage Access is not enabled")
        }

        val today = LocalDate.now()
        val startOfToday = today.atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()
        val endOfRange = System.currentTimeMillis()
        val usageManager =
            appContext.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val stats = usageManager.queryUsageStats(
            UsageStatsManager.INTERVAL_DAILY,
            startOfToday,
            endOfRange
        ).orEmpty()

        val durationsByPackage = mutableMapOf<String, Long>()
        for (stat in stats) {
            if (stat.packageName == appContext.packageName || stat.totalTimeInForeground <= 0L) {
                continue
            }
            durationsByPackage[stat.packageName] =
                (durationsByPackage[stat.packageName] ?: 0L) + stat.totalTimeInForeground
        }

        return durationsByPackage.mapNotNull { (packageName, durationMillis) ->
            val appInfo = try {
                appContext.packageManager.getApplicationInfo(packageName, 0)
            } catch (_: android.content.pm.PackageManager.NameNotFoundException) {
                return@mapNotNull null
            }

            val systemAppFlags =
                ApplicationInfo.FLAG_SYSTEM or ApplicationInfo.FLAG_UPDATED_SYSTEM_APP
            if (appInfo.flags and systemAppFlags != 0) {
                return@mapNotNull null
            }

            val label = appContext.packageManager.getApplicationLabel(appInfo)
                .toString()
                .ifBlank { packageName }
            AppUsageSummary(
                packageName = packageName,
                displayName = label,
                durationMinutes = durationMillis / MILLIS_PER_MINUTE,
                usageDate = today
            )
        }.sortedByDescending(AppUsageSummary::durationMinutes)
    }

    private companion object {
        const val MILLIS_PER_MINUTE = 60_000.0
    }
}
