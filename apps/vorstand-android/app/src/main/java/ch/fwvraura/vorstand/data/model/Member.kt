package ch.fwvraura.vorstand.data.model

import com.google.gson.annotations.SerializedName

/**
 * Mitglied des Feuerwehrvereins Raura.
 *
 * Wird vom Backend ueber GET /members zurueckgegeben.
 * Als Kotlin data class werden equals(), hashCode(), toString() und copy()
 * automatisch generiert, basierend auf allen Konstruktor-Properties.
 *
 * @SerializedName wird verwendet, um die JSON-Feldnamen im snake_case-Format
 * (z.B. "versand_email") auf die Kotlin-Properties im camelCase-Format
 * (z.B. versandEmail) abzubilden. Gson nutzt diese Annotation beim
 * Serialisieren und Deserialisieren.
 */
data class Member(
    /** Eindeutige ID des Mitglieds, vom Server vergeben (UUID oder aehnlich). */
    val id: String,

    /** Vorname des Mitglieds (Pflichtfeld). */
    val vorname: String,

    /** Nachname des Mitglieds (Pflichtfeld). */
    val nachname: String,

    /** Primaere E-Mail-Adresse des Mitglieds. */
    val email: String? = null,

    /** E-Mail-Adresse fuer den Versand (z.B. Einladungen, Newsletter). */
    @SerializedName("versand_email") val versandEmail: String? = null,

    /** Anrede des Mitglieds, z.B. "Herr" oder "Frau". */
    val anrede: String? = null,

    /** Geschlecht des Mitglieds, z.B. "maennlich", "weiblich". */
    val geschlecht: String? = null,

    /** Geburtstag des Mitglieds als Datumsstring (z.B. "1990-05-15"). */
    val geburtstag: String? = null,

    /** Strasse und Hausnummer der Wohnadresse. */
    val strasse: String? = null,

    /** Adresszusatz, z.B. "c/o Meier" oder "Postfach 12". */
    val adresszusatz: String? = null,

    /** Postleitzahl des Wohnorts. */
    val plz: String? = null,

    /** Wohnort des Mitglieds. */
    val ort: String? = null,

    /** Festnetz-Telefonnummer. */
    val telefon: String? = null,

    /** Mobiltelefonnummer. */
    val mobile: String? = null,

    /** Mitgliedschaftsstatus, z.B. "Aktiv", "Passiv", "Ehren". */
    val status: String? = null,

    /** Funktion im Verein, z.B. "Praesident", "Kassier", "Beisitzer". */
    val funktion: String? = null,

    /** Eintrittsdatum in den Verein als Datumsstring. */
    val eintrittsdatum: String? = null,

    /** Ob das Mitglied auch der Feuerwehr (AdFW) angehoert. */
    @SerializedName("feuerwehr_zugehoerigkeit") val feuerwehrZugehoerigkeit: Boolean? = null,

    /** Ob die Zustellung per E-Mail erfolgen soll. */
    @SerializedName("zustellung_email") val zustellungEmail: Boolean? = null,

    /** Ob die Zustellung per Post erfolgen soll. */
    @SerializedName("zustellung_post") val zustellungPost: Boolean? = null,

    /** URL oder Pfad zum Profilfoto des Mitglieds. */
    val foto: String? = null,

    /** Zeitstempel der Erstellung, vom Server gesetzt (ISO-8601). */
    @SerializedName("created_at") val createdAt: String? = null,

    /** Zeitstempel der letzten Aenderung, vom Server gesetzt (ISO-8601). */
    @SerializedName("updated_at") val updatedAt: String? = null
) {
    /**
     * Berechnete Property, die den vollen Namen (Vorname + Nachname)
     * zusammensetzt. Wird nicht im JSON gespeichert, sondern bei jedem
     * Zugriff neu berechnet.
     */
    val fullName: String get() = "$vorname $nachname"
}

/**
 * Statistik-Uebersicht ueber alle Mitglieder.
 *
 * Wird vom Backend ueber GET /members/stats/overview zurueckgegeben.
 * Enthaelt die Anzahl der Mitglieder aufgeteilt nach Status.
 */
data class MemberStats(
    /** Gesamtanzahl aller Mitglieder im Verein. */
    val total: Int,

    /** Anzahl der aktiven Mitglieder. */
    val aktiv: Int,

    /** Anzahl der passiven Mitglieder (zahlen Beitrag, aber nicht aktiv taetig). */
    val passiv: Int,

    /** Anzahl der Ehrenmitglieder. */
    val ehren: Int
)

/**
 * Request-Body fuer das Erstellen (POST /members) oder Aktualisieren (PUT /members/:id)
 * eines Mitglieds.
 *
 * Enthaelt dieselben Felder wie [Member], jedoch ohne die vom Server automatisch
 * gesetzten Felder (id, foto, createdAt, updatedAt). Diese werden vom Backend
 * bei der Erstellung bzw. Aktualisierung automatisch vergeben.
 */
data class MemberCreate(
    /** Anrede des Mitglieds, z.B. "Herr" oder "Frau". */
    val anrede: String? = null,

    /** Vorname des Mitglieds (Pflichtfeld). */
    val vorname: String,

    /** Nachname des Mitglieds (Pflichtfeld). */
    val nachname: String,

    /** Geschlecht des Mitglieds, z.B. "maennlich", "weiblich". */
    val geschlecht: String? = null,

    /** Geburtstag des Mitglieds als Datumsstring. */
    val geburtstag: String? = null,

    /** Strasse und Hausnummer der Wohnadresse. */
    val strasse: String? = null,

    /** Adresszusatz, z.B. "c/o Meier" oder "Postfach 12". */
    val adresszusatz: String? = null,

    /** Postleitzahl des Wohnorts. */
    val plz: String? = null,

    /** Wohnort des Mitglieds. */
    val ort: String? = null,

    /** Primaere E-Mail-Adresse des Mitglieds. */
    val email: String? = null,

    /** E-Mail-Adresse fuer den Versand (z.B. Einladungen, Newsletter). */
    @SerializedName("versand_email") val versandEmail: String? = null,

    /** Festnetz-Telefonnummer. */
    val telefon: String? = null,

    /** Mobiltelefonnummer. */
    val mobile: String? = null,

    /** Mitgliedschaftsstatus, standardmaessig "Aktiv" fuer neue Mitglieder. */
    val status: String = "Aktiv",

    /** Funktion im Verein, z.B. "Praesident", "Kassier", "Beisitzer". */
    val funktion: String? = null,

    /** Eintrittsdatum in den Verein als Datumsstring. */
    val eintrittsdatum: String? = null,

    /** Ob das Mitglied auch der Feuerwehr (AdFW) angehoert. */
    @SerializedName("feuerwehr_zugehoerigkeit") val feuerwehrZugehoerigkeit: Boolean? = null,

    /** Ob die Zustellung per E-Mail erfolgen soll. */
    @SerializedName("zustellung_email") val zustellungEmail: Boolean? = null,

    /** Ob die Zustellung per Post erfolgen soll. */
    @SerializedName("zustellung_post") val zustellungPost: Boolean? = null
)
