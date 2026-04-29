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
    @SerializedName("organizer_email") val organizerEmail: String? = null
)
