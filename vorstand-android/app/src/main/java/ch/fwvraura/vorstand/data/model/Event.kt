package ch.fwvraura.vorstand.data.model

import com.google.gson.annotations.SerializedName

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
    @SerializedName("max_participants") val maxParticipants: Int? = null,
    val cost: String? = null,
    @SerializedName("organizer_name") val organizerName: String? = null,
    @SerializedName("organizer_email") val organizerEmail: String? = null,
    val shifts: List<Shift>? = null,
    @SerializedName("directRegistrations") val directRegistrations: DirectRegistrations? = null,
    @SerializedName("created_at") val createdAt: String? = null
)

data class DirectRegistrations(
    val pending: List<EventRegistration> = emptyList(),
    val approved: List<EventRegistration> = emptyList()
)

data class EventCreate(
    val title: String,
    val subtitle: String? = null,
    val category: String? = null,
    val status: String? = "planned",
    @SerializedName("start_date") val startDate: String? = null,
    @SerializedName("end_date") val endDate: String? = null,
    val location: String? = null,
    val description: String? = null,
    @SerializedName("registration_deadline") val registrationDeadline: String? = null,
    @SerializedName("max_participants") val maxParticipants: Int? = null,
    val cost: String? = null,
    @SerializedName("organizer_name") val organizerName: String? = null,
    @SerializedName("organizer_email") val organizerEmail: String? = null,
    val shifts: List<ShiftCreate>? = null
)
