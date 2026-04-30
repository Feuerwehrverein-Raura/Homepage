package ch.fwvraura.vorstand.data.model

import com.google.gson.annotations.SerializedName

/**
 * Eine einzelne Zahlung (= 1 Mitglied + 1 Jahr) aus membership_fee_payments,
 * angereichert mit Mitglieder-Daten via JOIN auf members.
 */
data class MembershipFeePayment(
    val id: String,
    @SerializedName("member_id") val memberId: String,
    val year: Int,
    val amount: String? = null,
    @SerializedName("reference_nr") val referenceNr: String? = null,
    @SerializedName("bank_reference") val bankReference: String? = null,
    /** "offen" oder "bezahlt" */
    val status: String? = null,
    @SerializedName("paid_date") val paidDate: String? = null,
    @SerializedName("payment_method") val paymentMethod: String? = null,
    val notes: String? = null,
    @SerializedName("created_at") val createdAt: String? = null,
    @SerializedName("updated_at") val updatedAt: String? = null,
    // Aus dem JOIN auf members
    val vorname: String? = null,
    val nachname: String? = null,
    val email: String? = null,
    val strasse: String? = null,
    val plz: String? = null,
    val ort: String? = null,
    @SerializedName("member_status") val memberStatus: String? = null
)

/** Antwort von GET /membership-fees/summary?year=YYYY */
data class MembershipFeeSummary(
    val total: Int = 0,
    val paid: Int = 0,
    val open: Int = 0,
    @SerializedName("total_amount") val totalAmount: String? = null,
    @SerializedName("paid_amount") val paidAmount: String? = null,
    @SerializedName("open_amount") val openAmount: String? = null
)

/** Body fuer PATCH /membership-fees/payments/:id/pay */
data class MarkFeePaidRequest(
    @SerializedName("paid_date") val paidDate: String? = null,
    @SerializedName("payment_method") val paymentMethod: String? = null,
    val notes: String? = null
)

/** Eintrag aus membership_fee_settings — Jahres-Einstellung (Betrag, GV, Faelligkeit). */
data class MembershipFeeSettings(
    val id: String? = null,
    val year: Int,
    val amount: String? = null,
    @SerializedName("gv_date") val gvDate: String? = null,
    @SerializedName("due_date") val dueDate: String? = null,
    val description: String? = null
)

/** Body fuer POST /membership-fees/settings (Upsert). */
data class FeeSettingsUpsert(
    val year: Int,
    val amount: String,
    @SerializedName("gv_date") val gvDate: String? = null,
    @SerializedName("due_date") val dueDate: String? = null,
    val description: String? = null
)

/** Body fuer POST /membership-fees/payments/generate */
data class GeneratePaymentsRequest(
    val year: Int,
    val amount: String
)

/** Antwort von POST /membership-fees/payments/generate */
data class GeneratePaymentsResponse(
    val created: Int = 0,
    val skipped: Int = 0,
    val total: Int = 0
)

/** Body fuer PATCH /membership-fees/payments/:id/reference */
data class SetReferenceRequest(
    @SerializedName("reference_nr") val referenceNr: String
)

/** Body fuer POST /membership-fees/send-email-bulk */
data class SendEmailBulkRequest(val year: Int)

/** Antwort von POST /membership-fees/send-email-bulk */
data class SendEmailBulkResponse(
    val year: Int = 0,
    val candidates: Int = 0,
    val success: Int = 0,
    val failed: Int = 0,
    val skipped: Int = 0,
    val failures: List<SendFailure> = emptyList()
)

data class SendFailure(
    @SerializedName("member_id") val memberId: String? = null,
    val name: String? = null,
    val error: String? = null
)
