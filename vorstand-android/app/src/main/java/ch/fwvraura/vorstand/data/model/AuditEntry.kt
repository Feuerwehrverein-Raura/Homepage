package ch.fwvraura.vorstand.data.model

import com.google.gson.annotations.SerializedName

data class AuditEntry(
    val id: String? = null,
    val action: String,
    @SerializedName("new_values") val newValues: Any? = null,
    val email: String? = null,
    @SerializedName("ip_address") val ipAddress: String? = null,
    @SerializedName("created_at") val createdAt: String? = null
)
