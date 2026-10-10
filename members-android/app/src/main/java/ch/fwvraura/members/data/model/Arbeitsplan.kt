package ch.fwvraura.members.data.model

/**
 * Fertig aufbereiteter Arbeitsplan aus GET /events/:id/arbeitsplan.
 * Das Backend gruppiert und berechnet alles — der Client zeichnet nur.
 */
data class Arbeitsplan(
    val verein: String? = null,
    val titel: String? = null,
    val anlass: String? = null,
    /** Spaltenkoepfe (nach "Zeit"). */
    val bereiche: List<String>? = null,
    val tage: List<ArbeitsplanTag>? = null
)

data class ArbeitsplanTag(
    val datum: String? = null,
    /** Fertige Ueberschrift, z.B. "Samstag, 01.06.2026". */
    val bezeichnung: String? = null,
    val zeilen: List<ArbeitsplanZeile>? = null
)

data class ArbeitsplanZeile(
    val zeit: String? = null,
    /** Parallel zu [Arbeitsplan.bereiche]; null = keine Schicht (schwarze Zelle). */
    val zellen: List<ArbeitsplanZelle?>? = null
)

data class ArbeitsplanZelle(
    val besetzt: List<String>? = null,
    val gebraucht: Int? = null,
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
