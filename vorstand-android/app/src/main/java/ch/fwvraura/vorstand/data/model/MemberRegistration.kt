package ch.fwvraura.vorstand.data.model

import com.google.gson.annotations.SerializedName

/**
 * MemberRegistration – Mitgliedschaftsantrag aus GET /member-registrations.
 * Eine Person beantragt die Aufnahme in den Feuerwehrverein Raura.
 * Enthaelt alle persoenlichen Daten des Antragstellers sowie den
 * Bearbeitungsstatus (pending/approved/rejected).
 */
data class MemberRegistration(
    /** Eindeutige ID des Mitgliedschaftsantrags. */
    val id: String,

    /** Vorname des Antragstellers. */
    val vorname: String,

    /** Nachname des Antragstellers. */
    val nachname: String,

    /** E-Mail-Adresse des Antragstellers. */
    val email: String? = null,

    /** Strasse und Hausnummer. */
    val strasse: String? = null,

    /** Postleitzahl. */
    val plz: String? = null,

    /** Wohnort. */
    val ort: String? = null,

    /** Festnetznummer. */
    val telefon: String? = null,

    /** Mobilnummer. */
    val mobile: String? = null,

    /** Feuerwehr-Status, z.B. ob die Person aktiv in der Feuerwehr ist. */
    @SerializedName("feuerwehr_status") val feuerwehrStatus: String? = null,

    /** Bevorzugte Korrespondenzmethode (z.B. "email" oder "post"). */
    @SerializedName("korrespondenz_methode") val korrespondenzMethode: String? = null,

    /** Bearbeitungsstatus des Antrags: "pending", "approved" oder "rejected". */
    val status: String? = null,

    /** ID des Vorstandsmitglieds, das den Antrag bearbeitet hat. */
    @SerializedName("processed_by") val processedBy: String? = null,

    /** Zeitstempel der Bearbeitung (ISO-Format). */
    @SerializedName("processed_at") val processedAt: String? = null,

    /** Ablehnungsgrund (nur gesetzt wenn status == "rejected"). */
    @SerializedName("rejection_reason") val rejectionReason: String? = null,

    /** Zeitstempel der Antragserstellung (ISO-Format). */
    @SerializedName("created_at") val createdAt: String? = null
) {
    /** Voller Name, zusammengesetzt aus Vorname und Nachname. */
    val fullName: String get() = "$vorname $nachname"
}

/**
 * PendingCount – Anzahl offener (noch nicht bearbeiteter) Mitgliedschaftsantraege.
 * Wird z.B. fuer das Badge im Navigations-Menu verwendet,
 * um dem Vorstand die Anzahl ausstehender Antraege anzuzeigen.
 */
data class PendingCount(
    /** Anzahl der offenen Antraege. */
    val count: Int
)

/**
 * ApproveRequest – Request-Body fuer POST /member-registrations/{id}/approve.
 * Wird gesendet, wenn ein Vorstandsmitglied einen Mitgliedschaftsantrag genehmigt.
 */
data class ApproveRequest(
    /**
     * Mitgliedschaftsstatus, der dem neuen Mitglied zugewiesen wird.
     * Moegliche Werte: "Aktiv" (mit Feuerwehrdienst) oder "Passiv" (Goenner/Unterstuetzer).
     */
    @SerializedName("memberStatus") val memberStatus: String
)

/**
 * RejectRequest – Request-Body fuer POST /member-registrations/{id}/reject.
 * Wird gesendet, wenn ein Vorstandsmitglied einen Mitgliedschaftsantrag ablehnt.
 */
data class RejectRequest(
    /** Optionaler Ablehnungsgrund, der dem Antragsteller mitgeteilt wird. */
    val reason: String? = null
)
