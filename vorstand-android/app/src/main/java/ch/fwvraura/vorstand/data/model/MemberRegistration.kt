package ch.fwvraura.vorstand.data.model

import com.google.gson.annotations.SerializedName

data class MemberRegistration(
    val id: String,
    val vorname: String,
    val nachname: String,
    val email: String? = null,
    val strasse: String? = null,
    val plz: String? = null,
    val ort: String? = null,
    val telefon: String? = null,
    val mobile: String? = null,
    @SerializedName("feuerwehr_status") val feuerwehrStatus: String? = null,
    @SerializedName("korrespondenz_methode") val korrespondenzMethode: String? = null,
    val status: String? = null,
    @SerializedName("processed_by") val processedBy: String? = null,
    @SerializedName("processed_at") val processedAt: String? = null,
    @SerializedName("rejection_reason") val rejectionReason: String? = null,
    @SerializedName("created_at") val createdAt: String? = null
) {
    val fullName: String get() = "$vorname $nachname"
}

data class PendingCount(
    val count: Int
)

data class ApproveRequest(
    @SerializedName("memberStatus") val memberStatus: String
)

data class RejectRequest(
    val reason: String? = null
)
