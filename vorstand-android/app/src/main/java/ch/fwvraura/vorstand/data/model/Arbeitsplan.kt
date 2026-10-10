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

    /** Anzahl offener Plaetze. */
    val offen: Int? = null
)

/** Ein Bereich in der Karte eines Zeitfensters (Handy-Ansicht). */
data class KartenEintrag(
    /** Bereich zum Anzeigen, z.B. "Küche". */
    val bereich: String,

    /** Bestaetigte Helfer, mit ", " verbunden; leer = noch niemand. */
    val namenText: String,

    /** Anzahl offener Plaetze (nie negativ). */
    val offen: Int
)

/** "Kueche" -> "Küche"; alles andere unveraendert (Backend schickt bald selbst "Küche"). */
fun bereichAnzeige(bereich: String): String = when (bereich.trim()) {
    "Kueche" -> "K\u00fcche"
    else -> bereich.trim()
}

/** Kartentitel, z.B. "10:00–14:00 Uhr". */
fun ArbeitsplanZeile.zeitText(): String = "${zeit.orEmpty().replace('-', '\u2013')} Uhr"

/**
 * Karte eines Zeitfensters wie auf der Website (zeichneTagAlsListe):
 * nur Bereiche mit Schicht, Felder ohne Schicht (null) fallen weg. Leere
 * Liste = Zeitfenster wird nicht gezeichnet. Rein, ohne
 * Android-Abhaengigkeit, damit der Vertragstest die Darstellung prueft.
 */
fun ArbeitsplanZeile.karte(bereiche: List<String>): List<KartenEintrag> =
    zellen.orEmpty().mapIndexedNotNull { i, zelle ->
        zelle?.let {
            KartenEintrag(
                bereich = bereichAnzeige(bereiche.getOrNull(i).orEmpty()),
                namenText = it.besetzt.orEmpty().joinToString(", "),
                offen = (it.offen ?: 0).coerceAtLeast(0)
            )
        }
    }

/** "1 Platz frei" / "N Plätze frei", null wenn nichts frei ist. */
fun KartenEintrag.freiText(): String? = when {
    offen <= 0 -> null
    offen == 1 -> "1 Platz frei"
    else -> "$offen Pl\u00e4tze frei"
}
