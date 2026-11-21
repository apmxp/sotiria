package com.sotiria.companion

import android.app.AppOpsManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.pm.ApplicationInfo
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeParseException

data class AppUsageSummary(
    val packageName: String,
    val displayName: String,
    val durationMinutes: Double,
    val usageDate: LocalDate,
    val category: String
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
    fun readToday(): List<AppUsageSummary> =
        readForDay(LocalDate.now().toString(), ZoneId.systemDefault().id)

    @Throws(SecurityException::class, IllegalArgumentException::class)
    fun readForDay(usageDate: String, timezone: String): List<AppUsageSummary> {
        if (!hasUsageAccess()) {
            throw SecurityException("Usage Access is not enabled")
        }

        val day = try {
            LocalDate.parse(usageDate)
        } catch (_: DateTimeParseException) {
            throw IllegalArgumentException("The reporting date is invalid.")
        }
        val zone = ZoneId.of(timezone)
        val startOfDay = day.atStartOfDay(zone).toInstant().toEpochMilli()
        val endOfDay = day.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()
        val endOfRange = minOf(System.currentTimeMillis(), endOfDay)
        if (endOfRange <= startOfDay) return emptyList()
        val usageManager =
            appContext.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val stats = usageManager.queryUsageStats(
            UsageStatsManager.INTERVAL_DAILY,
            startOfDay,
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
            val category = categorize(appInfo.category, packageName, label)
            AppUsageSummary(
                packageName = packageName,
                displayName = label,
                durationMinutes = durationMillis / MILLIS_PER_MINUTE,
                usageDate = day,
                category = category
            )
        }.sortedByDescending(AppUsageSummary::durationMinutes)
    }

    private fun categorize(applicationCategory: Int, packageName: String, displayName: String): String {
        val app = "$packageName $displayName".lowercase()
        return when {
            applicationCategory == ApplicationInfo.CATEGORY_GAME -> "Games"
            applicationCategory == ApplicationInfo.CATEGORY_VIDEO ||
                listOf("video", "youtube", "stream", "movie").any(app::contains) -> "Videos"
            listOf("learn", "education", "school", "classroom", "reading", "study")
                .any(app::contains) -> "Learning"
            else -> "Other"
        }
    }

    private companion object {
        const val MILLIS_PER_MINUTE = 60_000.0
    }
}
