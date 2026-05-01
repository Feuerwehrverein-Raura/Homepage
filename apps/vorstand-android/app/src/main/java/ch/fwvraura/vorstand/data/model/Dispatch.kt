package ch.fwvraura.vorstand.data.model

import com.google.gson.annotations.SerializedName

// ============================================
// E-MAIL TEMPLATES
// ============================================

data class EmailTemplate(
    val id: String,
    val name: String,
    val type: String? = null,
    val subject: String? = null,
    val body: String? = null,
    val variables: Any? = null,
    @SerializedName("created_at") val createdAt: String? = null
)

// ============================================
// E-MAIL SENDEN
// ============================================

data class SendEmailRequest(
    val to: String? = null,
    val subject: String? = null,
    val body: String? = null,
    @SerializedName("template_id") val templateId: String? = null,
    val variables: Map<String, String>? = null,
    @SerializedName("member_id") val memberId: String? = null,
    @SerializedName("event_id") val eventId: String? = null
)

data class BulkEmailRequest(
    @SerializedName("member_ids") val memberIds: List<String>,
    @SerializedName("template_id") val templateId: String? = null,
    val subject: String? = null,
    val body: String? = null,
    val variables: Map<String, String>? = null
)

data class EmailSendResponse(
    val success: Boolean,
    @SerializedName("messageId") val messageId: String? = null,
    val error: String? = null
)

data class BulkEmailResponse(
    val success: Boolean,
    val sent: Int? = null,
    val failed: Int? = null,
    val errors: List<String>? = null
)

// ============================================
// SMART DISPATCH (E-Mail oder Brief automatisch)
// ============================================

data class SmartDispatchRequest(
    @SerializedName("template_group") val templateGroup: String,
    @SerializedName("member_ids") val memberIds: List<String>,
    val variables: Map<String, String>? = null,
    val staging: Boolean = true
)

data class SmartDispatchResponse(
    val success: Boolean,
    val summary: DispatchSummary? = null,
    val details: List<Any>? = null
)

data class DispatchSummary(
    val email: Int = 0,
    @SerializedName("brief_ch") val briefCh: Int = 0,
    @SerializedName("brief_de") val briefDe: Int = 0,
    val skipped: Int = 0
)

// ============================================
// PINGEN (BRIEFVERSAND)
// ============================================

data class PingenAccount(
    val name: String? = null,
    val balance: Int = 0,
    val currency: String = "CHF",
    @SerializedName("isStaging") val isStaging: Boolean = false
)

data class PingenStats(
    val total: Int = 0,
    val sent: Int = 0,
    val pending: Int = 0,
    val failed: Int = 0,
    @SerializedName("last_30_days") val last30Days: Int = 0,
    @SerializedName("last_7_days") val last7Days: Int = 0
)

data class PingenLetter(
    val id: String,
    @SerializedName("external_id") val externalId: String? = null,
    @SerializedName("member_id") val memberId: String? = null,
    @SerializedName("member_name") val memberName: String? = null,
    @SerializedName("event_id") val eventId: String? = null,
    @SerializedName("event_title") val eventTitle: String? = null,
    val subject: String? = null,
    val status: String? = null,
    @SerializedName("created_at") val createdAt: String? = null
)

data class PingenLetterStatus(
    @SerializedName("letterId") val letterId: String,
    val status: String,
    val price: Int? = null,
    val pages: Int? = null,
    @SerializedName("sentAt") val sentAt: String? = null
)

data class PingenSendManualRequest(
    @SerializedName("member_id") val memberId: String,
    @SerializedName("event_id") val eventId: String? = null,
    val subject: String,
    val body: String,
    val staging: Boolean = true
)

data class PingenSendResponse(
    val success: Boolean,
    @SerializedName("letterId") val letterId: String? = null,
    val error: String? = null
)

data class PostMembersResponse(
    val count: Int,
    val members: List<PostMember>
)

data class PostMember(
    val id: String,
    val name: String,
    val address: String? = null,
    val email: String? = null,
    val strasse: String? = null,
    val plz: String? = null,
    val ort: String? = null
)

// ============================================
// PINGEN PDF-VERSAND
// ============================================

data class PingenSendPdfRequest(
    @SerializedName("member_id") val memberId: String? = null,
    @SerializedName("event_id") val eventId: String? = null,
    @SerializedName("pdf_base64") val pdfBase64: String,
    val recipient: PingenRecipient? = null,
    val staging: Boolean = true
)

data class PingenRecipient(
    val name: String,
    val street: String,
    val zip: String,
    val city: String,
    val country: String = "CH"
)

data class PingenBulkPdfRequest(
    @SerializedName("pdf_base64") val pdfBase64: String,
    val subject: String? = null,
    @SerializedName("member_ids") val memberIds: List<String>? = null,
    val staging: Boolean = true
)

data class PingenBulkPdfResponse(
    val totalRecipients: Int = 0,
    val successCount: Int = 0,
    val failedCount: Int = 0,
    val success: List<PingenBulkSuccess>? = null,
    val failed: List<PingenBulkFailure>? = null,
    val staging: Boolean = false
)

data class PingenBulkSuccess(
    val name: String,
    val letterId: String? = null
)

data class PingenBulkFailure(
    val name: String,
    val error: String? = null
)

// ============================================
// VERSAND-PROTOKOLL
// ============================================

data class DispatchLogEntry(
    val id: String? = null,
    val type: String? = null,
    @SerializedName("member_id") val memberId: String? = null,
    @SerializedName("member_name") val memberName: String? = null,
    @SerializedName("event_id") val eventId: String? = null,
    val subject: String? = null,
    val status: String? = null,
    @SerializedName("created_at") val createdAt: String? = null
)
