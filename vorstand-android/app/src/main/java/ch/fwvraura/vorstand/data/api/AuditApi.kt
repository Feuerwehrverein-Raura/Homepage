package ch.fwvraura.vorstand.data.api

import ch.fwvraura.vorstand.data.model.AuditEntry
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Query

interface AuditApi {

    @GET("audit")
    suspend fun getAuditLog(
        @Query("action") action: String? = null,
        @Query("limit") limit: Int? = 100,
        @Query("since") since: String? = null
    ): Response<List<AuditEntry>>
}
