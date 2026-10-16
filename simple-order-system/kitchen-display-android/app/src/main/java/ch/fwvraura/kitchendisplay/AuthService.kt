package ch.fwvraura.kitchendisplay

import com.google.gson.Gson
import com.google.gson.JsonObject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/**
 * Anmeldung am Bestellsystem (order-backend).
 *
 * - login(): einmal mit dem gemeinsamen Kassen-/Kuechen-Passwort (rotiert
 *   woechentlich, steht im Mitgliederbereich unter «Meine Zugänge»).
 *   Ergebnis ist ein 30 Tage gueltiges Token.
 * - refresh(): tauscht ein noch gueltiges Token gegen ein frisches. Die App
 *   macht das taeglich — so laeuft sie ohne erneute Passworteingabe weiter,
 *   solange sie mindestens alle 30 Tage einmal online ist.
 */
object AuthService {

    sealed class Result {
        data class Ok(val token: String) : Result()
        /** Server hat abgelehnt (falsches Passwort, gesperrt, Token ungueltig). */
        data class Rejected(val code: Int, val message: String?) : Result()
        /** Netz/Server nicht erreichbar — spaeter erneut versuchen. */
        data class Unreachable(val message: String?, val serverText: String? = null) : Result()
    }

    /** «Noch 2 Versuche übrig» aus dem Fehlertext des Servers lesen. */
    fun remainingAttempts(text: String?): Int? =
        text?.let { Regex("Noch (\\d+) Versuch").find(it)?.groupValues?.get(1)?.toIntOrNull() }

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()
    private val gson = Gson()
    private val JSON = "application/json".toMediaType()

    suspend fun login(serverUrl: String, password: String): Result =
        post("${serverUrl.trimEnd('/')}/api/auth/login", gson.toJson(mapOf("password" to password)), null)

    // QR-Login: Datenblatt oder Anmeldebon; der Server loest den Code bei der
    // Mitgliederverwaltung ein und gibt ein Kassen-Token zurueck.
    suspend fun qrLogin(serverUrl: String, code: String): Result =
        post("${serverUrl.trimEnd('/')}/api/auth/qr-login", gson.toJson(mapOf("code" to code)), null)

    suspend fun refresh(serverUrl: String, token: String): Result =
        post("${serverUrl.trimEnd('/')}/api/auth/refresh", "{}", token)

    private suspend fun post(url: String, body: String, bearer: String?): Result = withContext(Dispatchers.IO) {
        try {
            val builder = Request.Builder().url(url).post(body.toRequestBody(JSON))
            bearer?.let { builder.header("Authorization", "Bearer $it") }
            client.newCall(builder.build()).execute().use { response ->
                val text = response.body?.string().orEmpty()
                val obj = try { gson.fromJson(text, JsonObject::class.java) } catch (e: Exception) { null }
                // Fehlertext des Servers woertlich weitergeben (z.B. «Falsches Passwort.
                // Noch 2 Versuche übrig.», «IP gesperrt …», «Kassen-Login noch nicht konfiguriert.»)
                val err = obj?.get("error")?.takeIf { it.isJsonPrimitive }?.asString
                if (response.isSuccessful) {
                    val token = obj?.get("token")?.takeIf { it.isJsonPrimitive }?.asString
                    if (!token.isNullOrEmpty()) Result.Ok(token)
                    else Result.Unreachable("Antwort ohne Token")
                } else if (response.code in 500..599) {
                    Result.Unreachable(err ?: "HTTP ${response.code}", serverText = err)
                } else {
                    Result.Rejected(response.code, err)
                }
            }
        } catch (e: Exception) {
            Result.Unreachable(e.message)
        }
    }
}
