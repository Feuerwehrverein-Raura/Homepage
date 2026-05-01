package ch.fwvraura.members.data.model

import com.google.gson.annotations.SerializedName

/** Veranstaltung des Feuerwehrvereins Raura. */
data class Event(
    val id: String,
    val title: String,
    val subtitle: String? = null,
    val slug: String? = null,
    val category: String? = null,
    val status: String? = null,
    @SerializedName("start_date") val startDate: String? = null,
    @SerializedName("end_date") val endDate: String? = null,
    val location: String? = null,
    val description: String? = null,
    @SerializedName("registration_deadline") val registrationDeadline: String? = null,
    @SerializedName("registration_required") val registrationRequired: Boolean? = null,
    @SerializedName("max_participants") val maxParticipants: Int? = null,
    val cost: String? = null,
    @SerializedName("organizer_name") val organizerName: String? = null,
    @SerializedName("organizer_email") val organizerEmail: String? = null,
    val shifts: List<Shift>? = null
)

/** Eine Helfer-Schicht eines Events (z.B. Dorffest Bar Samstag Abend). */
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
    /** Aus /events/:id: Liste der bereits angemeldeten Helfer (approved + pending). */
    val registrations: ShiftRegistrations? = null
)

data class ShiftRegistrations(
    val approved: List<ShiftRegistrationEntry> = emptyList(),
    val pending: List<ShiftRegistrationEntry> = emptyList()
)

data class ShiftRegistrationEntry(
    val id: String? = null,
    val name: String? = null
)
