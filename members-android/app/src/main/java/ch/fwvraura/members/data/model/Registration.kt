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
    val allergies: String? = null,
    /** Bei Schicht-Anmeldungen: IDs der gewaehlten Schichten. */
    val shiftIds: List<String>? = null
)

/** Eine eigene Anmeldung mit eingebetteten Event-Daten (GET /registrations/mine). */
data class MyRegistration(
    val id: String,
    val status: String? = null,
    @SerializedName("event_id") val eventId: String? = null,
    @SerializedName("event_title") val eventTitle: String? = null,
    @SerializedName("event_start_date") val eventStartDate: String? = null,
    @SerializedName("event_end_date") val eventEndDate: String? = null,
    @SerializedName("event_location") val eventLocation: String? = null,
    @SerializedName("created_at") val createdAt: String? = null,
    @SerializedName("shift_ids") val shiftIds: List<String>? = null,
    @SerializedName("parsed_notes") val parsedNotes: ParsedNotes? = null
)

data class PublicRegistrationResponse(
    val success: Boolean = false,
    val message: String? = null,
    val registrationId: String? = null,
    val isMember: Boolean? = null
)

/** Body fuer POST /events/:id/registrations-as-organizer (Organisator fuegt manuell hinzu). */
data class OrganizerAddRegistrationRequest(
    @SerializedName("member_id") val memberId: String? = null,
    @SerializedName("guest_name") val guestName: String? = null,
    @SerializedName("guest_email") val guestEmail: String? = null,
    @SerializedName("guest_phone") val guestPhone: String? = null,
    val participants: Int? = null,
    val notes: String? = null
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
