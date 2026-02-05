package ch.fwvraura.vorstand.data.api

import ch.fwvraura.vorstand.data.model.ApproveRequest
import ch.fwvraura.vorstand.data.model.MemberRegistration
import ch.fwvraura.vorstand.data.model.PendingCount
import ch.fwvraura.vorstand.data.model.RejectRequest
import retrofit2.Response
import retrofit2.http.*

interface MemberRegistrationsApi {

    @GET("member-registrations/count/pending")
    suspend fun getPendingCount(): Response<PendingCount>

    @GET("member-registrations")
    suspend fun getRegistrations(
        @Query("status") status: String? = null
    ): Response<List<MemberRegistration>>

    @GET("member-registrations/{id}")
    suspend fun getRegistration(@Path("id") id: Int): Response<MemberRegistration>

    @POST("member-registrations/{id}/approve")
    suspend fun approve(
        @Path("id") id: Int,
        @Body request: ApproveRequest
    ): Response<Unit>

    @POST("member-registrations/{id}/reject")
    suspend fun reject(
        @Path("id") id: Int,
        @Body request: RejectRequest
    ): Response<Unit>
}
