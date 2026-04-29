package ch.fwvraura.members.data.model

import com.google.gson.annotations.SerializedName

/** Body fuer POST /registrations/public. */
data class PublicRegistrationRequest(
    val type: String = "participant",
    val eventId: String,
    val eventTitle: String? = null,
    val organizerEmail: String? = null,
    val name: String,
    val email: String? = null,
    val phone: String? = null,
    val participants: Int? = null,
    val notes: String? = null,
    val allergies: String? = null
)

data class PublicRegistrationResponse(
    val success: Boolean = false,
    val message: String? = null,
    val registrationId: String? = null,
    val isMember: Boolean? = null
)

/** Eine Anmeldung im Organisator-Dashboard. */
data class EventRegistration(
    val id: String,
    @SerializedName("event_id") val eventId: String? = null,
    @SerializedName("member_id") val memberId: String? = null,
    @SerializedName("guest_name") val guestName: String? = null,
    @SerializedName("guest_email") val guestEmail: String? = null,
    val status: String? = null,
    val notes: String? = null,
    @SerializedName("created_at") val createdAt: String? = null,
    @SerializedName("approved_at") val approvedAt: String? = null,
    @SerializedName("member_vorname") val memberVorname: String? = null,
    @SerializedName("member_nachname") val memberNachname: String? = null,
    @SerializedName("parsed_notes") val parsedNotes: ParsedNotes? = null
)

data class ParsedNotes(
    val phone: String? = null,
    val participants: Int? = null,
    val notes: String? = null,
    val allergies: String? = null
)
