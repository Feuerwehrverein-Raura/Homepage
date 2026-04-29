package ch.fwvraura.members.data.api

import ch.fwvraura.members.data.model.Event
import ch.fwvraura.members.data.model.EventRegistration
import ch.fwvraura.members.data.model.MyRegistration
import ch.fwvraura.members.data.model.PublicRegistrationRequest
import ch.fwvraura.members.data.model.PublicRegistrationResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

interface EventsApi {

    /** Alle Events (oeffentlich, kein Auth-Header noetig). */
    @GET("events")
    suspend fun listEvents(): Response<List<Event>>

    @GET("events/{id}")
    suspend fun getEvent(@Path("id") id: String): Response<Event>

    /** Oeffentliche Anmeldung — auch ohne Login moeglich. */
    @POST("registrations/public")
    suspend fun publicRegister(@Body body: PublicRegistrationRequest): Response<PublicRegistrationResponse>

    /** Liste der Anmeldungen fuer das Event eines eingeloggten Organisators. */
    @GET("events/my-event/registrations")
    suspend fun listMyEventRegistrations(): Response<List<EventRegistration>>

    @POST("events/my-event/registrations/{id}/approve")
    suspend fun approveMyEventRegistration(@Path("id") id: String): Response<Unit>

    @POST("events/my-event/registrations/{id}/reject")
    suspend fun rejectMyEventRegistration(@Path("id") id: String): Response<Unit>

    /** Events bei denen der eingeloggte User per E-Mail-Match Organisator ist. */
    @GET("events/organized-by-me")
    suspend fun listOrganizedByMe(): Response<List<Event>>

    /** Anmeldungen fuer ein Event, das der eingeloggte User organisiert (E-Mail-Match). */
    @GET("events/{id}/organizer-registrations")
    suspend fun listOrganizerRegistrations(@Path("id") id: String): Response<List<EventRegistration>>

    @POST("events/{eventId}/registrations/{regId}/approve-as-organizer")
    suspend fun approveAsOrganizer(
        @Path("eventId") eventId: String,
        @Path("regId") regId: String
    ): Response<Unit>

    @POST("events/{eventId}/registrations/{regId}/reject-as-organizer")
    suspend fun rejectAsOrganizer(
        @Path("eventId") eventId: String,
        @Path("regId") regId: String
    ): Response<Unit>

    /** Eigene Anmeldungen des eingeloggten Users (mit Event-Details). */
    @GET("registrations/mine")
    suspend fun listMyRegistrations(): Response<List<MyRegistration>>
}
