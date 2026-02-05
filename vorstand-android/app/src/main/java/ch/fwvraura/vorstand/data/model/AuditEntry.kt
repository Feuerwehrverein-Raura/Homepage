package ch.fwvraura.vorstand.data.model

import com.google.gson.annotations.SerializedName

/**
 * Ein Eintrag im Audit-Log — protokolliert jede Aenderung an der Datenbank.
 * Wird von GET /audit zurueckgegeben.
 *
 * @SerializedName mappt den JSON-Feldnamen auf den Kotlin-Feldnamen,
 * wenn diese sich unterscheiden (z.B. "new_values" → newValues).
 *
 * Beispiel-Aktionen:
 * - MEMBER_CREATE: Neues Mitglied erstellt
 * - MEMBER_UPDATE: Mitglied aktualisiert
 * - MEMBER_DELETE: Mitglied geloescht
 * - MEMBER_DELETE_REQUESTED: Loeschantrag gestellt (4-Augen-Prinzip)
 * - MEMBER_REGISTRATION: Neuer Mitgliedschaftsantrag
 * - AUDIT_VIEW: Jemand hat den Audit-Log angesehen
 */
data class AuditEntry(
    val id: String? = null,                                      // Eindeutige ID des Eintrags
    val action: String,                                          // Aktion (z.B. "MEMBER_CREATE")
    @SerializedName("new_values") val newValues: Any? = null,    // Die neuen Werte als JSON-Objekt (Gson deserialisiert als Map)
    val email: String? = null,                                   // Wer hat die Aenderung durchgefuehrt
    @SerializedName("ip_address") val ipAddress: String? = null, // IP-Adresse des Ausfuehrenden
    @SerializedName("created_at") val createdAt: String? = null  // Zeitstempel der Aenderung (ISO-8601)
)
