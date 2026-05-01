package ch.fwvraura.vorstand.data.api

import ch.fwvraura.vorstand.data.model.*
import retrofit2.Response
import retrofit2.http.*

interface DispatchApi {

    // ============================================
    // E-MAIL TEMPLATES
    // ============================================

    @GET("templates")
    suspend fun getTemplates(
        @Query("type") type: String? = null
    ): Response<List<EmailTemplate>>

    // ============================================
    // E-MAIL SENDEN
    // ============================================

    @POST("email/send")
    suspend fun sendEmail(
        @Body request: SendEmailRequest
    ): Response<EmailSendResponse>

    @POST("email/bulk")
    suspend fun sendBulkEmail(
        @Body request: BulkEmailRequest
    ): Response<BulkEmailResponse>

    // ============================================
    // SMART DISPATCH
    // ============================================

    @POST("dispatch/smart")
    suspend fun smartDispatch(
        @Body request: SmartDispatchRequest
    ): Response<SmartDispatchResponse>

    // ============================================
    // PINGEN (BRIEFVERSAND)
    // ============================================

    @GET("pingen/account")
    suspend fun getPingenAccount(
        @Query("staging") staging: Boolean = false
    ): Response<PingenAccount>

    @GET("pingen/stats")
    suspend fun getPingenStats(): Response<PingenStats>

    @GET("pingen/letters")
    suspend fun getPingenLetters(
        @Query("event_id") eventId: String? = null,
        @Query("member_id") memberId: String? = null,
        @Query("limit") limit: Int? = 50
    ): Response<List<PingenLetter>>

    @GET("pingen/letters/{letterId}/status")
    suspend fun getPingenLetterStatus(
        @Path("letterId") letterId: String,
        @Query("staging") staging: Boolean = false
    ): Response<PingenLetterStatus>

    @POST("pingen/send-manual")
    suspend fun sendPingenLetter(
        @Body request: PingenSendManualRequest
    ): Response<PingenSendResponse>

    @GET("pingen/post-members")
    suspend fun getPostMembers(): Response<PostMembersResponse>

    // ============================================
    // PINGEN PDF-VERSAND
    // ============================================

    @POST("pingen/send")
    suspend fun sendPingenPdf(
        @Body request: PingenSendPdfRequest
    ): Response<PingenSendResponse>

    @POST("pingen/send-bulk-pdf")
    suspend fun sendPingenBulkPdf(
        @Body request: PingenBulkPdfRequest
    ): Response<PingenBulkPdfResponse>

    // ============================================
    // VERSAND-PROTOKOLL
    // ============================================

    @GET("dispatch-log")
    suspend fun getDispatchLog(
        @Query("type") type: String? = null,
        @Query("status") status: String? = null,
        @Query("member_id") memberId: String? = null,
        @Query("event_id") eventId: String? = null,
        @Query("limit") limit: Int? = 100
    ): Response<List<DispatchLogEntry>>
}
