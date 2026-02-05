package ch.fwvraura.vorstand.data.api

import ch.fwvraura.vorstand.data.model.Member
import ch.fwvraura.vorstand.data.model.MemberCreate
import ch.fwvraura.vorstand.data.model.MemberStats
import okhttp3.MultipartBody
import retrofit2.Response
import retrofit2.http.*

interface MembersApi {

    @GET("members/stats/overview")
    suspend fun getStats(): Response<MemberStats>

    @GET("members")
    suspend fun getMembers(
        @Query("status") status: String? = null,
        @Query("search") search: String? = null
    ): Response<List<Member>>

    @GET("members/{id}")
    suspend fun getMember(@Path("id") id: String): Response<Member>

    @POST("members")
    suspend fun createMember(@Body member: MemberCreate): Response<Member>

    @PUT("members/{id}")
    suspend fun updateMember(
        @Path("id") id: String,
        @Body member: MemberCreate
    ): Response<Member>

    @DELETE("members/{id}")
    suspend fun deleteMember(@Path("id") id: String): Response<Unit>

    @Multipart
    @POST("members/{id}/photo")
    suspend fun uploadPhoto(
        @Path("id") id: String,
        @Part photo: MultipartBody.Part
    ): Response<Map<String, String>>

    @DELETE("members/{id}/photo")
    suspend fun deletePhoto(@Path("id") id: String): Response<Unit>
}
