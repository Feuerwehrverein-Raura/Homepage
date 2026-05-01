package ch.fwvraura.vorstand.data.api

import ch.fwvraura.vorstand.data.model.*
import retrofit2.Response
import retrofit2.http.*

interface VaultwardenApi {

    @POST("api/accounts/prelogin")
    suspend fun preLogin(
        @Body request: VaultPreLoginRequest
    ): Response<VaultPreLoginResponse>

    @FormUrlEncoded
    @POST("identity/connect/token")
    suspend fun login(
        @Field("grant_type") grantType: String = "password",
        @Field("username") username: String,
        @Field("password") password: String,
        @Field("scope") scope: String = "api offline_access",
        @Field("client_id") clientId: String = "mobile",
        @Field("deviceType") deviceType: String = "0",
        @Field("deviceIdentifier") deviceIdentifier: String,
        @Field("deviceName") deviceName: String = "Vorstand App"
    ): Response<VaultLoginResponse>

    @GET("api/sync")
    suspend fun sync(
        @Header("Authorization") authorization: String
    ): Response<VaultSyncResponse>
}
