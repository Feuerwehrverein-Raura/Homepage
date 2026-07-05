package ch.fwvraura.vorstand.data.model

import com.google.gson.JsonParser

/**
 * Eine Begleitperson einer Anmeldung.
 *
 * Neue Anmeldungen speichern Begleitpersonen als Objekt {name,email?,phone?};
 * alte Datensaetze koennen nur einen Namen als String enthalten.
 */
data class RegCompanion(
    val name: String? = null,
    val email: String? = null,
    val phone: String? = null
)

/**
 * Aus dem `notes`-Feld einer Anmeldung geparste Zusatzdaten.
 *
 * Das Backend speichert diese Zusatzdaten als JSON-String im notes-Feld:
 * {phone, participants, companions:[...], allergies, meal_selection, notes}.
 * Ganz alte Anmeldungen enthalten stattdessen reinen Freitext — dieser landet
 * dann unveraendert in [text].
 */
data class RegNotes(
    /** Telefonnummer der anmeldenden Person. */
    val phone: String? = null,
    /** Anzahl Personen inkl. Hauptperson (mindestens 1). */
    val participants: Int = 1,
    /** Begleitpersonen (ohne die Hauptperson). */
    val companions: List<RegCompanion> = emptyList(),
    /** Allergien / Unvertraeglichkeiten als Freitext. */
    val allergies: String? = null,
    /** Menue-Wahl bei GV-Events. */
    val mealSelection: String? = null,
    /** Freie Bemerkung der anmeldenden Person. */
    val text: String? = null
) {
    /** true, wenn ausser einer moeglichen Personenzahl keine Zusatzdaten vorliegen. */
    val isEmpty: Boolean
        get() = phone.isNullOrBlank() && companions.isEmpty() &&
            allergies.isNullOrBlank() && mealSelection.isNullOrBlank() &&
            text.isNullOrBlank()
}

/**
 * Parst das notes-Feld einer Anmeldung defensiv.
 *
 * - Leerer/null-Input ergibt leere [RegNotes].
 * - Reiner Freitext (kein JSON-Objekt) landet in [RegNotes.text].
 * - Begleitpersonen koennen Strings oder Objekte sein; beides wird unterstuetzt.
 * - Jeder Parsing-Fehler faellt sicher auf Freitext zurueck.
 */
fun parseRegNotes(raw: String?): RegNotes {
    if (raw.isNullOrBlank()) return RegNotes()
    return try {
        val el = JsonParser.parseString(raw)
        if (!el.isJsonObject) return RegNotes(text = raw)
        val o = el.asJsonObject
        fun str(key: String): String? =
            o.get(key)?.takeIf { !it.isJsonNull }?.asString?.takeIf { it.isNotBlank() }
        val participants = o.get("participants")
            ?.takeIf { it.isJsonPrimitive }
            ?.let { runCatching { it.asInt }.getOrNull() }
            ?.takeIf { it >= 1 } ?: 1
        val companions = o.get("companions")
            ?.takeIf { it.isJsonArray }
            ?.asJsonArray
            ?.mapNotNull { c ->
                when {
                    c.isJsonPrimitive -> c.asString.takeIf { it.isNotBlank() }?.let { RegCompanion(name = it) }
                    c.isJsonObject -> {
                        val co = c.asJsonObject
                        fun cs(key: String) = co.get(key)?.takeIf { !it.isJsonNull }?.asString?.takeIf { it.isNotBlank() }
                        cs("name")?.let { RegCompanion(it, cs("email"), cs("phone")) }
                    }
                    else -> null
                }
            } ?: emptyList()
        RegNotes(
            phone = str("phone"),
            participants = participants,
            companions = companions,
            allergies = str("allergies"),
            mealSelection = str("meal_selection"),
            text = str("notes")
        )
    } catch (e: Exception) {
        RegNotes(text = raw)
    }
}
