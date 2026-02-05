package ch.fwvraura.vorstand.data.model

import com.google.gson.annotations.SerializedName

data class Shift(
    val id: Int,
    @SerializedName("event_id") val eventId: Int,
    val name: String,
    val description: String? = null,
    val date: String? = null,
    @SerializedName("start_time") val startTime: String? = null,
    @SerializedName("end_time") val endTime: String? = null,
    val needed: Int? = null,
    val bereich: String? = null,
    val registrations: List<EventRegistration>? = null
)

data class ShiftCreate(
    @SerializedName("event_id") val eventId: Int? = null,
    val name: String,
    val description: String? = null,
    val date: String? = null,
    @SerializedName("start_time") val startTime: String? = null,
    @SerializedName("end_time") val endTime: String? = null,
    val needed: Int? = null,
    val bereich: String? = null
)

data class EventRegistration(
    val id: Int,
    @SerializedName("shift_id") val shiftId: Int? = null,
    @SerializedName("member_id") val memberId: Int? = null,
    @SerializedName("guest_name") val guestName: String? = null,
    @SerializedName("guest_email") val guestEmail: String? = null,
    val phone: String? = null,
    val notes: String? = null,
    val status: String? = null,
    @SerializedName("created_at") val createdAt: String? = null,
    // Joined member info
    val vorname: String? = null,
    val nachname: String? = null
) {
    val displayName: String
        get() = if (vorname != null && nachname != null) "$vorname $nachname"
        else guestName ?: "Unbekannt"
}
