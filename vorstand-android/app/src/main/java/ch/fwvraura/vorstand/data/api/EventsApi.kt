package ch.fwvraura.vorstand.data.api

import ch.fwvraura.vorstand.data.model.*
import retrofit2.Response
import retrofit2.http.*

interface EventsApi {

    @GET("events")
    suspend fun getEvents(): Response<List<Event>>

    @GET("events/{id}")
    suspend fun getEvent(@Path("id") id: String): Response<Event>

    @POST("events")
    suspend fun createEvent(@Body event: EventCreate): Response<Event>

    @PUT("events/{id}")
    suspend fun updateEvent(
        @Path("id") id: String,
        @Body event: EventCreate
    ): Response<Event>

    @DELETE("events/{id}")
    suspend fun deleteEvent(@Path("id") id: String): Response<Unit>

    // Shifts
    @POST("shifts")
    suspend fun createShift(@Body shift: ShiftCreate): Response<Shift>

    @PUT("shifts/{id}")
    suspend fun updateShift(
        @Path("id") id: String,
        @Body shift: ShiftCreate
    ): Response<Shift>

    @DELETE("shifts/{id}")
    suspend fun deleteShift(@Path("id") id: String): Response<Unit>

    // Event Registrations
    @POST("registrations/{id}/approve")
    suspend fun approveRegistration(@Path("id") id: String): Response<Unit>

    @POST("registrations/{id}/reject")
    suspend fun rejectRegistration(@Path("id") id: String): Response<Unit>

    @PUT("registrations/{id}")
    suspend fun updateRegistration(
        @Path("id") id: String,
        @Body body: Map<String, @JvmSuppressWildcards Any>
    ): Response<Unit>

    @POST("registrations")
    suspend fun createRegistration(@Body body: Map<String, @JvmSuppressWildcards Any>): Response<Unit>
}
