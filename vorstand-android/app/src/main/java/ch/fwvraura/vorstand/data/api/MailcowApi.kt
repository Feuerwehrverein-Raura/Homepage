package ch.fwvraura.vorstand.data.api

import ch.fwvraura.vorstand.data.model.*
import retrofit2.Response
import retrofit2.http.*

interface MailcowApi {

    // ============================================
    // MAILBOXEN
    // ============================================

    @GET("mailcow/mailboxes")
    suspend fun getMailboxes(): Response<List<Mailbox>>

    @GET("mailcow/mailboxes/{email}")
    suspend fun getMailbox(@Path("email") email: String): Response<Mailbox>

    @POST("mailcow/mailboxes")
    suspend fun createMailbox(@Body request: MailboxCreateRequest): Response<Any>

    @PUT("mailcow/mailboxes/{email}")
    suspend fun updateMailbox(
        @Path("email") email: String,
        @Body request: MailboxUpdateRequest
    ): Response<Any>

    @DELETE("mailcow/mailboxes/{email}")
    suspend fun deleteMailbox(@Path("email") email: String): Response<Any>

    // ============================================
    // ALIASE
    // ============================================

    @GET("mailcow/aliases")
    suspend fun getAliases(): Response<List<MailAlias>>

    @POST("mailcow/aliases")
    suspend fun createAlias(@Body request: AliasCreateRequest): Response<Any>

    @PUT("mailcow/aliases/{id}")
    suspend fun updateAlias(
        @Path("id") id: Int,
        @Body request: AliasUpdateRequest
    ): Response<Any>

    @DELETE("mailcow/aliases/{id}")
    suspend fun deleteAlias(@Path("id") id: Int): Response<Any>

    // ============================================
    // QUOTA
    // ============================================

    @GET("mailcow/quota")
    suspend fun getQuota(): Response<List<QuotaInfo>>

    // ============================================
    // ZUSTELLLISTE
    // ============================================

    @GET("members/emails/zustellung")
    suspend fun getZustellliste(): Response<ZustellungResponse>

    @POST("members/emails/sync-alias")
    suspend fun syncAlias(): Response<SyncAliasResponse>
}
