package ch.fwvraura.vorstand.data.model

import com.google.gson.annotations.SerializedName

data class Shift(
    val id: String,
    @SerializedName("event_id") val eventId: String,
    val name: String,
    val description: String? = null,
    val date: String? = null,
    @SerializedName("start_time") val startTime: String? = null,
    @SerializedName("end_time") val endTime: String? = null,
    val needed: Int? = null,
    val bereich: String? = null,
    val filled: Int? = null,
    val registrations: ShiftRegistrations? = null
)

data class ShiftRegistrations(
    val approved: List<EventRegistration> = emptyList(),
    val pending: List<EventRegistration> = emptyList(),
    @SerializedName("approvedCount") val approvedCount: Int? = null,
    @SerializedName("pendingCount") val pendingCount: Int? = null,
    @SerializedName("spotsLeft") val spotsLeft: Int? = null
)

data class ShiftCreate(
    @SerializedName("event_id") val eventId: String? = null,
    val name: String,
    val description: String? = null,
    val date: String? = null,
    @SerializedName("start_time") val startTime: String? = null,
    @SerializedName("end_time") val endTime: String? = null,
    val needed: Int? = null,
    val bereich: String? = null
)

data class EventRegistration(
    val id: String,
    val name: String? = null,
    @SerializedName("shift_id") val shiftId: String? = null,
    @SerializedName("member_id") val memberId: String? = null,
    @SerializedName("guest_name") val guestName: String? = null,
    @SerializedName("guest_email") val guestEmail: String? = null,
    val phone: String? = null,
    val notes: String? = null,
    val status: String? = null,
    @SerializedName("created_at") val createdAt: String? = null,
    val vorname: String? = null,
    val nachname: String? = null
) {
    val displayName: String
        get() = name
            ?: if (vorname != null && nachname != null) "$vorname $nachname"
            else guestName ?: "Unbekannt"
}
