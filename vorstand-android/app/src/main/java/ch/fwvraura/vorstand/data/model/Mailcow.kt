package ch.fwvraura.vorstand.data.model

import com.google.gson.annotations.SerializedName

// ============================================
// MAILBOXEN
// ============================================

data class Mailbox(
    val username: String,
    val name: String? = null,
    val domain: String? = null,
    val quota: Long = 0,
    @SerializedName("quota_used") val quotaUsed: Long = 0,
    val active: Int = 1
)

data class MailboxCreateRequest(
    @SerializedName("local_part") val localPart: String,
    val name: String,
    val password: String,
    val quota: Int = 1024,
    val active: Int = 1
)

data class MailboxUpdateRequest(
    val name: String? = null,
    val quota: Int? = null,
    val active: Int? = null,
    val password: String? = null
)

// ============================================
// ALIASE
// ============================================

data class MailAlias(
    val id: Int,
    val address: String,
    val goto: String,
    val domain: String? = null,
    val active: Int = 1
)

data class AliasCreateRequest(
    val address: String,
    val goto: String,
    val active: Int = 1
)

data class AliasUpdateRequest(
    val goto: String? = null,
    val active: Int? = null
)

// ============================================
// QUOTA / SPEICHER
// ============================================

data class QuotaInfo(
    val email: String,
    val name: String? = null,
    val quota: Long = 0,
    @SerializedName("quota_used") val quotaUsed: Long = 0,
    @SerializedName("percent_used") val percentUsed: Int = 0
)

// ============================================
// ZUSTELLLISTE
// ============================================

data class ZustellungResponse(
    val count: Int = 0,
    val emails: List<String>? = null,
    val formatted: String? = null,
    val members: List<ZustellungMember>? = null
)

data class ZustellungMember(
    val id: String,
    val vorname: String? = null,
    val nachname: String? = null,
    val email: String? = null,
    val status: String? = null
) {
    val fullName: String get() = "${vorname ?: ""} ${nachname ?: ""}".trim()
}

data class SyncAliasResponse(
    val success: Boolean = false,
    val action: String? = null,
    val alias: String? = null,
    val recipients: Int? = null,
    val emails: List<String>? = null
)
