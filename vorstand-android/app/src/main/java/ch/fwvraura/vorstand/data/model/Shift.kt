package ch.fwvraura.vorstand.data.model

import com.google.gson.annotations.SerializedName

/**
 * Shift – Eine Schicht innerhalb eines Events (z.B. "Bar Samstag 18-22 Uhr").
 * Wird vom Backend zurueckgegeben ueber GET /events/{id}.
 * Jede Schicht gehoert zu genau einem Event und beschreibt einen Zeitabschnitt,
 * in dem Helfer benoetigt werden.
 */
data class Shift(
    /** Eindeutige ID der Schicht (vom Backend generiert). */
    val id: String,

    /** Fremdschluessel: ID des Events, zu dem diese Schicht gehoert. */
    @SerializedName("event_id") val eventId: String,

    /** Name der Schicht, z.B. "Bar Samstag Abend". */
    val name: String,

    /** Optionale Beschreibung mit zusaetzlichen Details zur Schicht. */
    val description: String? = null,

    /** Datum der Schicht im String-Format (z.B. "2025-06-14"). */
    val date: String? = null,

    /** Startzeit der Schicht (z.B. "18:00"). */
    @SerializedName("start_time") val startTime: String? = null,

    /** Endzeit der Schicht (z.B. "22:00"). */
    @SerializedName("end_time") val endTime: String? = null,

    /** Anzahl benoetigter Helfer fuer diese Schicht. */
    val needed: Int? = null,

    /** Bereich/Posten, z.B. "Bar", "Kueche", "Service". */
    val bereich: String? = null,

    /** Anzahl bereits bestaetigter Anmeldungen (gefuellte Plaetze). */
    val filled: Int? = null,

    /** Verschachtelte Anmeldungen (approved + pending) fuer diese Schicht. */
    val registrations: ShiftRegistrations? = null
)

/**
 * ShiftRegistrations – Anmeldungen fuer eine Schicht.
 * Enthaelt sowohl bestaetigte (approved) als auch ausstehende (pending) Anmeldungen
 * sowie Zaehler und die Anzahl verbleibender freier Plaetze.
 */
data class ShiftRegistrations(
    /** Liste der bestaetigten Anmeldungen. */
    val approved: List<EventRegistration> = emptyList(),

    /** Liste der noch nicht bestaetigten (ausstehenden) Anmeldungen. */
    val pending: List<EventRegistration> = emptyList(),

    /** Anzahl bestaetigter Anmeldungen (serverseitig berechnet). */
    @SerializedName("approvedCount") val approvedCount: Int? = null,

    /** Anzahl ausstehender Anmeldungen (serverseitig berechnet). */
    @SerializedName("pendingCount") val pendingCount: Int? = null,

    /** Verbleibende freie Plaetze (needed minus approvedCount). */
    @SerializedName("spotsLeft") val spotsLeft: Int? = null
)

/**
 * ShiftCreate – Request-Body fuer das Erstellen oder Aktualisieren einer Schicht.
 * Wird als JSON-Body an POST /shifts (neue Schicht) oder PUT /shifts/{id} (Update) gesendet.
 */
data class ShiftCreate(
    /** Event-ID, zu der die neue Schicht gehoert. Bei PUT optional, da bereits zugeordnet. */
    @SerializedName("event_id") val eventId: String? = null,

    /** Name der Schicht (Pflichtfeld). */
    val name: String,

    /** Optionale Beschreibung der Schicht. */
    val description: String? = null,

    /** Datum der Schicht (z.B. "2025-06-14"). */
    val date: String? = null,

    /** Startzeit der Schicht (z.B. "18:00"). */
    @SerializedName("start_time") val startTime: String? = null,

    /** Endzeit der Schicht (z.B. "22:00"). */
    @SerializedName("end_time") val endTime: String? = null,

    /** Anzahl benoetigter Helfer. */
    val needed: Int? = null,

    /** Bereich/Posten der Schicht (z.B. "Bar", "Kueche"). */
    val bereich: String? = null
)

/**
 * EventRegistration – Einzelne Anmeldung fuer eine Schicht.
 * Kann entweder ein Vereinsmitglied (ueber memberId) oder ein Gast (ueber guestName) sein.
 */
data class EventRegistration(
    /** Eindeutige ID der Anmeldung. */
    val id: String,

    /** Name des Angemeldeten (direkt vom Backend geliefert, falls vorhanden). */
    val name: String? = null,

    /** ID der Schicht, fuer die diese Anmeldung gilt. */
    @SerializedName("shift_id") val shiftId: String? = null,

    /** ID des Vereinsmitglieds (null wenn es ein Gast ist). */
    @SerializedName("member_id") val memberId: String? = null,

    /** Name des Gastes (null wenn es ein Vereinsmitglied ist). */
    @SerializedName("guest_name") val guestName: String? = null,

    /** E-Mail-Adresse des Gastes. */
    @SerializedName("guest_email") val guestEmail: String? = null,

    /** Telefonnummer des Angemeldeten. */
    val phone: String? = null,

    /** Optionale Bemerkungen zur Anmeldung. */
    val notes: String? = null,

    /** Status der Anmeldung, z.B. "approved" oder "pending". */
    val status: String? = null,

    /** Zeitstempel der Erstellung (ISO-Format). */
    @SerializedName("created_at") val createdAt: String? = null,

    /** Vorname des Mitglieds (aus der Members-Tabelle gejoint). */
    val vorname: String? = null,

    /** Nachname des Mitglieds (aus der Members-Tabelle gejoint). */
    val nachname: String? = null
) {
    /**
     * displayName – Anzeigename mit Fallback-Logik:
     * 1. Zuerst wird das Feld "name" verwendet (direkt vom Backend).
     * 2. Falls nicht vorhanden: Vorname + Nachname (aus Mitgliederdaten).
     * 3. Falls auch das fehlt: guestName (Gastname).
     * 4. Letzter Fallback: "Unbekannt".
     */
    val displayName: String
        get() = name
            ?: if (vorname != null && nachname != null) "$vorname $nachname"
            else guestName ?: "Unbekannt"
}
