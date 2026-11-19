package com.sotiria.companion

import org.json.JSONException
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.net.URISyntaxException
import java.net.URL
import java.security.MessageDigest

data class PairingApiResult(
    val status: String,
    val retry: Boolean
)

class PairingApiException(val pairingStatus: String) : IOException(
    when (pairingStatus) {
        "invalid_pairing" -> "This pairing code is invalid."
        "pairing_expired" -> "This pairing code has expired. Ask the parent for a new one."
        "child_inactive" -> "This child profile is inactive."
        "device_revoked" -> "This phone has been revoked."
        "invalid_pending_credential" -> "The saved pairing could not be verified. Start again with a new code."
        else -> "This pairing is no longer available. Ask the parent to start a new one."
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
    )

    fun activate(pendingTokenHash: String, deviceTokenHash: String): PairingApiResult = post(
        "/api/android/pairing/activate",
        JSONObject()
            .put("pendingTokenHash", pendingTokenHash)
            .put("deviceTokenHash", deviceTokenHash)
    )

    private fun post(path: String, body: JSONObject): PairingApiResult {
        val base = BuildConfig.PAIRING_API_BASE_URL.trimEnd('/')
        if (base.isBlank()) {
            throw IllegalStateException("Pairing server URL has not been configured.")
        }

        val uri = try {
            URI(base)
        } catch (_: URISyntaxException) {
            throw IllegalStateException("Pairing server URL is invalid.")
        }
        val localHttp = uri.host == "localhost" || uri.host == "127.0.0.1"
        if (
            !uri.isAbsolute || uri.host.isNullOrBlank() || !uri.path.isNullOrEmpty() ||
            uri.rawUserInfo != null || uri.query != null || uri.fragment != null ||
            (uri.scheme != "https" && !(uri.scheme == "http" && localHttp))
        ) {
            throw IllegalStateException("Pairing server must use HTTPS.")
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
            return PairingApiResult(status, response.optBoolean("retry"))
        } finally {
            connection.disconnect()
        }
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
