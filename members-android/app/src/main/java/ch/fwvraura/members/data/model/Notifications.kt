package ch.fwvraura.members.data.model

import com.google.gson.annotations.SerializedName

/** Eintrag aus notification_preferences (api-members). */
data class NotificationPreference(
    val id: String? = null,
    @SerializedName("member_id") val memberId: String? = null,
    @SerializedName("notification_type") val notificationType: String,
    val enabled: Boolean = true,
    @SerializedName("alternative_email") val alternativeEmail: String? = null
)

/** Body fuer PUT /members/me/notifications. */
data class NotificationsUpdateRequest(
    val preferences: List<NotificationPreference>
)

/** Body fuer POST /members/me/fcm-token (Geraete-Token-Registrierung). */
data class FcmTokenRegistration(
    val token: String,
    @SerializedName("device_id") val deviceId: String? = null,
    val platform: String = "android"
)
