package com.sotiria.companion

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import java.util.Locale

class MainActivity : Activity() {
    private lateinit var accessStatus: TextView
    private lateinit var permissionGuidance: TextView
    private lateinit var summaryStatus: TextView
    private lateinit var totalValue: TextView
    private lateinit var usageRows: LinearLayout
    private lateinit var usageSummaryReader: UsageSummaryReader

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        usageSummaryReader = UsageSummaryReader(this)
        setContentView(createContent())
        refreshUsageSummary()
    }

    override fun onResume() {
        super.onResume()
        if (::usageRows.isInitialized) {
            refreshUsageSummary()
        }
    }

    private fun createContent(): ScrollView {
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(28), dp(36), dp(28), dp(36))
            setBackgroundColor(0xFFF2F8F1.toInt())
        }

        content.addView(
            TextView(this).apply {
                text = "Welcome to Sotiría 🌱"
                textSize = 28f
                setTextColor(0xFF245B45.toInt())
                gravity = Gravity.CENTER
            },
            matchWidthWrapHeight()
        )

        content.addView(
            TextView(this).apply {
                text = "A little help understanding screen time"
                textSize = 18f
                setTextColor(0xFF315446.toInt())
                gravity = Gravity.CENTER
                setPadding(0, dp(12), 0, dp(24))
            },
            matchWidthWrapHeight()
        )

        content.addView(
            TextView(this).apply {
                text = "Usage Access lets Sotiría see which apps were used and for how long, so it can make a simple app-usage summary. Android asks you to turn this on yourself in Settings."
                textSize = 16f
                setTextColor(0xFF263B32.toInt())
                setLineSpacing(dp(4).toFloat(), 1f)
            },
            matchWidthWrapHeight()
        )

        content.addView(
            TextView(this).apply {
                text = "Today's app summaries are read and shown only on this phone. This preview does not save or send them. Usage Access does not reveal messages or what you do inside other apps."
                textSize = 15f
                setTextColor(0xFF52645A.toInt())
                setLineSpacing(dp(4).toFloat(), 1f)
                setPadding(0, dp(18), 0, dp(24))
            },
            matchWidthWrapHeight()
        )

        accessStatus = TextView(this).apply {
            textSize = 16f
            setTextColor(0xFF245B45.toInt())
            gravity = Gravity.CENTER
            setPadding(dp(16), dp(14), dp(16), dp(14))
            background = cardBackground(0xFFE0EDE0.toInt())
            contentDescription = "Usage Access permission status"
        }
        content.addView(accessStatus, matchWidthWrapHeight().apply {
            bottomMargin = dp(8)
        })

        permissionGuidance = TextView(this).apply {
            textSize = 14f
            setTextColor(0xFF52645A.toInt())
            setLineSpacing(dp(3).toFloat(), 1f)
            setPadding(0, dp(4), 0, dp(8))
        }
        content.addView(permissionGuidance, matchWidthWrapHeight())

        content.addView(
            Button(this).apply {
                text = "Open Usage Access settings"
                setOnClickListener { openUsageAccessSettings() }
            },
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply {
                topMargin = dp(20)
            }
        )

        content.addView(
            Button(this).apply {
                text = "Refresh today's summary"
                setOnClickListener { refreshUsageSummary() }
            },
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply {
                topMargin = dp(8)
            }
        )

        summaryStatus = TextView(this).apply {
            textSize = 15f
            setTextColor(0xFF52645A.toInt())
            setPadding(0, dp(24), 0, dp(12))
            contentDescription = "Today's app usage summary status"
        }
        content.addView(summaryStatus, matchWidthWrapHeight())

        val totalCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), dp(16), dp(18), dp(16))
            background = cardBackground(Color.WHITE)
        }
        totalCard.addView(
            TextView(this).apply {
                text = "Today's total screen time · included apps"
                textSize = 16f
                setTextColor(0xFF315446.toInt())
            },
            matchWidthWrapHeight()
        )
        totalValue = TextView(this).apply {
            textSize = 30f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(0xFF245B45.toInt())
            setPadding(0, dp(8), 0, 0)
            contentDescription = "Total screen time today"
        }
        totalCard.addView(totalValue, matchWidthWrapHeight())
        content.addView(totalCard, matchWidthWrapHeight().apply {
            bottomMargin = dp(16)
        })

        usageRows = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }
        content.addView(usageRows, matchWidthWrapHeight())

        return ScrollView(this).apply {
            setFillViewport(true)
            addView(
                content,
                ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                )
            )
        }
    }

    private fun refreshUsageSummary() {
        usageRows.removeAllViews()
        try {
            val hasAccess = usageSummaryReader.hasUsageAccess()
            accessStatus.text = if (hasAccess) {
                "Usage Access is on"
            } else {
                "Usage Access is needed to show app time"
            }
            permissionGuidance.visibility = if (hasAccess) View.GONE else View.VISIBLE
            permissionGuidance.text =
                "To turn it on: tap “Open Usage Access settings,” choose Sotiría, enable Usage Access, then come back here."

            if (!hasAccess) {
                totalValue.text = "—"
                summaryStatus.text = "Your summary will be ready when permission is enabled."
                return
            }

            val summaries = usageSummaryReader.readToday()
            val totalMinutes = summaries.sumOf { it.durationMinutes }
            totalValue.text = formatMinutes(totalMinutes)

            if (summaries.isEmpty()) {
                summaryStatus.text =
                    "No app usage to show yet. Your day is just getting started!"
                return
            }

            summaryStatus.text = "Most-used apps · ${summaries.first().usageDate}"
            summaries.forEachIndexed { index, summary ->
                usageRows.addView(createUsageCard(index + 1, summary), matchWidthWrapHeight().apply {
                    bottomMargin = dp(10)
                })
            }
        } catch (_: SecurityException) {
            accessStatus.text =
                "Android could not confirm Usage Access. Check the permission in Settings."
            permissionGuidance.visibility = View.VISIBLE
            permissionGuidance.text =
                "Open Usage Access settings, select Sotiría, and make sure access is enabled. Then refresh."
            totalValue.text = "—"
            summaryStatus.text =
                "App usage could not be read. Please check Usage Access and try again."
        }
    }

    private fun createUsageCard(rank: Int, summary: AppUsageSummary): LinearLayout {
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(14), dp(16), dp(14))
            background = cardBackground(Color.WHITE)
        }
        val heading = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        heading.addView(
            TextView(this).apply {
                text = "$rank. ${summary.displayName}"
                textSize = 17f
                setTextColor(0xFF263B32.toInt())
                maxLines = 1
                ellipsize = android.text.TextUtils.TruncateAt.END
            },
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        )
        heading.addView(
            TextView(this).apply {
                text = formatMinutes(summary.durationMinutes)
                textSize = 16f
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(0xFF245B45.toInt())
                setPadding(dp(8), 0, 0, 0)
            },
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        )
        card.addView(heading, matchWidthWrapHeight())
        card.addView(
            TextView(this).apply {
                text = summary.packageName
                textSize = 12f
                setTextColor(0xFF64756B.toInt())
                setPadding(0, dp(6), 0, 0)
            },
            matchWidthWrapHeight()
        )
        card.contentDescription =
            "Rank $rank: ${summary.displayName}, ${formatMinutes(summary.durationMinutes)}, package ${summary.packageName}"
        return card
    }

    private fun formatMinutes(minutes: Double) =
        String.format(Locale.getDefault(), "%.1f min", minutes)

    private fun cardBackground(color: Int) = GradientDrawable().apply {
        setColor(color)
        cornerRadius = dp(16).toFloat()
    }

    private fun openUsageAccessSettings() {
        try {
            startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(
                this,
                "Usage Access settings are not available on this device.",
                Toast.LENGTH_LONG
            ).show()
        }
    }

    private fun matchWidthWrapHeight() =
        LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        )

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
}
