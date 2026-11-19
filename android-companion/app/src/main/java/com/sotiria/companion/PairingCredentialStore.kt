package com.sotiria.companion

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import java.security.SecureRandom
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

    private fun encrypt(value: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val encrypted = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        val combined = cipher.iv + encrypted
        return Base64.encodeToString(combined, Base64.NO_WRAP)
    }

    private fun decrypt(key: String): String? {
        val encoded = preferences.getString(key, null) ?: return null
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
