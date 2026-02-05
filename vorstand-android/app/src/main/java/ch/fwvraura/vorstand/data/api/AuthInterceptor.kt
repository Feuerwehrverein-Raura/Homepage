package ch.fwvraura.vorstand.data.api

import android.content.Intent
import ch.fwvraura.vorstand.VorstandApp
import ch.fwvraura.vorstand.util.TokenManager
import okhttp3.Interceptor
import okhttp3.Response

class AuthInterceptor(private val tokenManager: TokenManager) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()

        val token = tokenManager.token
        val request = if (!token.isNullOrEmpty()) {
            original.newBuilder()
                .header("Authorization", "Bearer $token")
                .build()
        } else {
            original
        }

        val response = chain.proceed(request)

        if (response.code == 401 && !original.url.encodedPath.contains("login")) {
            tokenManager.clear()
            val context = VorstandApp.instance
            val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                context.startActivity(intent)
            }
        }

        return response
    }
}
