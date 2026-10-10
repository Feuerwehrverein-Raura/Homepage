package ch.fwvraura.vorstand.data.model

/**
 * Arbeitsplan – Fertig aufgebaute Arbeitsplan-Tabelle eines Events.
 * Wird vom Backend zurueckgegeben ueber GET /events/{id}/arbeitsplan.
 *
 * Gruppiert und berechnet wird ausschliesslich im Backend; die App
 * zeichnet die Tabelle nur. So sehen Web, App und PDF gleich aus.
 *
 * Listen sind nullable: Gson umgeht Kotlin-Defaults, ein fehlendes Feld
 * kaeme sonst trotz Non-Null-Typ als null an.
 */
data class Arbeitsplan(
    /** Vereinsname fuer den Kopf, z.B. "Feuerwehrverein Raura, Kaiseraugst". */
    val verein: String? = null,

    /** Titel, z.B. "Arbeitsplan Chilbi 2026". */
    val titel: String? = null,

    /** Name des Anlasses ohne Praefix. */
    val anlass: String? = null,

    /** Spaltenueberschriften (nach "Zeit"), z.B. ["Bar", "Grill"]. */
    val bereiche: List<String>? = null,

    /** Ein Eintrag pro Tag; leer, wenn das Event keine Schichten hat. */
    val tage: List<ArbeitsplanTag>? = null
)

/** Ein Tag des Arbeitsplans mit seinen Zeitfenstern. */
data class ArbeitsplanTag(
    /** ISO-Datum (z.B. "2026-06-01") oder null. */
    val datum: String? = null,

    /** Fertige Ueberschrift, z.B. "Samstag, 01.06.2026". */
    val bezeichnung: String? = null,

    /** Zeilen der Tabelle, eine pro Zeitfenster. */
    val zeilen: List<ArbeitsplanZeile>? = null
)

/** Eine Tabellenzeile: Zeitfenster plus ein Feld pro Bereich. */
data class ArbeitsplanZeile(
    /** Zeitfenster, z.B. "08:00-12:00". */
    val zeit: String? = null,

    /** Parallel zu Arbeitsplan.bereiche; null = keine Schicht (schwarzes Feld). */
    val zellen: List<ArbeitsplanZelle?>? = null
)

/** Ein Feld mit Schicht: eingetragene Helfer und offene Plaetze. */
data class ArbeitsplanZelle(
    /** Namen der bestaetigten Helfer. */
    val besetzt: List<String>? = null,

    /** Anzahl benoetigter Helfer. */
    val gebraucht: Int? = null,

    /** Anzahl offener Plaetze (als graue Striche gezeichnet). */
    val offen: Int? = null
)

/**
 * Textzeilen eines Feldes, wie sie gezeichnet werden: "-Name" pro
 * bestaetigtem Helfer, danach ein "-" pro offenem Platz. Das Boolean ist
 * true fuer offene Plaetze (grau gezeichnet). Rein, ohne Android-Abhaengigkeit,
 * damit der Vertragstest die Darstellung pruefen kann.
 */
fun ArbeitsplanZelle.zeilenText(): List<Pair<String, Boolean>> =
    besetzt.orEmpty().map { "-$it" to false } +
        List((offen ?: 0).coerceAtLeast(0)) { "-" to true }
