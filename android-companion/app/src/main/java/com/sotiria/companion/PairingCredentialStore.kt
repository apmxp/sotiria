package com.sotiria.companion

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.io.IOException
import java.security.GeneralSecurityException
import java.security.KeyStore
import java.security.SecureRandom
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.time.format.ResolverStyle
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class PendingPairing(
    val pairingToken: String,
    val pendingToken: String,
    val deviceToken: String,
    val deviceName: String
)

data class PendingUsageUpload(
    val usageDate: String,
    val issueRequestToken: String,
    val ticketToken: String,
    val apps: List<DeviceUsageApp>,
    val renewalAttempted: Boolean = false
)

enum class UsageUploadRecoveryReason(val storageValue: String) {
    REPORTING_DATE_CHANGED("reporting_date_changed"),
    TICKET_EXPIRED("ticket_expired"),
    TICKET_ISSUE_EXPIRED("ticket_issue_expired"),
    SERVER_REJECTED("server_rejected"),
    DEVICE_AUTHORIZATION_LOST("device_authorization_lost")
}

data class RecoverableUsageSnapshot(
    val usageDate: String,
    val reason: UsageUploadRecoveryReason,
    val apps: List<DeviceUsageApp>
)

private val packageNamePattern = Regex("^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+$")
private val usageDatePattern = Regex("[0-9]{4}-[0-9]{2}-[0-9]{2}")
private val strictUsageDateFormatter =
    DateTimeFormatter.ISO_LOCAL_DATE.withResolverStyle(ResolverStyle.STRICT)
private val usageUploadStateLock = Any()

class RecoveryArchiveFullException : IOException(
    "The saved recovery archive is full. Discard archived snapshots before continuing."
)

private fun isValidUsageDate(value: String): Boolean {
    if (!usageDatePattern.matches(value)) return false
    return try {
        LocalDate.parse(value, strictUsageDateFormatter)
        true
    } catch (_: DateTimeParseException) {
        false
    }
}

private fun DeviceUsageApp.hasValidSnapshotFields(): Boolean =
    packageName.length <= 255 &&
        packageNamePattern.matches(packageName) &&
        displayName.trim().isNotEmpty() &&
        displayName.trim().length <= 60 &&
        displayName.none { it.toInt() < 32 || it.toInt() == 127 } &&
        category in setOf("Learning", "Videos", "Games", "Other") &&
        durationMinutes in 1..1440

class PairingCredentialStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(
        PREFERENCES_NAME,
        Context.MODE_PRIVATE
    )

    @Synchronized
    fun loadPending(): PendingPairing? {
        val pairingToken = decrypt(PENDING_PAIRING)
        val pendingToken = decrypt(PENDING_TOKEN)
        val deviceToken = decrypt(PENDING_DEVICE_TOKEN)
        val deviceName = preferences.getString(PENDING_DEVICE_NAME, null)
        if (pairingToken == null && pendingToken == null && deviceToken == null && deviceName == null) {
            return null
        }
        if (pairingToken == null || pendingToken == null || deviceToken == null || deviceName == null) {
            throw IllegalStateException("Saved pairing state is incomplete.")
        }
        return PendingPairing(pairingToken, pendingToken, deviceToken, deviceName)
    }

    @Synchronized
    fun savePending(pairing: PendingPairing) {
        val saved = preferences.edit()
            .putString(PENDING_PAIRING, encrypt(pairing.pairingToken))
            .putString(PENDING_TOKEN, encrypt(pairing.pendingToken))
            .putString(PENDING_DEVICE_TOKEN, encrypt(pairing.deviceToken))
            .putString(PENDING_DEVICE_NAME, pairing.deviceName)
            .commit()
        if (!saved) throw IllegalStateException("Pairing state could not be saved securely.")
    }

    @Synchronized
    fun completePairing(deviceToken: String) {
        val editor = preferences.edit()
            .putString(DEVICE_TOKEN, encrypt(deviceToken))
            .remove(PENDING_PAIRING)
            .remove(PENDING_TOKEN)
            .remove(PENDING_DEVICE_TOKEN)
            .remove(PENDING_DEVICE_NAME)
        if (!editor.commit()) throw IllegalStateException("Device credential could not be saved securely.")
    }

    @Synchronized
    fun clearPending() {
        val saved = preferences.edit()
            .remove(PENDING_PAIRING)
            .remove(PENDING_TOKEN)
            .remove(PENDING_DEVICE_TOKEN)
            .remove(PENDING_DEVICE_NAME)
            .commit()
        if (!saved) throw IllegalStateException("Pairing state could not be cleared.")
    }

    @Synchronized
    fun hasPairedDevice(): Boolean = preferences.contains(DEVICE_TOKEN)

    @Synchronized
    fun loadDeviceToken(): String? = decrypt(DEVICE_TOKEN)

    @Synchronized
    fun clearPairedDevice(): Boolean = synchronized(usageUploadStateLock) {
        val editor = preferences.edit().remove(DEVICE_TOKEN)
        val hasPendingState = hasPendingUsageState()
        if (!hasPendingState) {
            removePendingUsageUpload(editor)
            if (!editor.commit()) {
                throw IllegalStateException("Device authorization could not be cleared.")
            }
            true
        } else {
            val pending = try {
                loadPendingUsageUpload()
            } catch (_: IOException) {
                null
            }
            val recoverable = if (pending != null) {
                try {
                    loadRecoverableUsageSnapshots()
                } catch (_: IOException) {
                    null
                }
            } else {
                null
            }
            val archived = if (pending != null && recoverable != null) {
                try {
                    editor.putString(
                        USAGE_RECOVERY_SNAPSHOTS,
                        encryptRecoverableUsageSnapshots(
                            recoverable + RecoverableUsageSnapshot(
                                pending.usageDate,
                                UsageUploadRecoveryReason.DEVICE_AUTHORIZATION_LOST,
                                pending.apps
                            )
                        )
                    )
                    removePendingUsageUpload(editor)
                    true
                } catch (_: IOException) {
                    false
                }
            } else {
                false
            }
            if (!editor.commit()) {
                throw IllegalStateException("Device authorization could not be cleared.")
            }
            archived
        }
    }

    @Synchronized
    fun loadPendingUsageUpload(): PendingUsageUpload? {
        val hasPendingState = listOf(
            USAGE_DATE,
            USAGE_ISSUE_TOKEN,
            USAGE_TICKET_TOKEN,
            USAGE_SNAPSHOT
        ).any(preferences::contains)
        if (!hasPendingState) return null

        val usageDate = preferences.getString(USAGE_DATE, null)
        val issueRequestToken: String?
        val ticketToken: String?
        val snapshotJson: String?
        try {
            issueRequestToken = decrypt(USAGE_ISSUE_TOKEN)
            ticketToken = decrypt(USAGE_TICKET_TOKEN)
            snapshotJson = decrypt(USAGE_SNAPSHOT)
        } catch (error: GeneralSecurityException) {
            throw IOException(
                "The saved usage upload could not be decrypted securely. It has been preserved.",
                error
            )
        } catch (error: IllegalStateException) {
            throw IOException(
                "The saved usage upload could not be read securely. It has been preserved.",
                error
            )
        } catch (error: SecurityException) {
            throw IOException(
                "The saved usage upload could not be read securely. It has been preserved.",
                error
            )
        }
        if (usageDate == null || issueRequestToken == null || ticketToken == null) {
            throw IOException("Saved usage upload state is incomplete. It has been preserved.")
        }
        if (!isValidUsageDate(usageDate)) {
            throw IOException("The saved usage date is invalid. The pending upload has been preserved.")
        }
        if (snapshotJson == null) {
            throw IOException(
                "This pending upload was created by an older app version and has no saved " +
                    "encrypted snapshot. It has been preserved, but cannot be retried safely. " +
                    "Contact support before clearing app data or pairing this phone again."
            )
        }

        val snapshotObject = try {
            JSONObject(snapshotJson)
        } catch (error: JSONException) {
            throw IOException(
                "The saved app snapshot could not be read. It has been preserved.",
                error
            )
        }
        val snapshot = try {
            snapshotObject.getJSONArray("apps")
        } catch (error: JSONException) {
            throw IOException(
                "The saved app snapshot could not be read. It has been preserved.",
                error
            )
        }
        val apps = parseApps(snapshot, "The saved app snapshot")
        return PendingUsageUpload(
            usageDate,
            issueRequestToken,
            ticketToken,
            apps,
            snapshotObject.optBoolean("renewal_attempted", false)
        )
    }

    @Synchronized
    fun savePendingUsageUpload(upload: PendingUsageUpload) {
        synchronized(usageUploadStateLock) {
            validateApps(upload.apps, "Usage snapshot")
            val existing = loadPendingUsageUpload()
            if (existing != null &&
                (existing.usageDate != upload.usageDate || existing.apps != upload.apps)
            ) {
                throw IOException("A different usage snapshot is still pending and was preserved.")
            }
            if (!isValidUsageDate(upload.usageDate)) {
                throw IOException("The saved usage date is invalid.")
            }
            val snapshot = JSONObject()
                .put("apps", appsToJson(upload.apps))
                .put("renewal_attempted", upload.renewalAttempted)
            val encryptedIssueRequestToken: String
            val encryptedTicketToken: String
            val encryptedSnapshot: String
            try {
                encryptedIssueRequestToken = encrypt(upload.issueRequestToken)
                encryptedTicketToken = encrypt(upload.ticketToken)
                encryptedSnapshot = encrypt(snapshot.toString())
            } catch (error: GeneralSecurityException) {
                throw IOException("Usage upload state could not be encrypted securely.", error)
            } catch (error: IllegalStateException) {
                throw IOException("Usage upload state could not be encrypted securely.", error)
            } catch (error: SecurityException) {
                throw IOException("Usage upload state could not be encrypted securely.", error)
            }
            val saved = preferences.edit()
                .putString(USAGE_DATE, upload.usageDate)
                .putString(USAGE_ISSUE_TOKEN, encryptedIssueRequestToken)
                .putString(USAGE_TICKET_TOKEN, encryptedTicketToken)
                .putString(USAGE_SNAPSHOT, encryptedSnapshot)
                .commit()
            if (!saved) throw IOException("Usage upload state could not be saved securely.")
        }
    }

    @Synchronized
    fun archivePendingUsageUpload(
        upload: PendingUsageUpload,
        reason: UsageUploadRecoveryReason
    ) {
        synchronized(usageUploadStateLock) {
            val current = loadPendingUsageUpload()
            if (current != upload) {
                throw IOException("The pending usage snapshot changed and was preserved.")
            }
            val recoverable = loadRecoverableUsageSnapshots()
            val encrypted = encryptRecoverableUsageSnapshots(
                recoverable + RecoverableUsageSnapshot(upload.usageDate, reason, upload.apps)
            )
            val editor = preferences.edit()
                .putString(USAGE_RECOVERY_SNAPSHOTS, encrypted)
            removePendingUsageUpload(editor)
            if (!editor.commit()) throw IOException("The saved usage snapshot could not be archived.")
        }
    }

    @Synchronized
    fun loadRecoverableUsageSnapshots(): List<RecoverableUsageSnapshot> {
        val encrypted = preferences.getString(USAGE_RECOVERY_SNAPSHOTS, null) ?: return emptyList()
        val json = try {
            decryptValue(encrypted)
        } catch (error: GeneralSecurityException) {
            throw IOException("Saved recovery snapshots could not be decrypted securely.", error)
        } catch (error: IllegalStateException) {
            throw IOException("Saved recovery snapshots could not be read securely.", error)
        } catch (error: SecurityException) {
            throw IOException("Saved recovery snapshots could not be read securely.", error)
        }
        return recoverableUsageSnapshotsFromJson(json)
    }

    @Synchronized
    fun clearRecoverableUsageSnapshots() {
        synchronized(usageUploadStateLock) {
            if (!preferences.edit().remove(USAGE_RECOVERY_SNAPSHOTS).commit()) {
                throw IOException("Saved recovery snapshots could not be cleared.")
            }
        }
    }

    @Synchronized
    fun clearPendingUsageUpload() {
        synchronized(usageUploadStateLock) {
            val editor = preferences.edit()
            removePendingUsageUpload(editor)
            val saved = editor.commit()
            if (!saved) throw IOException("Usage upload state could not be cleared.")
        }
    }

    private fun removePendingUsageUpload(editor: android.content.SharedPreferences.Editor) {
        editor.remove(USAGE_DATE)
            .remove(USAGE_ISSUE_TOKEN)
            .remove(USAGE_TICKET_TOKEN)
            .remove(USAGE_SNAPSHOT)
    }

    private fun hasPendingUsageState(): Boolean = listOf(
        USAGE_DATE,
        USAGE_ISSUE_TOKEN,
        USAGE_TICKET_TOKEN,
        USAGE_SNAPSHOT
    ).any(preferences::contains)

    private fun parseApps(snapshot: JSONArray, label: String): List<DeviceUsageApp> {
        if (snapshot.length() > MAX_USAGE_APPS) {
            throw IOException("$label exceeds the supported app limit.")
        }
        val apps = try {
            (0 until snapshot.length()).map { index ->
                val app = snapshot.getJSONObject(index)
                DeviceUsageApp(
                    packageName = app.getString("package"),
                    displayName = app.getString("app_name"),
                    category = app.getString("category"),
                    durationMinutes = app.getInt("duration_minutes")
                )
            }
        } catch (error: JSONException) {
            throw IOException("$label could not be read. It has been preserved.", error)
        }
        validateApps(apps, label)
        return apps
    }

    private fun validateApps(apps: List<DeviceUsageApp>, label: String) {
        if (apps.size > MAX_USAGE_APPS ||
            apps.any { !it.hasValidSnapshotFields() } ||
            apps.sumOf { it.durationMinutes.toLong() } > MAX_USAGE_MINUTES
        ) {
            throw IOException("$label contains invalid app data or totals.")
        }
    }

    private fun appsToJson(apps: List<DeviceUsageApp>) = JSONArray().apply {
        apps.forEach { app ->
            put(
                JSONObject()
                    .put("package", app.packageName)
                    .put("app_name", app.displayName)
                    .put("category", app.category)
                    .put("duration_minutes", app.durationMinutes)
            )
        }
    }

    private fun encryptRecoverableUsageSnapshots(
        snapshots: List<RecoverableUsageSnapshot>
    ): String {
        if (snapshots.size > MAX_RECOVERABLE_USAGE_SNAPSHOTS) {
            throw RecoveryArchiveFullException()
        }
        val json = JSONArray().apply {
            snapshots.forEach { snapshot ->
                put(
                    JSONObject()
                        .put("usage_date", snapshot.usageDate)
                        .put("reason", snapshot.reason.storageValue)
                        .put("apps", appsToJson(snapshot.apps))
                )
            }
        }
        val encrypted = try {
            encrypt(json.toString())
        } catch (error: GeneralSecurityException) {
            throw IOException("Usage recovery data could not be encrypted securely.", error)
        } catch (error: IllegalStateException) {
            throw IOException("Usage recovery data could not be encrypted securely.", error)
        } catch (error: SecurityException) {
            throw IOException("Usage recovery data could not be encrypted securely.", error)
        }
        if (encrypted.toByteArray(Charsets.UTF_8).size > MAX_RECOVERABLE_ARCHIVE_BYTES) {
            throw RecoveryArchiveFullException()
        }
        return encrypted
    }

    private fun recoverableUsageSnapshotsFromJson(json: String): List<RecoverableUsageSnapshot> {
        val snapshots = try {
            JSONArray(json)
        } catch (error: JSONException) {
            throw IOException("Saved recovery snapshots could not be read.", error)
        }
        return try {
            (0 until snapshots.length()).map { index ->
                val snapshot = snapshots.getJSONObject(index)
                val usageDate = snapshot.getString("usage_date")
                val reasonValue = snapshot.getString("reason")
                val reason = UsageUploadRecoveryReason.entries.firstOrNull {
                    it.storageValue == reasonValue
                } ?: throw IOException("A saved recovery reason is invalid.")
                if (!isValidUsageDate(usageDate)) {
                    throw IOException("A saved recovery date is invalid.")
                }
                RecoverableUsageSnapshot(
                    usageDate = usageDate,
                    reason = reason,
                    apps = parseApps(snapshot.getJSONArray("apps"), "A saved recovery snapshot")
                )
            }
        } catch (error: JSONException) {
            throw IOException("Saved recovery snapshots could not be read.", error)
        }
    }

    private fun encrypt(value: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val encrypted = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        val combined = cipher.iv + encrypted
        return Base64.encodeToString(combined, Base64.NO_WRAP)
    }

    private fun decrypt(key: String): String? {
        val encoded = preferences.getString(key, null) ?: return null
        return decryptValue(encoded)
    }

    private fun decryptValue(encoded: String): String {
        val combined = try {
            Base64.decode(encoded, Base64.NO_WRAP)
        } catch (_: IllegalArgumentException) {
            throw IllegalStateException("Saved device credential is invalid.")
        }
        if (combined.size <= GCM_IV_LENGTH_BYTES) {
            throw IllegalStateException("Saved device credential is invalid.")
        }
        val iv = combined.copyOfRange(0, GCM_IV_LENGTH_BYTES)
        val encrypted = combined.copyOfRange(GCM_IV_LENGTH_BYTES, combined.size)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv))
        return cipher.doFinal(encrypted).toString(Charsets.UTF_8)
    }

    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEY_STORE).apply { load(null) }
        val existing = keyStore.getKey(KEY_ALIAS, null) as? SecretKey
        if (existing != null) return existing

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEY_STORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build()
        )
        return generator.generateKey()
    }

    companion object {
        private const val PREFERENCES_NAME = "sotiria_pairing"
        private const val ANDROID_KEY_STORE = "AndroidKeyStore"
        private const val KEY_ALIAS = "sotiria_pairing_credential_key"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val GCM_IV_LENGTH_BYTES = 12
        private const val GCM_TAG_LENGTH_BITS = 128
        private const val PENDING_PAIRING = "pending_pairing"
        private const val PENDING_TOKEN = "pending_token"
        private const val PENDING_DEVICE_TOKEN = "pending_device_token"
        private const val PENDING_DEVICE_NAME = "pending_device_name"
        private const val DEVICE_TOKEN = "device_token"
        private const val USAGE_DATE = "usage_date"
        private const val USAGE_ISSUE_TOKEN = "usage_issue_token"
        private const val USAGE_TICKET_TOKEN = "usage_ticket_token"
        private const val USAGE_SNAPSHOT = "usage_snapshot"
        private const val USAGE_RECOVERY_SNAPSHOTS = "usage_recovery_snapshots"
        private const val MAX_USAGE_APPS = 200
        private const val MAX_USAGE_MINUTES = 1440L
        private const val MAX_RECOVERABLE_USAGE_SNAPSHOTS = 20
        private const val MAX_RECOVERABLE_ARCHIVE_BYTES = 512 * 1024

        fun newToken(): String {
            val bytes = ByteArray(32)
            SecureRandom().nextBytes(bytes)
            return Base64.encodeToString(
                bytes,
                Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING
            )
        }
    }
}
