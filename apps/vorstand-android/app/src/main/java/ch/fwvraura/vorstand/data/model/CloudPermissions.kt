package ch.fwvraura.vorstand.data.model

import com.google.gson.annotations.SerializedName

/** Antwort von GET /members/:id/nextcloud-admin */
data class NextcloudAdminStatus(
    @SerializedName("has_authentik") val hasAuthentik: Boolean = false,
    @SerializedName("nextcloud_admin") val nextcloudAdmin: Boolean = false
)

/** Antwort von GET /members/:id/vorstand-group */
data class VorstandGroupStatus(
    @SerializedName("has_authentik") val hasAuthentik: Boolean = false,
    @SerializedName("vorstand_group") val vorstandGroup: Boolean = false
)

/** Antwort von GET /members/:id/social-media-group */
data class SocialMediaGroupStatus(
    @SerializedName("has_authentik") val hasAuthentik: Boolean = false,
    @SerializedName("social_media_group") val socialMediaGroup: Boolean = false
)

/** Body fuer POST /members/:id/{nextcloud-admin,vorstand-group,social-media-group} */
data class CloudPermissionUpdate(val enabled: Boolean)
