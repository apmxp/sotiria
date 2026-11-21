package com.sotiria.companion

import android.app.Activity
import android.app.AlertDialog
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
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import java.io.IOException
import java.security.GeneralSecurityException
import java.util.Locale

class MainActivity : Activity() {
    private lateinit var credentials: PairingCredentialStore
    private lateinit var pairingSection: LinearLayout
    private lateinit var loadingSection: LinearLayout
    private lateinit var dashboardSection: LinearLayout
    private lateinit var pairingCodeInput: EditText
    private lateinit var pairingStatus: TextView
    private lateinit var pairingButton: Button
    private lateinit var loadingStatus: TextView
    private lateinit var dashboardName: TextView
    private lateinit var dashboardAvatar: TextView
    private lateinit var homeSection: LinearLayout
    private lateinit var screenTimeTotal: TextView
    private lateinit var screenTimeGoal: TextView
    private lateinit var goalProgress: ProgressBar
    private lateinit var usageStatus: TextView
    private lateinit var usageRows: LinearLayout
    private lateinit var dashboardRefresh: Button
    private lateinit var activitiesSection: LinearLayout
    private lateinit var safetySection: LinearLayout
    private lateinit var screenTimeSection: LinearLayout
    private lateinit var screenTimeDetails: LinearLayout
    private lateinit var dashboardNavigation: LinearLayout
    private var dashboardLoaded = false
    private var refreshInProgress = false
    private var lastDashboardData: ChildDashboardData? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        credentials = PairingCredentialStore(this)
        setContentView(createContent())
        restoreAuthorizedChild()
    }

    override fun onResume() {
        super.onResume()
        if (dashboardLoaded && !refreshInProgress) refreshDashboard()
    }

    private fun createContent(): ScrollView {
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(24), dp(20), dp(32))
            setBackgroundColor(0xFFF2F8F1.toInt())
        }

        content.addView(
            TextView(this).apply {
                text = "Sotiría 🌱"
                textSize = 25f
                setTextColor(0xFF245B45.toInt())
                setTypeface(typeface, Typeface.BOLD)
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, 0, 0, dp(12))
            },
            matchWidthWrapHeight()
        )

        dashboardNavigation = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            visibility = View.GONE
        }
        listOf(
            "Home" to Screen.HOME,
            "Screen time" to Screen.SCREEN_TIME,
            "Activities" to Screen.ACTIVITIES,
            "Online safety" to Screen.SAFETY
        ).forEach { (label, screen) ->
            dashboardNavigation.addView(
                Button(this).apply {
                    text = label
                    textSize = 11f
                    minWidth = 0
                    setPadding(dp(4), 0, dp(4), 0)
                    setOnClickListener { showScreen(screen) }
                },
                LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            )
        }
        content.addView(dashboardNavigation, matchWidthWrapHeight())

        loadingSection = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            visibility = View.GONE
            setPadding(dp(18), dp(30), dp(18), dp(30))
            background = cardBackground(Color.WHITE)
        }
        loadingStatus = bodyText("Checking this phone’s authorization…")
        loadingSection.addView(loadingStatus, matchWidthWrapHeight())
        loadingSection.addView(
            Button(this).apply {
                text = "Try again"
                setOnClickListener { refreshDashboard() }
            },
            matchWidthWrapHeight()
        )
        content.addView(loadingSection, matchWidthWrapHeight())

        pairingSection = createPairingSection()
        content.addView(pairingSection, matchWidthWrapHeight())

        dashboardSection = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            visibility = View.GONE
        }
        dashboardName = TextView(this).apply {
            textSize = 26f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(0xFF245B45.toInt())
        }
        dashboardAvatar = TextView(this).apply {
            textSize = 34f
            setPadding(0, dp(8), 0, dp(8))
            contentDescription = "Child profile"
        }
        dashboardSection.addView(dashboardAvatar, matchWidthWrapHeight())
        dashboardSection.addView(dashboardName, matchWidthWrapHeight())
        dashboardSection.addView(
            bodyText("Your little world: screen time, goals, and ideas for a balanced day."),
            matchWidthWrapHeight().apply { bottomMargin = dp(16) }
        )
        homeSection = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }

        val homeTotal = card()
        homeTotal.addView(heading("Today’s screen time"))
        screenTimeTotal = valueText()
        homeTotal.addView(screenTimeTotal, matchWidthWrapHeight())
        screenTimeGoal = bodyText("")
        homeTotal.addView(screenTimeGoal, matchWidthWrapHeight())
        goalProgress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            progressTintList = android.content.res.ColorStateList.valueOf(0xFF43836A.toInt())
        }
        homeTotal.addView(goalProgress, matchWidthWrapHeight())
        homeSection.addView(homeTotal, matchWidthWrapHeight().apply { bottomMargin = dp(12) })

        usageStatus = bodyText("Your app summary will appear here.")
        homeSection.addView(usageStatus, matchWidthWrapHeight())
        usageRows = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        homeSection.addView(usageRows, matchWidthWrapHeight())

        dashboardRefresh = Button(this).apply {
            text = "Refresh today’s dashboard"
            setOnClickListener { refreshDashboard() }
        }
        homeSection.addView(dashboardRefresh, matchWidthWrapHeight())
        homeSection.addView(
            Button(this).apply {
                text = "Usage Access settings"
                setOnClickListener { openUsageAccessSettings() }
            },
            matchWidthWrapHeight()
        )
        homeSection.addView(
            bodyText("Your app-time summary is for this phone. Sotiría does not read messages or what happens inside apps."),
            matchWidthWrapHeight().apply { topMargin = dp(12) }
        )
        dashboardSection.addView(homeSection, matchWidthWrapHeight())

        screenTimeSection = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            visibility = View.GONE
        }
        screenTimeSection.addView(heading("My screen time"), matchWidthWrapHeight())
        screenTimeSection.addView(bodyText("See today’s included app time and your progress toward the family goal."), matchWidthWrapHeight())
        screenTimeSection.addView(Button(this).apply {
            text = "Refresh screen time"
            setOnClickListener { refreshDashboard() }
        }, matchWidthWrapHeight())
        screenTimeDetails = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        screenTimeSection.addView(screenTimeDetails, matchWidthWrapHeight())

        activitiesSection = createActivitiesSection()
        safetySection = createSafetySection()
        dashboardSection.addView(screenTimeSection, matchWidthWrapHeight())
        dashboardSection.addView(activitiesSection, matchWidthWrapHeight())
        dashboardSection.addView(safetySection, matchWidthWrapHeight())
        content.addView(dashboardSection, matchWidthWrapHeight())

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

    private fun createPairingSection() = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(18), dp(18), dp(18), dp(18))
        background = cardBackground(Color.WHITE)
        addView(heading("Connect with your parent"), matchWidthWrapHeight())
        addView(
            bodyText("Enter the one-time code from the parent Sotiría profile. Once the parent authorizes this phone, your child space opens automatically—no PIN or extra login is needed."),
            matchWidthWrapHeight()
        )
        pairingStatus = bodyText("Your parent can create a code from the child’s family profile.")
        addView(pairingStatus, matchWidthWrapHeight())
        pairingCodeInput = EditText(this).apply {
            hint = "One-time pairing code"
            setSingleLine(true)
            inputType = android.text.InputType.TYPE_CLASS_TEXT or
                android.text.InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
            setTextSize(15f)
            setPadding(dp(12), dp(10), dp(12), dp(10))
        }
        addView(pairingCodeInput, matchWidthWrapHeight())
        pairingButton = Button(this).apply {
            text = "Connect this phone"
            setOnClickListener { connectPhone() }
        }
        addView(pairingButton, matchWidthWrapHeight())
    }

    private fun createActivitiesSection() = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        visibility = View.GONE
        addView(heading("Offline activities"), matchWidthWrapHeight())
        addView(bodyText("Choose an idea and enjoy it at your own pace. Ask an adult for help when an activity says supervision is needed."), matchWidthWrapHeight())
        listOf(
            ActivityIdea(
                "Draw Your Dream World",
                "Creativity · 20 min",
                "Gather paper and colored pencils. Imagine a world you love, sketch it, add colors, and give it a name."
            ),
            ActivityIdea(
                "Create a Paper Airplane",
                "Science & Discovery · 15 min",
                "Fold a paper airplane, test it in a clear space away from people, and compare how far different folds fly."
            ),
            ActivityIdea(
                "Read a Short Story",
                "Reading & Learning · 15 min",
                "Find a cozy place, choose a book, and imagine a different ending or tell someone your favorite part."
            ),
            ActivityIdea(
                "Explore Local Nature",
                "Outdoor Adventures · 30 min · with an adult",
                "Walk a safe route with an adult, notice three leaf shapes, and draw what you see without touching unknown plants."
            )
        ).forEach { idea ->
            val activity = card()
            activity.addView(heading(idea.title), matchWidthWrapHeight())
            activity.addView(bodyText(idea.subtitle), matchWidthWrapHeight())
            activity.addView(bodyText(idea.instructions), matchWidthWrapHeight())
            addView(activity, matchWidthWrapHeight().apply { topMargin = dp(10) })
        }
    }

    private fun createSafetySection() = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        visibility = View.GONE
        addView(heading("Your online safety journey"), matchWidthWrapHeight())
        addView(bodyText("Pause before sharing personal information. Keep passwords, your address, and school details private."), matchWidthWrapHeight())
        addView(bodyText("Unexpected prizes, urgent messages, and unknown links can be warning signs. Stop and ask a trusted adult."), matchWidthWrapHeight())
        addView(bodyText("Choose kind words online. If something makes you uncomfortable, leave the conversation and talk to a trusted adult."), matchWidthWrapHeight())
        addView(
            bodyText("If anything online feels confusing or upsetting, you do not have to handle it alone."),
            matchWidthWrapHeight().apply { topMargin = dp(12) }
        )
    }

    private fun restoreAuthorizedChild() {
        val deviceToken = try {
            credentials.loadDeviceToken()
        } catch (_: GeneralSecurityException) {
            clearDeviceAuthorization()
            return
        } catch (_: SecurityException) {
            clearDeviceAuthorization()
            return
        } catch (error: IllegalStateException) {
            clearDeviceAuthorization()
            return
        }

        if (deviceToken.isNullOrBlank()) {
            showPairing(null)
            return
        }
        showLoading("Checking this phone’s authorization…")
        refreshDashboard()
    }

    private fun connectPhone() {
        val pairingToken = pairingCodeInput.text.toString().trim()
        if (!PAIRING_TOKEN_PATTERN.matches(pairingToken)) {
            pairingStatus.text = "Enter a valid one-time pairing code."
            return
        }
        if (credentials.hasPairedDevice()) {
            restoreAuthorizedChild()
            return
        }

        pairingStatus.text = "Connecting securely…"
        pairingButton.isEnabled = false
        Thread {
            var activated = false
            try {
                val pending = credentials.loadPending()
                    ?.takeIf { it.pairingToken == pairingToken }
                    ?: PendingPairing(
                        pairingToken = pairingToken,
                        pendingToken = PairingCredentialStore.newToken(),
                        deviceToken = PairingCredentialStore.newToken(),
                        deviceName = "Sotiría Android phone"
                    ).also(credentials::savePending)

                val pendingHash = PairingApiClient.sha256Hex(pending.pendingToken)
                val deviceHash = PairingApiClient.sha256Hex(pending.deviceToken)
                val api = PairingApiClient()
                val redemption = api.redeem(pairingToken, pendingHash, pending.deviceName)
                if (redemption.status != "ok" && redemption.status != "pairing_unavailable") {
                    throw PairingApiException(redemption.status)
                }

                val activation = api.activate(pendingHash, deviceHash)
                if (activation.status != "ok") throw PairingApiException(activation.status)
                credentials.completePairing(pending.deviceToken)
                activated = true
                UsageSyncScheduler.schedule(this)
                runOnUiThread {
                    pairingCodeInput.setText("")
                    showLoading("Phone paired. Opening your child dashboard…")
                }
                val data = UsageSync(this).refreshDashboard()
                runOnUiThread { showDashboard(data) }
            } catch (error: PairingApiException) {
                if (error.pairingStatus == "invalid_device" ||
                    error.pairingStatus == "device_revoked" ||
                    error.pairingStatus == "child_inactive"
                ) {
                    clearDeviceAuthorization()
                } else if (activated) {
                    runOnUiThread { showLoading(error.message ?: "Phone paired. Checking its authorization…") }
                } else {
                    try {
                        credentials.clearPending()
                    } catch (_: IllegalStateException) {
                        // Keep the original pairing error visible; no credential value is exposed.
                    }
                    runOnUiThread { showPairing(error.message) }
                }
            } catch (error: PairingApiResponseException) {
                runOnUiThread {
                    if (activated) showLoading(error.message ?: "Phone paired. The child dashboard could not be loaded.")
                    else showPairing(error.message)
                }
            } catch (_: IOException) {
                runOnUiThread {
                    if (activated) showLoading("Phone paired. The dashboard could not load; check your connection and try again.")
                    else showPairing("The secure connection failed. Check your connection and try again.")
                }
            } catch (error: IllegalStateException) {
                runOnUiThread {
                    if (activated) showLoading(error.message ?: "Phone paired. The child dashboard could not be loaded.")
                    else showPairing(error.message)
                }
            } catch (_: GeneralSecurityException) {
                runOnUiThread {
                    if (activated) showLoading("Phone paired. Secure storage could not be accessed; try again.")
                    else showPairing("The phone’s secure storage could not be accessed.")
                }
            } catch (_: SecurityException) {
                runOnUiThread {
                    if (activated) showLoading("Phone paired. Secure storage could not be accessed; try again.")
                    else showPairing("The phone’s secure storage could not be accessed.")
                }
            }
        }.start()
    }

    private fun refreshDashboard() {
        if (refreshInProgress) return
        refreshInProgress = true
        dashboardRefresh.isEnabled = false
        if (!dashboardLoaded) showLoading("Loading your authorized child space…")
        Thread {
            try {
                val data = UsageSync(this).refreshDashboard()
                runOnUiThread { showDashboard(data) }
            } catch (error: PairingApiException) {
                if (error.pairingStatus == "invalid_device" ||
                    error.pairingStatus == "device_revoked" ||
                    error.pairingStatus == "child_inactive"
                ) {
                    clearDeviceAuthorization()
                } else {
                    runOnUiThread { showDashboardError(error.message ?: "Usage could not be refreshed.") }
                }
            } catch (error: IOException) {
                runOnUiThread {
                    showDashboardError(error.message ?: "Usage sync failed. Check your connection and try again.")
                }
            } catch (error: IllegalStateException) {
                clearDeviceAuthorization()
            } catch (_: GeneralSecurityException) {
                clearDeviceAuthorization()
            } catch (_: SecurityException) {
                runOnUiThread { showDashboardError("App usage could not be read. Check Usage Access and refresh.") }
            }
        }.start()
    }

    private fun showDashboard(data: ChildDashboardData) {
        refreshInProgress = false
        dashboardLoaded = true
        UsageSyncScheduler.schedule(this)
        dashboardRefresh.isEnabled = true
        lastDashboardData = data
        pairingSection.visibility = View.GONE
        loadingSection.visibility = View.GONE
        dashboardNavigation.visibility = View.VISIBLE
        dashboardSection.visibility = View.VISIBLE
        dashboardName.text = "Hello, ${data.profile.displayName}!"
        dashboardAvatar.text = data.profile.avatar
        dashboardAvatar.contentDescription = "${data.profile.displayName}’s profile"
        renderUsage(data)
        showScreen(Screen.HOME)
    }

    private fun showDashboardError(message: String) {
        refreshInProgress = false
        dashboardRefresh.isEnabled = true
        val data = lastDashboardData
        if (data != null) {
            usageStatus.text = message
            dashboardLoaded = true
            dashboardSection.visibility = View.VISIBLE
            dashboardNavigation.visibility = View.VISIBLE
            loadingSection.visibility = View.GONE
            pairingSection.visibility = View.GONE
        } else {
            showLoading(message)
            loadingStatus.append("\nYour saved authorization is kept. Try again when the connection is available.")
        }
    }

    private fun renderUsage(data: ChildDashboardData) {
        usageRows.removeAllViews()
        val totalMinutes = data.apps.sumOf { it.durationMinutes }
        val usageAccessGranted = data.usageAccessGranted
        screenTimeTotal.text = if (usageAccessGranted) formatMinutes(totalMinutes.toDouble()) else "—"
        val goal = data.profile.goalMinutes
        if (goal != null) {
            if (usageAccessGranted) {
                val percent = if (goal > 0) (totalMinutes / (goal / 60.0) * 100).toInt().coerceIn(0, 100) else 0
                screenTimeGoal.text = "${formatMinutes(goal.toDouble())} daily goal · $percent% used"
                goalProgress.progress = percent
                goalProgress.visibility = View.VISIBLE
            } else {
                screenTimeGoal.text =
                    "${formatMinutes(goal.toDouble())} daily goal · Enable Usage Access to see progress."
                goalProgress.progress = 0
                goalProgress.visibility = View.GONE
            }
        } else {
            screenTimeGoal.text = "Your family has not set a daily screen-time goal yet."
            goalProgress.visibility = View.GONE
        }

        val syncState = when {
            !usageAccessGranted -> data.syncMessage
            data.apps.isEmpty() -> "No app usage to show for ${data.profile.usageDate} yet. Your day is just getting started!"
            else -> "Today’s included apps · ${data.profile.usageDate}. ${data.syncMessage}"
        }
        usageStatus.text = syncState
        if (data.recoverableUsageDates.isNotEmpty()) {
            val dates = data.recoverableUsageDates.distinct().sorted().joinToString()
            usageRows.addView(
                bodyText(
                    "Unsent snapshots for $dates are encrypted on this phone and will not be uploaded."
                ),
                matchWidthWrapHeight().apply { bottomMargin = dp(8) }
            )
            usageRows.addView(
                Button(this).apply {
                    text = "Discard saved snapshots"
                    setOnClickListener { confirmDiscardRecoverableUsageSnapshots() }
                },
                matchWidthWrapHeight().apply { bottomMargin = dp(12) }
            )
        }
        if (data.apps.isNotEmpty()) {
            data.apps.forEachIndexed { index, app ->
                usageRows.addView(
                    createUsageCard(index + 1, app),
                    matchWidthWrapHeight().apply { bottomMargin = dp(10) }
                )
            }
        } else if (usageAccessGranted) {
            usageRows.addView(bodyText("When included apps are used, their names and time will appear here."), matchWidthWrapHeight())
        }

        screenTimeDetails.removeAllViews()
        screenTimeDetails.addView(
            TextView(this).apply {
                text = "Today: ${screenTimeTotal.text}\nGoal: ${screenTimeGoal.text}\n$syncState"
                textSize = 16f
                setTextColor(0xFF315446.toInt())
                setLineSpacing(dp(5).toFloat(), 1f)
                setPadding(0, dp(12), 0, dp(12))
            },
            matchWidthWrapHeight()
        )
        if (data.apps.isNotEmpty()) {
            data.apps.forEachIndexed { index, app ->
                screenTimeDetails.addView(
                    createUsageCard(index + 1, app),
                    matchWidthWrapHeight().apply { bottomMargin = dp(10) }
                )
            }
        }
    }

    private fun confirmDiscardRecoverableUsageSnapshots() {
        AlertDialog.Builder(this)
            .setTitle("Discard saved usage snapshots?")
            .setMessage(
                "This permanently removes archived unsent snapshots stored on this phone. " +
                    "Usage already accepted by the server will not be changed."
            )
            .setNegativeButton("Keep snapshots", null)
            .setPositiveButton("Discard") { _, _ ->
                try {
                    credentials.clearRecoverableUsageSnapshots()
                    refreshDashboard()
                } catch (error: IOException) {
                    showDashboardError(
                        error.message ?: "Saved snapshots could not be cleared."
                    )
                }
            }
            .show()
    }

    private fun createUsageCard(rank: Int, summary: DeviceUsageApp): LinearLayout {
        val usageCard = card()
        usageCard.orientation = LinearLayout.HORIZONTAL
        usageCard.gravity = Gravity.CENTER_VERTICAL
        val label = TextView(this).apply {
            text = "$rank. ${summary.displayName}\n${summary.category}"
            textSize = 15f
            setTextColor(0xFF263B32.toInt())
            maxLines = 2
        }
        usageCard.addView(label, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        usageCard.addView(
            TextView(this).apply {
                text = formatMinutes(summary.durationMinutes.toDouble())
                textSize = 15f
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(0xFF245B45.toInt())
                setPadding(dp(8), 0, 0, 0)
            },
            wrapContent()
        )
        return usageCard
    }

    private fun showPairing(message: String?) {
        refreshInProgress = false
        dashboardLoaded = false
        pairingSection.visibility = View.VISIBLE
        loadingSection.visibility = View.GONE
        dashboardNavigation.visibility = View.GONE
        dashboardSection.visibility = View.GONE
        pairingCodeInput.isEnabled = true
        pairingButton.isEnabled = true
        pairingStatus.text = message ?: "Your parent can create a one-time code from the child’s family profile."
    }

    private fun showLoading(message: String) {
        pairingSection.visibility = View.GONE
        dashboardNavigation.visibility = View.GONE
        dashboardSection.visibility = View.GONE
        loadingSection.visibility = View.VISIBLE
        loadingStatus.text = message
    }

    private fun clearDeviceAuthorization() {
        val pendingSnapshotNeedsRecovery = try {
            !credentials.clearPairedDevice()
        } catch (_: IllegalStateException) {
            runOnUiThread { showLoading("This phone is no longer authorized. Ask your parent to authorize it again.") }
            return
        }
        UsageSyncScheduler.cancel(this)
        runOnUiThread {
            showPairing(
                if (pendingSnapshotNeedsRecovery) {
                    "This phone is no longer authorized. Your unsent snapshot remains encrypted on this phone; pair again before resolving it."
                } else {
                    "This phone is no longer authorized. Ask your parent to create a new pairing code."
                }
            )
        }
    }

    private fun showScreen(screen: Screen) {
        dashboardSection.visibility = View.VISIBLE
        homeSection.visibility = if (screen == Screen.HOME) View.VISIBLE else View.GONE
        screenTimeSection.visibility = if (screen == Screen.SCREEN_TIME) View.VISIBLE else View.GONE
        activitiesSection.visibility = if (screen == Screen.ACTIVITIES) View.VISIBLE else View.GONE
        safetySection.visibility = if (screen == Screen.SAFETY) View.VISIBLE else View.GONE
        if (screen == Screen.HOME) {
            screenTimeTotal.visibility = View.VISIBLE
        }
    }

    private fun openUsageAccessSettings() {
        try {
            startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(this, "Usage Access settings are not available on this device.", Toast.LENGTH_LONG).show()
        }
    }

    private fun card() = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(16), dp(14), dp(16), dp(14))
        background = cardBackground(Color.WHITE)
    }

    private fun heading(text: String) = TextView(this).apply {
        this.text = text
        textSize = 18f
        setTypeface(typeface, Typeface.BOLD)
        setTextColor(0xFF245B45.toInt())
        setPadding(0, dp(8), 0, dp(6))
    }

    private fun bodyText(text: String) = TextView(this).apply {
        this.text = text
        textSize = 14f
        setTextColor(0xFF52645A.toInt())
        setLineSpacing(dp(3).toFloat(), 1f)
        setPadding(0, dp(4), 0, dp(8))
    }

    private fun valueText() = TextView(this).apply {
        textSize = 30f
        setTypeface(typeface, Typeface.BOLD)
        setTextColor(0xFF245B45.toInt())
        setPadding(0, dp(8), 0, 0)
        contentDescription = "Today's total screen time"
    }

    private fun formatMinutes(minutes: Double): String {
        val wholeMinutes = minutes.toInt()
        val hours = wholeMinutes / 60
        val remainder = wholeMinutes % 60
        return if (hours > 0) "$hours h $remainder min" else "$remainder min"
    }

    private fun cardBackground(color: Int) = GradientDrawable().apply {
        setColor(color)
        cornerRadius = dp(16).toFloat()
    }

    private fun matchWidthWrapHeight() =
        LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        )

    private fun wrapContent() =
        LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        )

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

    private data class ActivityIdea(
        val title: String,
        val subtitle: String,
        val instructions: String
    )

    private enum class Screen {
        HOME,
        SCREEN_TIME,
        ACTIVITIES,
        SAFETY
    }

    private companion object {
        val PAIRING_TOKEN_PATTERN = Regex("^[A-Za-z0-9_-]{43}$")
    }
}
