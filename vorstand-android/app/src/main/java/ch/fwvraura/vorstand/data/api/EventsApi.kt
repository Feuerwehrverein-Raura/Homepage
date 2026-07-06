package ch.fwvraura.vorstand.data.api

import ch.fwvraura.vorstand.data.model.*
import okhttp3.RequestBody
import okhttp3.ResponseBody
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
     * Ruft die von Mitgliedern eingereichten Event-Vorschlaege ab.
     *
     * Sendet einen GET-Request an "events/proposals" (Vorstand-Auth). Liefert
     * alle Events mit status == "proposed" – also Vorschlaege, die noch auf
     * Genehmigung oder Ablehnung durch den Vorstand warten. Diese Events sind
     * bewusst NICHT in der normalen getEvents()-Liste enthalten.
     *
     * Jeder Vorschlag enthaelt zusaetzlich die Angaben zum vorschlagenden
     * Mitglied (organizer_vorname, organizer_nachname, organizer_email,
     * organizer_id) – der Vorschlagende ist der voreingestellte Organisator.
     *
     * @return Response<List<Event>> - Enthaelt bei Erfolg die Liste der Vorschlaege.
     */
    @GET("events/proposals")
    suspend fun getProposals(): Response<List<Event>>

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
     * Aktualisiert ein Event mit einem vorserialisierten JSON-Body.
     *
     * Wird beim Bearbeiten verwendet, damit gezielt einzelne Felder auf null
     * gesetzt (geleert) werden koennen — z.B. den PDF-Aushang entfernen. Der
     * Standard-Gson des Retrofit-Clients laesst null-Felder weg, weshalb der
     * Aufrufer den Body selbst mit serializeNulls serialisiert und als
     * RequestBody ("application/json") uebergibt. Das Backend setzt genau die
     * mitgelieferten Felder (present+null = leeren, fehlend = unveraendert).
     */
    @PUT("events/{id}")
    suspend fun updateEventRaw(
        @Path("id") id: String,
        @Body body: RequestBody
    ): Response<Event>

    /**
     * Aktualisiert gezielt einzelne Felder eines Events per Map-Body.
     *
     * Wird zum Genehmigen eines Event-Vorschlags verwendet: mit
     * mapOf("status" to "planned") wird der Status von "proposed" auf
     * "planned" gesetzt, ohne die uebrigen Felder anzufassen. Das Backend
     * aktualisiert nur die mitgelieferten Felder.
     *
     * @param id Die eindeutige ID des Events.
     * @param body Map mit den zu setzenden Feldern (z.B. {"status": "planned"}).
     *             @JvmSuppressWildcards sorgt fuer korrekte JSON-Serialisierung.
     * @return Response<Event> - Enthaelt bei Erfolg das aktualisierte Event-Objekt.
     */
    @PUT("events/{id}")
    suspend fun updateEventStatus(
        @Path("id") id: String,
        @Body body: Map<String, @JvmSuppressWildcards Any?>
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

    /**
     * Schlaegt einer angemeldeten Person eine alternative Schicht vor (bei voller
     * oder abgesagter Schicht). Body: {shift_id} der Zielschicht.
     *
     * @param id ID der bestehenden Anmeldung.
     * @param body {"shift_id": "..."} — die vorgeschlagene Alternativ-Schicht.
     */
    @POST("registrations/{id}/suggest-alternative")
    suspend fun suggestAlternative(
        @Path("id") id: String,
        @Body body: Map<String, @JvmSuppressWildcards Any?>
    ): Response<Unit>

    /**
     * Informiert alle Angemeldeten (bestaetigt + wartend) ueber eine Aenderung am
     * Event — per E-Mail oder Brief je nach Zustellpraeferenz.
     *
     * @param id Event-ID.
     * @param body {"message": "..."} — der Aenderungstext.
     * @return NotifyResult mit Zaehlern (emailed/posted/skipped/unreachable).
     */
    @POST("events/{id}/notify-registrants")
    suspend fun notifyRegistrants(
        @Path("id") id: String,
        @Body body: Map<String, @JvmSuppressWildcards Any?>
    ): Response<NotifyResult>

    /**
     * Laedt den PDF-Aushang (Plakat) eines Events als Binaerstrom.
     * @Streaming verhindert, dass Retrofit die ganze Datei in den Speicher laedt.
     */
    @Streaming
    @GET("events/{id}/pdf")
    suspend fun getAushangPdf(@Path("id") id: String): Response<ResponseBody>

    /**
     * Laedt die Teilnehmerliste eines Events als PDF-Binaerstrom.
     */
    @Streaming
    @GET("events/{id}/pdf/teilnehmerliste")
    suspend fun getTeilnehmerlistePdf(@Path("id") id: String): Response<ResponseBody>

    // =====================================================================
    // Rezepte & Einkaufsliste (read-only Proxy zur Inventar-API; Zugriff
    // serverseitig fuer Vorstand ODER Organisator des Events).
    // =====================================================================

    /** Mit dem Event verknuepfte Rezepte (Chips). */
    @GET("events/{id}/recipes")
    suspend fun getRecipes(@Path("id") id: String): Response<List<Recipe>>

    /** Aus den Rezepten berechnete Einkaufsliste. */
    @GET("events/{id}/shopping-list")
    suspend fun getShoppingList(@Path("id") id: String): Response<ShoppingList>

    // =====================================================================
    // Organisator-Notizen — pro Event beliebig viele Notizen mit Text und/oder
    // beliebig vielen Anhaengen (Bilder UND Dokumente).
    // =====================================================================

    /**
     * Ruft alle Organisator-Notizen eines Events ab (neueste zuerst).
     *
     * @param id Event-ID.
     * @return Response<List<OrganizerNote>> — je Notiz Text, Ersteller, Datum und
     *         die Anhang-Metadaten (ohne Binaerinhalt).
     */
    @GET("events/{id}/organizer-notes")
    suspend fun getOrganizerNotes(@Path("id") id: String): Response<List<OrganizerNote>>

    /**
     * Erstellt eine neue Organisator-Notiz.
     *
     * Body: { content?, attachments?:[{ filename, content_type, data(base64) }] }.
     * Mindestens content ODER ein Anhang muss vorhanden sein. Der Standard-Gson
     * laesst null-Felder weg, sodass reine Text- bzw. reine Anhang-Notizen korrekt
     * serialisiert werden.
     *
     * @param id Event-ID.
     * @param body Die Notizdaten (Text und/oder Anhaenge als Base64).
     * @return Response<OrganizerNote> — bei Erfolg (201) die neu erstellte Notiz.
     */
    @POST("events/{id}/organizer-notes")
    suspend fun createOrganizerNote(
        @Path("id") id: String,
        @Body body: CreateOrganizerNoteRequest
    ): Response<OrganizerNote>

    /**
     * Loescht eine ganze Organisator-Notiz (inkl. aller Anhaenge).
     *
     * @param id Event-ID.
     * @param noteId ID der zu loeschenden Notiz.
     * @return Response<Unit> — Body { success:true } wird nicht ausgewertet, nur
     *         der HTTP-Status (analog zu deleteEvent/deleteShift).
     */
    @DELETE("events/{id}/organizer-notes/{noteId}")
    suspend fun deleteOrganizerNote(
        @Path("id") id: String,
        @Path("noteId") noteId: String
    ): Response<Unit>

    /**
     * Loescht einen einzelnen Anhang einer Organisator-Notiz.
     *
     * @param id Event-ID.
     * @param noteId ID der Notiz.
     * @param attId ID des zu loeschenden Anhangs.
     * @return Response<Unit> — nur der HTTP-Status wird ausgewertet.
     */
    @DELETE("events/{id}/organizer-notes/{noteId}/attachments/{attId}")
    suspend fun deleteOrganizerNoteAttachment(
        @Path("id") id: String,
        @Path("noteId") noteId: String,
        @Path("attId") attId: String
    ): Response<Unit>

    /**
     * Laedt den Binaerinhalt eines Notiz-Anhangs (Content-Type serverseitig gesetzt).
     *
     * Erfordert den Bearer-Token (wird vom AuthInterceptor automatisch angehaengt),
     * weshalb der Inhalt NICHT ueber eine <img>-URL, sondern hierueber geladen wird.
     * @Streaming verhindert, dass Retrofit die ganze Datei vorab in den Speicher laedt.
     *
     * @param id Event-ID.
     * @param noteId ID der Notiz.
     * @param attId ID des Anhangs.
     * @return Response<ResponseBody> — die rohen Bytes des Anhangs.
     */
    @Streaming
    @GET("events/{id}/organizer-notes/{noteId}/attachments/{attId}")
    suspend fun getOrganizerNoteAttachment(
        @Path("id") id: String,
        @Path("noteId") noteId: String,
        @Path("attId") attId: String
    ): Response<ResponseBody>
}
