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

/**
 * Textzeilen eines Feldes, wie sie gezeichnet werden: "-Name" pro
 * bestaetigtem Helfer, danach ein "-" pro offenem Platz. Das Boolean ist
 * true fuer offene Plaetze (grau gezeichnet). Rein, ohne Android-Abhaengigkeit,
 * damit der Vertragstest die Darstellung pruefen kann.
 */
fun ArbeitsplanZelle.zeilenText(): List<Pair<String, Boolean>> =
    besetzt.orEmpty().map { "-$it" to false } +
        List((offen ?: 0).coerceAtLeast(0)) { "-" to true }
