package ch.fwvraura.members.data.api

import android.content.Intent
import ch.fwvraura.members.MembersApp
import ch.fwvraura.members.util.TokenManager
import okhttp3.Interceptor
import okhttp3.Response

class AuthInterceptor(private val tokenManager: TokenManager) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()
        val token = tokenManager.token
        val request = if (!token.isNullOrEmpty()) {
            original.newBuilder().header("Authorization", "Bearer $token").build()
        } else original
        val response = chain.proceed(request)

        // Bei 401/403 ist der Token entweder abgelaufen oder ungueltig.
        // Login-Endpoints ausschliessen, sonst landet ein fehlgeschlagener Login
        // direkt auf dem Login-Screen ohne Fehlermeldung.
        if ((response.code == 401 || response.code == 403)
            && !original.url.encodedPath.contains("login")
        ) {
            tokenManager.clear()
            try {
                val ctx = MembersApp.instance
                val intent = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
                if (intent != null) {
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                    ctx.startActivity(intent)
                }
            } catch (_: Exception) { /* swallow */ }
        }
        return response
    }
}
