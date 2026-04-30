package ch.fwvraura.members.data.model

import com.google.gson.annotations.SerializedName

/** Antwort von GET /members/me/accesses — alle Zugänge eines Mitglieds. */
data class AccessesResponse(
    val functionEmails: List<FunctionEmail> = emptyList(),
    val nextcloudFolders: List<NextcloudFolder> = emptyList(),
    val systemAccesses: List<SystemAccess> = emptyList(),
    val serviceAccounts: List<ServiceAccount> = emptyList()
)

/** Ein Web-System auf das das Mitglied Zugriff hat (Website, Nextcloud, etc). */
data class SystemAccess(
    val system: String,
    val url: String? = null,
    val access: String? = null,
    val enabled: Boolean = true
)

/** Ein Nextcloud-Gruppen-Ordner. Schema kommt direkt von Nextcloud — nur die wichtigen Felder. */
data class NextcloudFolder(
    val id: Int? = null,
    @SerializedName("mount_point") val mountPoint: String? = null
)

/** Funktions-E-Mail-Konto (z.B. praesident@fwv-raura.ch fuer den Praesidenten). */
data class FunctionEmail(
    val function: String,
    val email: String,
    val password: String? = null,
    val server: String? = null,
    val imapPort: Int? = null,
    val smtpPort: Int? = null,
    val webmail: String? = null
)

/** Service-Account fuer geteilte Logins (z.B. Kasse, KDS). */
data class ServiceAccount(
    val accountName: String? = null,
    val username: String,
    val displayName: String? = null,
    val password: String? = null,
    val description: String? = null,
    val rotationDays: Int? = null,
    val updatedAt: String? = null,
    val nextRotation: String? = null
)
