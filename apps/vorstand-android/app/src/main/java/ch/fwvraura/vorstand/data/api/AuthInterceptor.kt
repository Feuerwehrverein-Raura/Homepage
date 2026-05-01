package ch.fwvraura.vorstand.data.api

import android.content.Intent
import ch.fwvraura.vorstand.VorstandApp
import ch.fwvraura.vorstand.util.TokenManager
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.Response

/**
 * OkHttp-Interceptor fuer die automatische JWT-Authentifizierung.
 *
 * Diese Klasse implementiert das OkHttp-Interceptor-Interface und wird bei jedem
 * HTTP-Request automatisch aufgerufen. Der Interceptor hat zwei Hauptaufgaben:
 *
 * 1. JWT-Token hinzufuegen: Bei jedem ausgehenden Request wird der gespeicherte
 *    JWT-Bearer-Token automatisch in den "Authorization"-Header eingefuegt,
 *    damit der Server den Benutzer authentifizieren kann.
 *
 * 2. 401/403-Fehlerbehandlung: Wenn der Server mit HTTP 401 (Unauthorized) oder
 *    403 (Forbidden) antwortet (z.B. weil der Token abgelaufen ist), wird der Token
 *    geloescht und die App automatisch zur Login-Seite weitergeleitet.
 *    Hinweis: Das Backend gibt 403 zurueck bei abgelaufenen Vorstand-JWTs
 *    (authenticateVorstand), daher muessen beide Status-Codes behandelt werden.
 *
 * @param tokenManager Der TokenManager, der den JWT-Token sicher speichert und bereitstellt.
 *                     Wird per Dependency Injection uebergeben.
 */
class AuthInterceptor(private val tokenManager: TokenManager) : Interceptor {

    /**
     * Faengt jeden HTTP-Request ab und fuegt den Authorization-Header hinzu.
     * Prueft anschliessend die Response auf 401/403-Fehler.
     *
     * Ablauf Schritt fuer Schritt:
     * 1. Originalen Request aus der Chain holen
     * 2. Token aus dem TokenManager lesen
     * 3. Falls Token vorhanden: Neuen Request mit "Authorization: Bearer <token>" Header erstellen
     *    Falls kein Token vorhanden: Originalen Request unveraendert verwenden
     * 4. Request ausfuehren und Response erhalten
     * 5. Falls Response-Code 401 (Unauthorized) oder 403 (Forbidden) UND der Request
     *    kein Login-Request war:
     *    - Token loeschen (da er ungueltig/abgelaufen ist)
     *    - App zur Login-Seite weiterleiten (durch Neustart der Haupt-Activity)
     * 6. Response zurueckgeben
     *
     * @param chain Die Interceptor-Chain von OkHttp. Enthaelt den originalen Request
     *              und ermoeglicht das Weiterleiten (proceed) an den naechsten Interceptor
     *              bzw. den eigentlichen Netzwerk-Aufruf.
     * @return Die HTTP-Response vom Server.
     */
    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()
        val token = tokenManager.token

        val firstRequest = if (!token.isNullOrEmpty())
            original.newBuilder().header("Authorization", "Bearer $token").build()
        else original

        val firstResponse = chain.proceed(firstRequest)

        // Login- und Refresh-Endpoints duerfen nicht refresh-trigger sein.
        val path = original.url.encodedPath
        val isAuthEndpoint = path.contains("login") || path.contains("/refresh")
        val needsRefresh = (firstResponse.code == 401 || firstResponse.code == 403) && !isAuthEndpoint

        if (!needsRefresh) return firstResponse

        // Versuche mit dem gespeicherten Refresh-Token einen neuen JWT zu holen.
        val refresh = tokenManager.refreshToken
        if (refresh.isNullOrBlank()) {
            firstResponse.close()
            forceReLogin()
            return chain.proceed(firstRequest)
        }

        val newAccess = synchronized(tokenManager) {
            val current = tokenManager.token
            if (!current.isNullOrEmpty() && current != token) current
            else doRefresh(refresh)
        }

        if (newAccess.isNullOrBlank()) {
            firstResponse.close()
            forceReLogin()
            return chain.proceed(firstRequest)
        }

        firstResponse.close()
        val retried = original.newBuilder()
            .header("Authorization", "Bearer $newAccess")
            .build()
        return chain.proceed(retried)
    }

    /** Synchroner POST /auth/vorstand/refresh — gibt neuen Access-Token zurueck oder null. */
    private fun doRefresh(refresh: String): String? {
        val baseUrl = ch.fwvraura.vorstand.data.api.ApiModule.BASE_URL
        val tokenUrl = baseUrl.removeSuffix("/") + "/auth/vorstand/refresh"
        val client = okhttp3.OkHttpClient.Builder()
            .connectTimeout(15, java.util.concurrent.TimeUnit.SECONDS)
            .readTimeout(15, java.util.concurrent.TimeUnit.SECONDS)
            .build()
        val body = okhttp3.RequestBody.create(
            "application/json".toMediaTypeOrNull(),
            "{\"refresh_token\":\"$refresh\"}"
        )
        val req = okhttp3.Request.Builder().url(tokenUrl).post(body).build()
        return try {
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return null
                val json = org.json.JSONObject(resp.body?.string() ?: return null)
                val newAccess = json.optString("token").takeIf { it.isNotBlank() } ?: return null
                val newRefresh = json.optString("refresh_token").takeIf { it.isNotBlank() }
                tokenManager.token = newAccess
                if (!newRefresh.isNullOrBlank()) tokenManager.refreshToken = newRefresh
                newAccess
            }
        } catch (_: Exception) { null }
    }

    private fun forceReLogin() {
        tokenManager.clear()
        try {
            val ctx = VorstandApp.instance
            val intent = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName) ?: return
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
            ctx.startActivity(intent)
        } catch (_: Exception) { /* swallow */ }
    }
}
