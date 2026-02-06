package ch.fwvraura.vorstand.data.model

import com.google.gson.annotations.SerializedName

/**
 * Whitelist-Models für das Kassensystem.
 * Die IP-Whitelist schützt das Kassensystem vor unbefugtem Zugriff.
 */

/**
 * Ein Eintrag in der IP-Whitelist.
 */
data class WhitelistEntry(
    val id: Int,
    @SerializedName("ip_address")
    val ipAddress: String,
    @SerializedName("device_name")
    val deviceName: String?,
    @SerializedName("created_at")
    val createdAt: String,
    @SerializedName("expires_at")
    val expiresAt: String?,
    @SerializedName("created_by")
    val createdBy: String?,
    @SerializedName("is_permanent")
    val isPermanent: Boolean
)

/**
 * Antwort beim Abrufen der eigenen IP-Adresse.
 */
data class MyIpResponse(
    val ip: String
)

/**
 * Antwort beim Prüfen ob die eigene IP freigeschaltet ist.
 */
data class WhitelistCheckResponse(
    val ip: String,
    val whitelisted: Boolean,
    @SerializedName("device_name")
    val deviceName: String?,
    @SerializedName("expires_at")
    val expiresAt: String?,
    @SerializedName("is_permanent")
    val isPermanent: Boolean
)

/**
 * Antwort beim Abrufen des Whitelist-Status (aktiviert/deaktiviert).
 */
data class WhitelistEnabledResponse(
    val enabled: Boolean
)

/**
 * Request zum Hinzufügen einer IP zur Whitelist.
 */
data class WhitelistAddRequest(
    @SerializedName("ip_address")
    val ipAddress: String,
    @SerializedName("device_name")
    val deviceName: String?
)

/**
 * Request zum Aktivieren/Deaktivieren der Whitelist.
 */
data class WhitelistEnabledRequest(
    val enabled: Boolean
)

/**
 * Generische Erfolgs-Antwort.
 */
data class WhitelistSuccessResponse(
    val success: Boolean,
    val message: String?
)
