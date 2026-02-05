package ch.fwvraura.vorstand.data.api

import ch.fwvraura.vorstand.data.model.LoginRequest
import ch.fwvraura.vorstand.data.model.LoginResponse
import ch.fwvraura.vorstand.data.model.UserInfo
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

interface AuthApi {

    @POST("auth/vorstand/login")
    suspend fun login(@Body request: LoginRequest): Response<LoginResponse>

    @GET("auth/vorstand/me")
    suspend fun getMe(): Response<UserInfo>
}
