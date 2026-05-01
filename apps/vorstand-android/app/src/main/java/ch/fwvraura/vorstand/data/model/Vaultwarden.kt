package ch.fwvraura.vorstand.data.model

import com.google.gson.annotations.SerializedName

// ============================================
// PRE-LOGIN
// ============================================

data class VaultPreLoginRequest(
    val email: String
)

data class VaultPreLoginResponse(
    @SerializedName("kdf") val kdf: Int = 0,
    @SerializedName("kdfIterations") val kdfIterations: Int = 600000,
    @SerializedName("kdfMemory") val kdfMemory: Int? = null,
    @SerializedName("kdfParallelism") val kdfParallelism: Int? = null
)

// ============================================
// LOGIN RESPONSE
// ============================================

data class VaultLoginResponse(
    @SerializedName("access_token") val accessToken: String,
    @SerializedName("token_type") val tokenType: String? = null,
    @SerializedName("expires_in") val expiresIn: Int? = null,
    @SerializedName("refresh_token") val refreshToken: String? = null,
    @SerializedName("Key") val key: String? = null,
    @SerializedName("PrivateKey") val privateKey: String? = null,
    @SerializedName("Kdf") val kdf: Int? = null,
    @SerializedName("KdfIterations") val kdfIterations: Int? = null,
    @SerializedName("ForcePasswordReset") val forcePasswordReset: Boolean? = null,
    @SerializedName("ResetMasterPassword") val resetMasterPassword: Boolean? = null
)

// ============================================
// SYNC RESPONSE
// ============================================

data class VaultSyncResponse(
    @SerializedName("profile") val profile: VaultProfile? = null,
    @SerializedName("ciphers") val ciphers: List<VaultCipher>? = null,
    @SerializedName("folders") val folders: List<VaultFolder>? = null
)

data class VaultProfile(
    @SerializedName("id") val id: String? = null,
    @SerializedName("name") val name: String? = null,
    @SerializedName("email") val email: String? = null,
    @SerializedName("organizations") val organizations: List<VaultOrganization>? = null
)

data class VaultOrganization(
    @SerializedName("id") val id: String? = null,
    @SerializedName("name") val name: String? = null,
    @SerializedName("key") val key: String? = null
)

data class VaultFolder(
    @SerializedName("id") val id: String? = null,
    @SerializedName("name") val name: String? = null
)

// ============================================
// CIPHER (verschluesselt)
// ============================================

data class VaultCipher(
    @SerializedName("id") val id: String? = null,
    @SerializedName("type") val type: Int = 1,
    @SerializedName("name") val name: String? = null,
    @SerializedName("notes") val notes: String? = null,
    @SerializedName("organizationId") val organizationId: String? = null,
    @SerializedName("folderId") val folderId: String? = null,
    @SerializedName("login") val login: VaultCipherLogin? = null,
    @SerializedName("card") val card: VaultCipherCard? = null,
    @SerializedName("identity") val identity: VaultCipherIdentity? = null
)

data class VaultCipherLogin(
    @SerializedName("username") val username: String? = null,
    @SerializedName("password") val password: String? = null,
    @SerializedName("totp") val totp: String? = null,
    @SerializedName("uris") val uris: List<VaultCipherUri>? = null
)

data class VaultCipherUri(
    @SerializedName("uri") val uri: String? = null
)

data class VaultCipherCard(
    @SerializedName("cardholderName") val cardholderName: String? = null,
    @SerializedName("brand") val brand: String? = null,
    @SerializedName("number") val number: String? = null,
    @SerializedName("expMonth") val expMonth: String? = null,
    @SerializedName("expYear") val expYear: String? = null,
    @SerializedName("code") val code: String? = null
)

data class VaultCipherIdentity(
    @SerializedName("firstName") val firstName: String? = null,
    @SerializedName("lastName") val lastName: String? = null,
    @SerializedName("company") val company: String? = null,
    @SerializedName("email") val email: String? = null,
    @SerializedName("phone") val phone: String? = null,
    @SerializedName("address1") val address1: String? = null,
    @SerializedName("city") val city: String? = null,
    @SerializedName("state") val state: String? = null,
    @SerializedName("postalCode") val postalCode: String? = null,
    @SerializedName("country") val country: String? = null
)

// ============================================
// ENTSCHLUESSELTE DARSTELLUNG (fuer UI)
// ============================================

data class DecryptedVaultItem(
    val id: String,
    val type: Int,
    val name: String,
    val subtitle: String?,
    val details: String?,
    val notes: String?,
    val organizationName: String?,
    val copyFields: Map<String, String>
) {
    companion object {
        const val TYPE_LOGIN = 1
        const val TYPE_SECURE_NOTE = 2
        const val TYPE_CARD = 3
        const val TYPE_IDENTITY = 4
    }
}
