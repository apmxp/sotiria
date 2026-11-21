package com.sotiria.companion

import org.json.JSONException
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.net.URISyntaxException
import java.net.URL
import java.security.MessageDigest
import org.json.JSONArray

data class PairingApiResult(
    val status: String,
    val retry: Boolean
)

data class DeviceProfile(
    val displayName: String,
    val avatar: String,
    val timezone: String,
    val usageDate: String,
    val goalMinutes: Int?
)

data class DeviceUsageApp(
    val packageName: String,
    val displayName: String,
    val category: String,
    val durationMinutes: Int
)

class PairingApiException(val pairingStatus: String) : IOException(
    when (pairingStatus) {
        "invalid_pairing" -> "This pairing code is invalid."
        "pairing_expired" -> "This pairing code has expired. Ask the parent for a new one."
        "child_inactive" -> "This child profile is inactive."
        "device_revoked" -> "This phone has been revoked."
        "invalid_device" -> "This phone is no longer authorized. Ask the parent to authorize it again."
        "invalid_pending_credential" -> "The saved pairing could not be verified. Start again with a new code."
        "ticket_expired" -> "The usage upload expired. Refresh the dashboard to try again."
        "ticket_issue_expired" -> "The usage upload setup expired. Refresh the dashboard to try again."
        "ticket_replaced" -> "A newer usage upload replaced this one. Refresh the dashboard to try again."
        "ticket_conflict" -> "The usage upload changed while it was being sent. Refresh the dashboard to try again."
        "payload_conflict" -> "The usage upload could not be verified. Refresh the dashboard to try again."
        "collection_window_closed" -> "This reporting day is no longer open for upload."
        "timezone_required" -> "Ask your parent to reconnect this phone before syncing usage."
        "usage_day_changed" -> "The reporting day changed. Refresh the dashboard to try again."
        "configuration_error" -> "The pairing server URL is not configured correctly. Install a configured app build."
        else -> "This request could not be completed. Refresh the dashboard or ask your parent for help."
    }
)

class PairingApiResponseException(val responseCode: Int, message: String) : IOException(
    "Pairing server returned HTTP $responseCode: $message"
)

class PairingApiClient {
    fun redeem(
        pairingToken: String,
        pendingTokenHash: String,
        deviceName: String
    ): PairingApiResult = post(
        "/api/android/pairing/redeem",
        JSONObject()
            .put("pairingToken", pairingToken)
            .put("pendingTokenHash", pendingTokenHash)
            .put("credentialKeyId", CREDENTIAL_KEY_ID)
            .put("deviceName", deviceName)
    ).toPairingResult()

    fun activate(pendingTokenHash: String, deviceTokenHash: String): PairingApiResult = post(
        "/api/android/pairing/activate",
        JSONObject()
            .put("pendingTokenHash", pendingTokenHash)
            .put("deviceTokenHash", deviceTokenHash)
    ).toPairingResult()

    fun profile(deviceToken: String): DeviceProfile {
        val response = post(
            "/api/android/device/profile",
            JSONObject().put("deviceToken", deviceToken)
        )
        response.requireOk()
        return DeviceProfile(
            displayName = response.getString("displayName"),
            avatar = response.getString("avatar"),
            timezone = response.getString("timezone"),
            usageDate = response.getString("usageDate"),
            goalMinutes = if (response.isNull("goalMinutes")) null else response.getInt("goalMinutes")
        )
    }

    fun uploadSnapshot(
        deviceToken: String,
        upload: PendingUsageUpload,
        apps: List<DeviceUsageApp>
    ): PairingApiResult {
        val appArray = JSONArray()
        apps.forEach { app ->
            appArray.put(
                JSONObject()
                    .put("package", app.packageName)
                    .put("app_name", app.displayName)
                    .put("category", app.category)
                    .put("duration_minutes", app.durationMinutes)
            )
        }
        return post(
            "/api/android/usage/snapshot",
            JSONObject()
                .put("deviceToken", deviceToken)
                .put("issueRequestToken", upload.issueRequestToken)
                .put("ticketToken", upload.ticketToken)
                .put("usageDate", upload.usageDate)
                .put("apps", appArray)
        ).toPairingResult()
    }

    private fun post(path: String, body: JSONObject): JSONObject {
        val base = BuildConfig.PAIRING_API_BASE_URL.trimEnd('/')
        if (base.isBlank()) {
            throw PairingApiException("configuration_error")
        }

        val uri = try {
            URI(base)
        } catch (_: URISyntaxException) {
            throw PairingApiException("configuration_error")
        }
        val localHttp = uri.host == "localhost" || uri.host == "127.0.0.1"
        if (
            !uri.isAbsolute || uri.host.isNullOrBlank() || !uri.path.isNullOrEmpty() ||
            uri.rawUserInfo != null || uri.query != null || uri.fragment != null ||
            (uri.scheme != "https" && !(uri.scheme == "http" && localHttp))
        ) {
            throw PairingApiException("configuration_error")
        }

        val connection = URL("$base$path").openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = CONNECT_TIMEOUT_MILLIS
            connection.readTimeout = READ_TIMEOUT_MILLIS
            connection.instanceFollowRedirects = false
            connection.doOutput = true
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            connection.outputStream.use { output ->
                output.write(body.toString().toByteArray(Charsets.UTF_8))
            }

            val responseCode = connection.responseCode
            val stream = if (responseCode in 200..299) connection.inputStream else connection.errorStream
            val responseText = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            val response = try {
                JSONObject(responseText)
            } catch (_: JSONException) {
                if (responseCode !in 200..299) {
                    throw PairingApiResponseException(
                        responseCode,
                        "The server returned an invalid error response."
                    )
                }
                throw IOException("Pairing server returned an invalid response.")
            }
            val status = response.optString("status")
            if (responseCode >= 500 || status.isBlank()) {
                val serverError = response.optString("error").takeIf { it.isNotBlank() }
                val message = serverError
                    ?: if (responseCode >= 500) {
                        "Pairing server is temporarily unavailable."
                    } else {
                        "The server returned an invalid response."
                    }
                throw PairingApiResponseException(responseCode, message)
            }
            return response
        } finally {
            connection.disconnect()
        }
    }

    private fun JSONObject.toPairingResult(): PairingApiResult =
        PairingApiResult(optString("status"), optBoolean("retry"))

    private fun JSONObject.requireOk() {
        val status = optString("status")
        if (status != "ok") throw PairingApiException(status)
    }

    companion object {
        private const val CONNECT_TIMEOUT_MILLIS = 10_000
        private const val READ_TIMEOUT_MILLIS = 10_000
        private const val CREDENTIAL_KEY_ID = "android-keystore-v1"

        fun sha256Hex(value: String): String {
            val digest = MessageDigest.getInstance("SHA-256")
                .digest(value.toByteArray(Charsets.UTF_8))
            return buildString(digest.size * 2) {
                digest.forEach { byte ->
                    val unsigned = byte.toInt() and 0xff
                    append(HEX_CHARS[unsigned ushr 4])
                    append(HEX_CHARS[unsigned and 0x0f])
                }
            }
        }

        private const val HEX_CHARS = "0123456789abcdef"
    }
}
