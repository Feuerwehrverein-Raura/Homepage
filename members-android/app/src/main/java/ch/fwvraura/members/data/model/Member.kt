package ch.fwvraura.members.data.model

import com.google.gson.annotations.SerializedName

/** Mitglieder-Profil — Antwort von GET /members/me. */
data class MemberProfile(
    val id: String? = null,
    val vorname: String? = null,
    val nachname: String? = null,
    val email: String? = null,
    val anrede: String? = null,
    val mobile: String? = null,
    val telefon: String? = null,
    val strasse: String? = null,
    val plz: String? = null,
    val ort: String? = null,
    val funktion: String? = null,
    val status: String? = null,
    val geburtstag: String? = null,
    val foto: String? = null,
    @SerializedName("zustellung_email") val zustellungEmail: Boolean? = null,
    @SerializedName("zustellung_post") val zustellungPost: Boolean? = null
)

/** Body fuer POST /members/me/austritt. Loest einen Austritts-Antrag aus,
 *  loescht keine Daten — der Vorstand bearbeitet den Antrag manuell. */
data class AustrittRequest(
    val reason: String? = null,
    val austrittsdatum: String? = null
)

data class AustrittResponse(
    val success: Boolean = false,
    val message: String? = null
)

/** Body fuer PUT /members/me — nur die Felder die ein Mitglied selbst aendern darf. */
data class MemberProfileUpdate(
    val anrede: String? = null,
    val vorname: String? = null,
    val nachname: String? = null,
    val email: String? = null,
    val geburtstag: String? = null,
    val mobile: String? = null,
    val telefon: String? = null,
    val strasse: String? = null,
    val plz: String? = null,
    val ort: String? = null
)
