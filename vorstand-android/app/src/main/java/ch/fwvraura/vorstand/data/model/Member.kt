package ch.fwvraura.vorstand.data.model

import com.google.gson.annotations.SerializedName

data class Member(
    val id: String,
    val vorname: String,
    val nachname: String,
    val email: String? = null,
    @SerializedName("versand_email") val versandEmail: String? = null,
    val anrede: String? = null,
    val geschlecht: String? = null,
    val geburtstag: String? = null,
    val strasse: String? = null,
    val adresszusatz: String? = null,
    val plz: String? = null,
    val ort: String? = null,
    val telefon: String? = null,
    val mobile: String? = null,
    val status: String? = null,
    val funktion: String? = null,
    val eintrittsdatum: String? = null,
    @SerializedName("feuerwehr_zugehoerigkeit") val feuerwehrZugehoerigkeit: Boolean? = null,
    @SerializedName("zustellung_email") val zustellungEmail: Boolean? = null,
    @SerializedName("zustellung_post") val zustellungPost: Boolean? = null,
    @SerializedName("photo_url") val photoUrl: String? = null,
    @SerializedName("created_at") val createdAt: String? = null,
    @SerializedName("updated_at") val updatedAt: String? = null
) {
    val fullName: String get() = "$vorname $nachname"
}

data class MemberStats(
    val total: Int,
    val aktiv: Int,
    val passiv: Int,
    val ehren: Int
)

data class MemberCreate(
    val anrede: String? = null,
    val vorname: String,
    val nachname: String,
    val geschlecht: String? = null,
    val geburtstag: String? = null,
    val strasse: String? = null,
    val adresszusatz: String? = null,
    val plz: String? = null,
    val ort: String? = null,
    val email: String? = null,
    @SerializedName("versand_email") val versandEmail: String? = null,
    val telefon: String? = null,
    val mobile: String? = null,
    val status: String = "Aktiv",
    val funktion: String? = null,
    val eintrittsdatum: String? = null,
    @SerializedName("feuerwehr_zugehoerigkeit") val feuerwehrZugehoerigkeit: Boolean? = null,
    @SerializedName("zustellung_email") val zustellungEmail: Boolean? = null,
    @SerializedName("zustellung_post") val zustellungPost: Boolean? = null
)
