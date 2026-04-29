package ch.fwvraura.members.data.api

import ch.fwvraura.members.data.model.Event
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Path

interface EventsApi {

    /** Alle Events (oeffentlich, kein Auth-Header noetig). */
    @GET("events")
    suspend fun listEvents(): Response<List<Event>>

    @GET("events/{id}")
    suspend fun getEvent(@Path("id") id: String): Response<Event>
}
