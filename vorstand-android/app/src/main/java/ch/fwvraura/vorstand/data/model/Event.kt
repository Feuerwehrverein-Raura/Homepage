package ch.fwvraura.vorstand.data.model

import com.google.gson.annotations.SerializedName

/**
 * Anlass bzw. Event des Feuerwehrvereins Raura.
 *
 * Wird vom Backend ueber GET /events zurueckgegeben.
 * Ein Event kann mehrere Schichten (Shifts) haben, z.B. verschiedene Zeitfenster
 * oder Arbeitsbereiche bei einem Fest. Teilnehmer koennen sich entweder
 * fuer eine bestimmte Schicht oder direkt fuer den gesamten Event anmelden.
 *
 * Als Kotlin data class werden equals(), hashCode(), toString() und copy()
 * automatisch generiert. @SerializedName bildet JSON snake_case auf
 * Kotlin camelCase ab.
 */
data class Event(
    /** Eindeutige ID des Events, vom Server vergeben. */
    val id: String,

    /** Titel des Events, z.B. "Generalversammlung 2026" (Pflichtfeld). */
    val title: String,

    /** Optionaler Untertitel fuer zusaetzliche Informationen. */
    val subtitle: String? = null,

    /** URL-freundlicher Kurzname (Slug) des Events fuer Weblinks. */
    val slug: String? = null,

    /** Kategorie des Events, z.B. "Anlass", "Uebung", "Sitzung". */
    val category: String? = null,

    /** Status des Events, z.B. "planned", "active", "cancelled", "completed". */
    val status: String? = null,

    /** Startdatum und -zeit des Events als ISO-8601 String. */
    @SerializedName("start_date") val startDate: String? = null,

    /** Enddatum und -zeit des Events als ISO-8601 String. */
    @SerializedName("end_date") val endDate: String? = null,

    /** Durchfuehrungsort des Events, z.B. "Feuerwehrlokal Raura". */
    val location: String? = null,

    /** Ausfuehrliche Beschreibung des Events (kann Markdown enthalten). */
    val description: String? = null,

    /** Anmeldefrist als ISO-8601 String; nach diesem Datum sind keine Anmeldungen mehr moeglich. */
    @SerializedName("registration_deadline") val registrationDeadline: String? = null,

    /** Maximale Teilnehmerzahl; null bedeutet keine Begrenzung. */
    @SerializedName("max_participants") val maxParticipants: Int? = null,

    /** Kosten fuer die Teilnahme als String, z.B. "CHF 25.00" oder "Gratis". */
    val cost: String? = null,

    /** Name des Organisators / der verantwortlichen Person. */
    @SerializedName("organizer_name") val organizerName: String? = null,

    /** E-Mail-Adresse des Organisators fuer Rueckfragen. */
    @SerializedName("organizer_email") val organizerEmail: String? = null,

    /**
     * ID des als Organisator verknuepften Mitglieds (falls Mitglied statt extern).
     * Wenn gesetzt, verwaltet das Mitglied den Event in der Mitglieder-App und es
     * wird kein Token-Zugang eingerichtet.
     */
    @SerializedName("organizer_id") val organizerId: String? = null,

    /**
     * Vorname des vorschlagenden Mitglieds. Nur bei Event-Vorschlaegen
     * (GET /events/proposals) befuellt – dort ist der Vorschlagende der
     * voreingestellte Organisator. Bei normalen Events null.
     */
    @SerializedName("organizer_vorname") val organizerVorname: String? = null,

    /**
     * Nachname des vorschlagenden Mitglieds. Nur bei Event-Vorschlaegen
     * (GET /events/proposals) befuellt. Bei normalen Events null.
     */
    @SerializedName("organizer_nachname") val organizerNachname: String? = null,

    /** Organisator-Zugang (Event-Dashboard): Login-E-Mail, falls eingerichtet. */
    @SerializedName("event_email") val eventEmail: String? = null,

    /** Menue-Optionen fuer GV-Events. */
    @SerializedName("meal_options") val mealOptions: List<String>? = null,

    /** Dateiname des PDF-Aushangs, falls vorhanden. */
    @SerializedName("pdf_filename") val pdfFilename: String? = null,

    /** Ob eine Anmeldung erforderlich ist. */
    @SerializedName("registration_required") val registrationRequired: Boolean? = null,

    /**
     * Liste der Schichten (Shifts) dieses Events.
     * Jede Schicht hat eigene Zeiten und Anmeldungen.
     * Kann null oder leer sein, wenn der Event keine Schichten hat.
     */
    val shifts: List<Shift>? = null,

    /**
     * Direkte Anmeldungen, die keiner bestimmten Schicht zugeordnet sind.
     * Wird nur befuellt, wenn der Event Anmeldungen ohne Schichtzuordnung erlaubt.
     */
    @SerializedName("directRegistrations") val directRegistrations: DirectRegistrations? = null,

    /** Zeitstempel der Erstellung, vom Server gesetzt (ISO-8601). */
    @SerializedName("created_at") val createdAt: String? = null
)

/**
 * Direkte Anmeldungen fuer einen Event, die nicht einer bestimmten Schicht zugeordnet sind.
 *
 * Die Anmeldungen werden in zwei Listen aufgeteilt:
 * - pending: Anmeldungen, die noch auf Genehmigung warten.
 * - approved: Bereits genehmigte Anmeldungen.
 */
data class DirectRegistrations(
    /** Liste der ausstehenden Anmeldungen (noch nicht genehmigt). */
    val pending: List<EventRegistration> = emptyList(),

    /** Liste der genehmigten Anmeldungen. */
    val approved: List<EventRegistration> = emptyList()
)

/**
 * Request-Body fuer das Erstellen (POST /events) oder Aktualisieren (PUT /events/:id)
 * eines Events.
 *
 * Enthaelt dieselben Felder wie [Event], jedoch ohne die vom Server automatisch
 * gesetzten Felder (id, slug, directRegistrations, createdAt).
 *
 * Bei neuen Events koennen Schichten (shifts) direkt inline als Liste von
 * [ShiftCreate]-Objekten mitgegeben werden, damit der Event samt Schichten
 * in einem einzigen Request erstellt werden kann.
 * Bei bestehenden Events werden Schichten separat ueber eigene
 * Shift-Endpunkte verwaltet (erstellt, aktualisiert, geloescht).
 */
data class EventCreate(
    /** Titel des Events (Pflichtfeld). */
    val title: String,

    /** Optionaler Untertitel fuer zusaetzliche Informationen. */
    val subtitle: String? = null,

    /** Kategorie des Events, z.B. "Anlass", "Uebung", "Sitzung". */
    val category: String? = null,

    /** Status des Events, standardmaessig "planned" fuer neue Events. */
    val status: String? = "planned",

    /** Startdatum und -zeit des Events als ISO-8601 String. */
    @SerializedName("start_date") val startDate: String? = null,

    /** Enddatum und -zeit des Events als ISO-8601 String. */
    @SerializedName("end_date") val endDate: String? = null,

    /** Durchfuehrungsort des Events. */
    val location: String? = null,

    /** Ausfuehrliche Beschreibung des Events. */
    val description: String? = null,

    /** Anmeldefrist als ISO-8601 String. */
    @SerializedName("registration_deadline") val registrationDeadline: String? = null,

    /** Maximale Teilnehmerzahl; null bedeutet keine Begrenzung. */
    @SerializedName("max_participants") val maxParticipants: Int? = null,

    /** Kosten fuer die Teilnahme als String. */
    val cost: String? = null,

    /** Name des Organisators / der verantwortlichen Person. */
    @SerializedName("organizer_name") val organizerName: String? = null,

    /** E-Mail-Adresse des Organisators fuer Rueckfragen. */
    @SerializedName("organizer_email") val organizerEmail: String? = null,

    /**
     * ID des als Organisator verknuepften Mitglieds. Wenn gesetzt, ueberspringt
     * das Backend den Token-Zugang (das Mitglied verwaltet den Event in der
     * Mitglieder-App). Bei externen Organisatoren null.
     */
    @SerializedName("organizer_id") val organizerId: String? = null,

    /** Ob eine Anmeldung erforderlich ist (wird aus der Kategorie abgeleitet). */
    @SerializedName("registration_required") val registrationRequired: Boolean? = null,

    /** Menue-Optionen fuer GV-Events (Essenswahl bei der Anmeldung). */
    @SerializedName("meal_options") val mealOptions: List<String>? = null,

    /** Beim Speichern: Organisator-Zugang (Event-Dashboard) einrichten. */
    @SerializedName("create_access") val createAccess: Boolean? = null,

    /** PDF-Aushang als base64 (Inhalt ohne data:-Prefix). */
    @SerializedName("pdf_attachment") val pdfAttachment: String? = null,

    /** Dateiname des PDF-Aushangs. */
    @SerializedName("pdf_filename") val pdfFilename: String? = null,

    /**
     * Liste der Schichten, die zusammen mit dem Event erstellt werden sollen.
     * Wird nur beim Erstellen (POST) verwendet. Bei bestehenden Events
     * werden Schichten separat ueber eigene Endpunkte verwaltet.
     */
    val shifts: List<ShiftCreate>? = null
)

/** Antwort von POST /events/:id/notify-registrants. */
data class NotifyResult(
    val success: Boolean = false,
    val emailed: Int = 0,
    val posted: Int = 0,
    val skipped: Int = 0,
    val unreachable: List<String> = emptyList()
)
