package com.sotiria.companion

import java.time.LocalDate
import kotlin.math.roundToInt
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class UsageMinuteRoundingTest {
    @Test
    fun roundsSingleAppFractionalMinutesToTheNearestWholeMinute() {
        assertConservation(listOf(summary("app.four", 0.4)))
        assertConservation(listOf(summary("app.five", 0.5)))
        assertConservation(listOf(summary("app.six", 0.6)))

        assertEquals(0, roundUsageApps(listOf(summary("app.four", 0.4))).sumOf { it.durationMinutes })
        assertEquals(1, roundUsageApps(listOf(summary("app.five", 0.5))).sumOf { it.durationMinutes })
        assertEquals(1, roundUsageApps(listOf(summary("app.six", 0.6))).sumOf { it.durationMinutes })
    }

    @Test
    fun conservesFractionalMinutesAcrossSeveralApps() {
        val summaries = listOf(
            summary("app.one", 0.2),
            summary("app.two", 0.3),
            summary("app.three", 0.5)
        )
        val apps = roundUsageApps(summaries)

        assertEquals(listOf("app.three"), apps.map { it.packageName })
        assertConservation(summaries)
    }

    @Test
    fun handlesManySubHalfMinuteAppsWhenTheAggregateRoundsToZeroOrOne() {
        val roundsToZero = List(100) { summary("app.zero$it", 0.004) }
        val roundsToOne = List(100) { summary("app.one$it", 0.01) }

        assertTrue(roundUsageApps(roundsToZero).isEmpty())
        assertConservation(roundsToZero)
        assertConservation(roundsToOne)
        assertEquals(1, roundUsageApps(roundsToOne).sumOf { it.durationMinutes })
    }

    @Test
    fun breaksEqualRemainderTiesDeterministicallyAcrossCalls() {
        val summaries = List(3) { summary("app.$it", 0.25) }
        val first = roundUsageApps(summaries)
        val second = roundUsageApps(summaries)

        assertEquals(first, second)
        assertEquals(listOf("app.0"), first.map { it.packageName })
        assertConservation(summaries)
    }

    @Test
    fun handlesEmptyAndZeroUsageLists() {
        assertTrue(roundUsageApps(emptyList()).isEmpty())

        val zeroUsage = List(5) { summary("app.zero$it", 0.0) }
        assertTrue(roundUsageApps(zeroUsage).isEmpty())
        assertConservation(zeroUsage)
    }

    @Test
    fun acceptsTotalsJustBelowAndExactlyAtTheDailyMaximum() {
        val justBelow = listOf(summary("app.below", 1439.49))
        val atMaximum = listOf(summary("app.maximum", 1440.0))

        assertEquals(1439, roundUsageApps(justBelow).sumOf { it.durationMinutes })
        assertEquals(1440, roundUsageApps(atMaximum).sumOf { it.durationMinutes })
        assertConservation(justBelow)
        assertConservation(atMaximum)
    }

    @Test
    fun rejectsTotalsJustAboveTheDailyMaximum() {
        assertThrows(UsageValidationException::class.java) {
            roundUsageApps(listOf(summary("app.over", 1440.0001)))
        }
    }

    @Test
    fun rejectsNegativeNanAndInfiniteDurations() {
        listOf(-0.1, Double.NaN, Double.POSITIVE_INFINITY).forEachIndexed { index, duration ->
            assertThrows(UsageValidationException::class.java) {
                roundUsageApps(listOf(summary("app.invalid$index", duration)))
            }
        }
    }

    @Test
    fun rejectsExcessAppsBeforeAllocatingOrDroppingAny() {
        val summaries = List(201) { summary("app.$it", 0.1) }
        val error = assertThrows(UsageValidationException::class.java) {
            roundUsageApps(summaries)
        }

        assertTrue(error.message.orEmpty().contains("200"))
    }

    private fun assertConservation(summaries: List<AppUsageSummary>) {
        val apps = roundUsageApps(summaries)
        val expectedTotal = summaries.sumOf { it.durationMinutes }.roundToInt()
        val allocatedTotal = apps.sumOf { it.durationMinutes }

        assertEquals(expectedTotal, allocatedTotal)
        assertTrue(apps.all { it.durationMinutes > 0 })
        assertTrue(allocatedTotal <= 1440)
    }

    private fun summary(packageName: String, durationMinutes: Double) = AppUsageSummary(
        packageName = packageName,
        displayName = packageName,
        durationMinutes = durationMinutes,
        usageDate = LocalDate.of(2026, 11, 20),
        category = "Other"
    )
}
