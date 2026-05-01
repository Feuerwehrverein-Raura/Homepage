package ch.fwvraura.vorstand.data.api

import ch.fwvraura.vorstand.data.model.ScheduledJob
import ch.fwvraura.vorstand.data.model.ScheduledJobCreate
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface ScheduledJobsApi {

    /** Liste aller geplanten/laufenden/erledigten Jobs. Optional gefiltert nach status. */
    @GET("scheduled-jobs")
    suspend fun list(
        @Query("status") status: String? = null,
        @Query("limit") limit: Int = 100
    ): Response<List<ScheduledJob>>

    /** Job planen. */
    @POST("scheduled-jobs")
    suspend fun create(@Body body: ScheduledJobCreate): Response<ScheduledJob>

    /** Job abbrechen (nur wenn noch im status='scheduled'). */
    @DELETE("scheduled-jobs/{id}")
    suspend fun cancel(@Path("id") id: String): Response<ScheduledJob>
}
