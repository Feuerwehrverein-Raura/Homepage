package ch.fwvraura.vorstand.util

import android.util.Base64
import java.security.KeyFactory
import java.security.spec.PKCS8EncodedKeySpec
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec
import javax.crypto.spec.OAEPParameterSpec
import java.security.spec.MGF1ParameterSpec
import javax.crypto.spec.PSource

object BitwardenCrypto {

    data class SymmetricKey(val encKey: ByteArray, val macKey: ByteArray)

    // ============================================
    // KEY DERIVATION
    // ============================================

    fun deriveMasterKey(password: String, email: String, iterations: Int): ByteArray {
        val spec = PBEKeySpec(
            password.toCharArray(),
            email.lowercase().trim().toByteArray(Charsets.UTF_8),
            iterations,
            256
        )
        val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
        return factory.generateSecret(spec).encoded
    }

    fun deriveMasterPasswordHash(masterKey: ByteArray, password: String): String {
        val keyChars = CharArray(masterKey.size) { (masterKey[it].toInt() and 0xFF).toChar() }
        val spec = PBEKeySpec(
            keyChars,
            password.toByteArray(Charsets.UTF_8),
            1,
            256
        )
        val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
        val hash = factory.generateSecret(spec).encoded
        return Base64.encodeToString(hash, Base64.NO_WRAP)
    }

    fun deriveStretchedKey(masterKey: ByteArray): SymmetricKey {
        val encKey = hkdfExpand(masterKey, "enc".toByteArray(Charsets.UTF_8), 32)
        val macKey = hkdfExpand(masterKey, "mac".toByteArray(Charsets.UTF_8), 32)
        return SymmetricKey(encKey, macKey)
    }

    // ============================================
    // HKDF-EXPAND (RFC 5869)
    // ============================================

    fun hkdfExpand(prk: ByteArray, info: ByteArray, length: Int): ByteArray {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(prk, "HmacSHA256"))

        val result = ByteArray(length)
        var prev = ByteArray(0)
        var offset = 0
        var counter = 1

        while (offset < length) {
            mac.reset()
            mac.update(prev)
            mac.update(info)
            mac.update(counter.toByte())
            prev = mac.doFinal()

            val toCopy = minOf(prev.size, length - offset)
            System.arraycopy(prev, 0, result, offset, toCopy)
            offset += toCopy
            counter++
        }

        return result
    }

    // ============================================
    // DECRYPTION
    // ============================================

    fun decryptEncString(encString: String?, key: SymmetricKey): String? {
        if (encString.isNullOrBlank()) return null
        val bytes = decryptToBytes(encString, key) ?: return null
        return String(bytes, Charsets.UTF_8)
    }

    fun decryptToBytes(encString: String, key: SymmetricKey): ByteArray? {
        return try {
            val parsed = parseEncString(encString) ?: return null
            when (parsed.type) {
                0 -> decryptAesCbc(parsed.iv!!, parsed.ct, key.encKey)
                1, 2 -> {
                    if (parsed.mac != null) {
                        verifyHmac(parsed.iv!!, parsed.ct, parsed.mac, key.macKey)
                    }
                    decryptAesCbc(parsed.iv!!, parsed.ct, key.encKey)
                }
                else -> null
            }
        } catch (e: Exception) {
            null
        }
    }

    fun decryptSymmetricKey(encString: String, stretchedKey: SymmetricKey): SymmetricKey? {
        val decrypted = decryptToBytes(encString, stretchedKey) ?: return null
        if (decrypted.size != 64) return null
        return SymmetricKey(
            encKey = decrypted.copyOfRange(0, 32),
            macKey = decrypted.copyOfRange(32, 64)
        )
    }

    // ============================================
    // RSA DECRYPTION
    // ============================================

    fun decryptRsaPrivateKey(encString: String, symmetricKey: SymmetricKey): ByteArray? {
        return decryptToBytes(encString, symmetricKey)
    }

    fun rsaDecrypt(ciphertext: ByteArray, privateKeyBytes: ByteArray, useOaepSha1: Boolean = true): ByteArray? {
        return try {
            val keySpec = PKCS8EncodedKeySpec(privateKeyBytes)
            val keyFactory = KeyFactory.getInstance("RSA")
            val privateKey = keyFactory.generatePrivate(keySpec)

            val cipher = if (useOaepSha1) {
                Cipher.getInstance("RSA/ECB/OAEPPadding").apply {
                    init(Cipher.DECRYPT_MODE, privateKey, OAEPParameterSpec(
                        "SHA-1",
                        "MGF1",
                        MGF1ParameterSpec.SHA1,
                        PSource.PSpecified.DEFAULT
                    ))
                }
            } else {
                Cipher.getInstance("RSA/ECB/OAEPWithSHA-256AndMGF1Padding").apply {
                    init(Cipher.DECRYPT_MODE, privateKey)
                }
            }

            cipher.doFinal(ciphertext)
        } catch (e: Exception) {
            null
        }
    }

    fun decryptOrgKey(encOrgKey: String, privateKeyBytes: ByteArray): SymmetricKey? {
        val parsed = parseEncString(encOrgKey) ?: return null
        // Org keys use RSA encryption (types 3-6)
        val useOaepSha1 = parsed.type == 4 || parsed.type == 6
        val decrypted = rsaDecrypt(parsed.ct, privateKeyBytes, useOaepSha1) ?: return null
        if (decrypted.size != 64) return null
        return SymmetricKey(
            encKey = decrypted.copyOfRange(0, 32),
            macKey = decrypted.copyOfRange(32, 64)
        )
    }

    // ============================================
    // INTERNAL HELPERS
    // ============================================

    private data class EncString(
        val type: Int,
        val iv: ByteArray?,
        val ct: ByteArray,
        val mac: ByteArray?
    )

    private fun parseEncString(encString: String): EncString? {
        return try {
            val dotIndex = encString.indexOf('.')
            if (dotIndex < 0) return null

            val type = encString.substring(0, dotIndex).toInt()
            val data = encString.substring(dotIndex + 1)

            when (type) {
                0 -> {
                    // AesCbc256_B64: iv|ct
                    val parts = data.split('|')
                    if (parts.size < 2) return null
                    EncString(type, b64(parts[0]), b64(parts[1]), null)
                }
                1, 2 -> {
                    // AesCbc with HMAC: iv|ct|mac
                    val parts = data.split('|')
                    if (parts.size < 2) return null
                    val mac = if (parts.size >= 3) b64(parts[2]) else null
                    EncString(type, b64(parts[0]), b64(parts[1]), mac)
                }
                3, 4, 5, 6 -> {
                    // RSA: just ciphertext (base64)
                    EncString(type, null, b64(data), null)
                }
                else -> null
            }
        } catch (e: Exception) {
            null
        }
    }

    private fun b64(s: String): ByteArray = Base64.decode(s, Base64.DEFAULT)

    private fun decryptAesCbc(iv: ByteArray, ct: ByteArray, key: ByteArray): ByteArray {
        val cipher = Cipher.getInstance("AES/CBC/PKCS5Padding")
        cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), IvParameterSpec(iv))
        return cipher.doFinal(ct)
    }

    private fun verifyHmac(iv: ByteArray, ct: ByteArray, expectedMac: ByteArray, macKey: ByteArray) {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(macKey, "HmacSHA256"))
        mac.update(iv)
        mac.update(ct)
        val computed = mac.doFinal()

        if (!computed.contentEquals(expectedMac)) {
            throw SecurityException("HMAC verification failed")
        }
    }
}
