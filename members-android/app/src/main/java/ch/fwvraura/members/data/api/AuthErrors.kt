package ch.fwvraura.members.data.api

import ch.fwvraura.members.data.model.MemberAuthResponse
import com.google.gson.Gson
import retrofit2.Response

/**
 * Liest die Fehlermeldung aus einem nicht-erfolgreichen Auth-Response.
 *
 * Das Backend antwortet bei Fehlern mit `{"error":"…"}`. Retrofit legt diesen
 * Body im errorBody() ab (nicht in body()). Wir parsen ihn mit Gson und geben
 * die `error`-Meldung zurueck, sonst einen sprechenden Fallback pro Statuscode.
 */
fun Response<MemberAuthResponse>.authErrorMessage(): String {
    val fallback = when (code()) {
        401 -> "E-Mail oder Passwort ist falsch."
        429 -> "Zu viele Versuche. Bitte etwas warten und erneut versuchen."
        else -> "Fehler ${code()}"
    }
    return try {
        val raw = errorBody()?.string()
        if (raw.isNullOrBlank()) fallback
        else Gson().fromJson(raw, MemberAuthResponse::class.java)
            ?.error
            ?.takeIf { it.isNotBlank() }
            ?: fallback
    } catch (_: Exception) {
        fallback
    }
}
