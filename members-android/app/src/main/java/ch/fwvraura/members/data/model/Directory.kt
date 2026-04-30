package ch.fwvraura.members.data.model

/** Eintrag im Mitglieder-Verzeichnis (GET /members/directory) — fuer den Adressbuch-Sync. */
data class DirectoryEntry(
    val id: String,
    val vorname: String? = null,
    val nachname: String? = null,
    val email: String? = null,
    val mobile: String? = null,
    val telefon: String? = null,
    val funktion: String? = null
)
