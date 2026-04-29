package ch.fwvraura.members.data.api

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
        return chain.proceed(request)
    }
}
