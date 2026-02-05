package ch.fwvraura.vorstand.data.api

import ch.fwvraura.vorstand.data.model.*
import retrofit2.Response
import retrofit2.http.*

/**
 * Retrofit-Interface fuer Events, Schichten (Shifts) und Event-Anmeldungen (Registrations).
 *
 * Dieses Interface definiert alle HTTP-Endpunkte fuer die Verwaltung von Vereins-Events.
 * Es umfasst drei Bereiche:
 * 1. Events: CRUD-Operationen fuer Veranstaltungen (z.B. Uebung, Anlass, Versammlung).
 * 2. Schichten (Shifts): Erstellen, Aktualisieren und Loeschen von Arbeitsschichten
 *    innerhalb eines Events.
 * 3. Event-Anmeldungen (Registrations): Genehmigen, Ablehnen, Aktualisieren und
 *    Erstellen von Anmeldungen zu Events.
 *
 * Verwendete Retrofit-Annotationen in diesem Interface:
 * - @GET: Sendet einen HTTP-GET-Request (zum Abrufen von Daten).
 * - @POST: Sendet einen HTTP-POST-Request (zum Erstellen neuer Datensaetze oder Ausfuehren von Aktionen).
 * - @PUT: Sendet einen HTTP-PUT-Request (zum Aktualisieren bestehender Datensaetze).
 * - @DELETE: Sendet einen HTTP-DELETE-Request (zum Loeschen von Datensaetzen).
 * - @Path: Ersetzt einen Platzhalter in der URL (z.B. {id}) durch den uebergebenen Wert.
 * - @Body: Serialisiert das Objekt zu JSON und sendet es im HTTP-Request-Body.
 *   Bei Map<String, Any> wird eine dynamische Key-Value-Struktur als JSON gesendet.
 * - suspend: Kotlin-Coroutine-Funktion - wird asynchron ausgefuehrt, ohne den
 *   Haupt-Thread zu blockieren.
 */
interface EventsApi {

    // =====================================================================
    // Events - CRUD-Operationen fuer Veranstaltungen
    // =====================================================================

    /**
     * Ruft die Liste aller Events ab.
     *
     * Sendet einen GET-Request an "events", um alle Veranstaltungen zu laden.
     *
     * @return Response<List<Event>> - Enthaelt bei Erfolg eine Liste aller Event-Objekte.
     */
    @GET("events")
    suspend fun getEvents(): Response<List<Event>>

    /**
     * Ruft ein einzelnes Event anhand seiner ID ab.
     *
     * Sendet einen GET-Request an "events/{id}", wobei {id} durch den uebergebenen
     * Wert ersetzt wird.
     *
     * @param id Die eindeutige ID des Events. Wird durch @Path in die URL eingesetzt.
     * @return Response<Event> - Enthaelt bei Erfolg das vollstaendige Event-Objekt
     *         (inkl. zugehoeriger Schichten und Anmeldungen).
     */
    @GET("events/{id}")
    suspend fun getEvent(@Path("id") id: String): Response<Event>

    /**
     * Erstellt ein neues Event.
     *
     * Sendet einen POST-Request an "events" mit den Event-Daten im Request-Body.
     * Das EventCreate-Objekt wird durch @Body automatisch zu JSON serialisiert.
     *
     * @param event Das EventCreate-Objekt mit den Daten des neuen Events
     *              (Titel, Datum, Beschreibung etc.). Wird als JSON im Body gesendet.
     * @return Response<Event> - Enthaelt bei Erfolg das erstellte Event-Objekt
     *         (inkl. server-generierter ID).
     */
    @POST("events")
    suspend fun createEvent(@Body event: EventCreate): Response<Event>

    /**
     * Aktualisiert ein bestehendes Event.
     *
     * Sendet einen PUT-Request an "events/{id}" mit den aktualisierten Daten
     * im Request-Body.
     *
     * @param id Die eindeutige ID des zu aktualisierenden Events.
     *           Wird durch @Path in die URL eingesetzt.
     * @param event Das EventCreate-Objekt mit den neuen Daten.
     *              Wird durch @Body als JSON im Body gesendet.
     * @return Response<Event> - Enthaelt bei Erfolg das aktualisierte Event-Objekt.
     */
    @PUT("events/{id}")
    suspend fun updateEvent(
        @Path("id") id: String,
        @Body event: EventCreate
    ): Response<Event>

    /**
     * Loescht ein Event anhand seiner ID.
     *
     * Sendet einen DELETE-Request an "events/{id}".
     *
     * @param id Die eindeutige ID des zu loeschenden Events.
     *           Wird durch @Path in die URL eingesetzt.
     * @return Response<Unit> - Kein Response-Body erwartet. Der HTTP-Statuscode
     *         zeigt den Erfolg oder Misserfolg an.
     */
    @DELETE("events/{id}")
    suspend fun deleteEvent(@Path("id") id: String): Response<Unit>

    // =====================================================================
    // Schichten (Shifts) - Verwaltung von Arbeitsschichten innerhalb von Events
    // =====================================================================

    /**
     * Erstellt eine neue Schicht (Shift).
     *
     * Sendet einen POST-Request an "shifts" mit den Schicht-Daten im Request-Body.
     * Eine Schicht gehoert zu einem bestimmten Event und definiert einen Zeitraum,
     * in dem Mitglieder eingeteilt werden koennen.
     *
     * @param shift Das ShiftCreate-Objekt mit den Daten der neuen Schicht
     *              (Event-ID, Startzeit, Endzeit, benoetigte Personen etc.).
     *              Wird durch @Body als JSON im Body gesendet.
     * @return Response<Shift> - Enthaelt bei Erfolg das erstellte Shift-Objekt.
     */
    @POST("shifts")
    suspend fun createShift(@Body shift: ShiftCreate): Response<Shift>

    /**
     * Aktualisiert eine bestehende Schicht.
     *
     * Sendet einen PUT-Request an "shifts/{id}" mit den aktualisierten Daten
     * im Request-Body.
     *
     * @param id Die eindeutige ID der zu aktualisierenden Schicht.
     *           Wird durch @Path in die URL eingesetzt.
     * @param shift Das ShiftCreate-Objekt mit den neuen Daten.
     *              Wird durch @Body als JSON im Body gesendet.
     * @return Response<Shift> - Enthaelt bei Erfolg das aktualisierte Shift-Objekt.
     */
    @PUT("shifts/{id}")
    suspend fun updateShift(
        @Path("id") id: String,
        @Body shift: ShiftCreate
    ): Response<Shift>

    /**
     * Loescht eine Schicht anhand ihrer ID.
     *
     * Sendet einen DELETE-Request an "shifts/{id}".
     *
     * @param id Die eindeutige ID der zu loeschenden Schicht.
     *           Wird durch @Path in die URL eingesetzt.
     * @return Response<Unit> - Kein Response-Body erwartet.
     */
    @DELETE("shifts/{id}")
    suspend fun deleteShift(@Path("id") id: String): Response<Unit>

    // =====================================================================
    // Event-Anmeldungen (Registrations) - Verwaltung von Anmeldungen zu Events
    // =====================================================================

    /**
     * Genehmigt eine Event-Anmeldung.
     *
     * Sendet einen POST-Request an "registrations/{id}/approve", um eine
     * ausstehende Anmeldung zu genehmigen. Nach der Genehmigung ist das Mitglied
     * fuer das Event angemeldet.
     *
     * @param id Die eindeutige ID der Anmeldung, die genehmigt werden soll.
     *           Wird durch @Path in die URL eingesetzt.
     * @return Response<Unit> - Kein Response-Body erwartet.
     */
    @POST("registrations/{id}/approve")
    suspend fun approveRegistration(@Path("id") id: String): Response<Unit>

    /**
     * Lehnt eine Event-Anmeldung ab.
     *
     * Sendet einen POST-Request an "registrations/{id}/reject", um eine
     * ausstehende Anmeldung abzulehnen.
     *
     * @param id Die eindeutige ID der Anmeldung, die abgelehnt werden soll.
     *           Wird durch @Path in die URL eingesetzt.
     * @return Response<Unit> - Kein Response-Body erwartet.
     */
    @POST("registrations/{id}/reject")
    suspend fun rejectRegistration(@Path("id") id: String): Response<Unit>

    /**
     * Aktualisiert eine bestehende Event-Anmeldung.
     *
     * Sendet einen PUT-Request an "registrations/{id}" mit den aktualisierten
     * Daten im Request-Body. Die Map erlaubt flexibles Senden von beliebigen
     * Key-Value-Paaren als JSON.
     *
     * @param id Die eindeutige ID der zu aktualisierenden Anmeldung.
     *           Wird durch @Path in die URL eingesetzt.
     * @param body Eine Map mit den zu aktualisierenden Feldern und deren neuen Werten.
     *             @JvmSuppressWildcards verhindert, dass Kotlin Wildcard-Typen generiert,
     *             was fuer die korrekte JSON-Serialisierung notwendig ist.
     *             Wird durch @Body als JSON im Body gesendet.
     * @return Response<Unit> - Kein Response-Body erwartet.
     */
    @PUT("registrations/{id}")
    suspend fun updateRegistration(
        @Path("id") id: String,
        @Body body: Map<String, @JvmSuppressWildcards Any>
    ): Response<Unit>

    /**
     * Erstellt eine neue Event-Anmeldung.
     *
     * Sendet einen POST-Request an "registrations" mit den Anmeldedaten im Body.
     * Die Map erlaubt flexibles Senden von beliebigen Key-Value-Paaren als JSON
     * (z.B. event_id, member_id, shift_id etc.).
     *
     * @param body Eine Map mit den Anmeldedaten (z.B. Event-ID, Mitglieds-ID).
     *             @JvmSuppressWildcards verhindert, dass Kotlin Wildcard-Typen generiert,
     *             was fuer die korrekte JSON-Serialisierung notwendig ist.
     *             Wird durch @Body als JSON im Body gesendet.
     * @return Response<Unit> - Kein Response-Body erwartet.
     */
    @POST("registrations")
    suspend fun createRegistration(@Body body: Map<String, @JvmSuppressWildcards Any>): Response<Unit>
}
