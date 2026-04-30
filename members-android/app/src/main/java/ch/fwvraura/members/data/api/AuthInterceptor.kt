package ch.fwvraura.members.data.api

import android.content.Intent
import android.util.Log
import ch.fwvraura.members.MembersApp
import ch.fwvraura.members.util.OidcConstants
import ch.fwvraura.members.util.TokenManager
import okhttp3.FormBody
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * OkHttp-Interceptor mit automatischem Token-Refresh.
 *
 * Strategie:
 *  1. Vor jedem Request: aktuellen Access-Token als Bearer-Header anhaengen.
 *  2. Bei 401/403 (ausser /login-Endpoints) versucht der Interceptor
 *     mit dem gespeicherten Refresh-Token einen neuen Access-Token zu holen
 *     (POST /application/o/token/ mit grant_type=refresh_token).
 *  3. Refresh erfolgreich -> neuer Access- und Refresh-Token gespeichert,
 *     der Original-Request wird mit neuem Token wiederholt.
 *  4. Refresh fehlgeschlagen (z.B. Refresh-Token > 30 Tage alt oder widerrufen):
 *     Token-Manager wird geleert und die App auf den Login-Screen geworfen.
 *
 * Solange der User die App spaetestens alle 30 Tage einmal benutzt, rotiert
 * der Refresh-Token in Authentik kontinuierlich und der User bleibt eingeloggt.
 */
class AuthInterceptor(private val tokenManager: TokenManager) : Interceptor {

    /** Eigener kleiner OkHttp-Client fuer den Refresh-Call (kein Auth-Loop). */
    private val refreshClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .build()
    }

    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()
        val token = tokenManager.token

        val firstRequest = if (!token.isNullOrEmpty())
            original.newBuilder().header("Authorization", "Bearer $token").build()
        else original

        val firstResponse = chain.proceed(firstRequest)

        val isLogin = original.url.encodedPath.contains("login") ||
                original.url.encodedPath.contains("/token")
        val needsRefresh = (firstResponse.code == 401 || firstResponse.code == 403) && !isLogin

        if (!needsRefresh) return firstResponse

        // 401/403 — Versuch mit Refresh-Token einen neuen Access-Token zu holen.
        val refresh = tokenManager.refreshToken
        if (refresh.isNullOrBlank()) {
            firstResponse.close()
            forceReLogin()
            return chain.proceed(firstRequest) // wird vom Activity-Restart kurz darauf abgefangen
        }

        val newAccessToken = synchronized(tokenManager) {
            // Falls ein paralleler Request den Token bereits erneuert hat: nutzen
            val current = tokenManager.token
            if (!current.isNullOrEmpty() && current != token) current
            else refreshAccessToken(refresh)
        }

        if (newAccessToken.isNullOrBlank()) {
            firstResponse.close()
            forceReLogin()
            return chain.proceed(firstRequest)
        }

        firstResponse.close()
        val retried = original.newBuilder()
            .header("Authorization", "Bearer $newAccessToken")
            .build()
        return chain.proceed(retried)
    }

    /** Macht einen synchronen Token-Refresh gegen den Authentik-Token-Endpoint. */
    private fun refreshAccessToken(refreshToken: String): String? {
        val tokenUrl = OidcConstants.AUTHENTIK_ISSUER.removeSuffix("/") + "/token/"
        val body = FormBody.Builder()
            .add("grant_type", "refresh_token")
            .add("refresh_token", refreshToken)
            .add("client_id", OidcConstants.CLIENT_ID)
            .build()
        val request = Request.Builder().url(tokenUrl).post(body).build()
        return try {
            refreshClient.newCall(request).execute().use { resp ->
                if (!resp.isSuccessful) {
                    Log.w(TAG, "Token refresh failed: HTTP ${resp.code}")
                    return null
                }
                val json = JSONObject(resp.body?.string() ?: return null)
                val newAccess = json.optString("access_token").takeIf { it.isNotBlank() } ?: return null
                val newRefresh = json.optString("refresh_token").takeIf { it.isNotBlank() }
                tokenManager.token = newAccess
                if (!newRefresh.isNullOrBlank()) tokenManager.refreshToken = newRefresh
                Log.d(TAG, "Token refreshed successfully")
                newAccess
            }
        } catch (e: Exception) {
            Log.e(TAG, "Token refresh threw", e)
            null
        }
    }

    private fun forceReLogin() {
        tokenManager.clear()
        try {
            val ctx = MembersApp.instance
            val intent = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName) ?: return
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
            ctx.startActivity(intent)
        } catch (_: Exception) { /* swallow */ }
    }

    companion object {
        private const val TAG = "AuthInterceptor"
    }
}
