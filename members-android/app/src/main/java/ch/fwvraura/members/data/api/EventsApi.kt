package ch.fwvraura.members.data.api

import ch.fwvraura.members.data.model.AddManualItemRequest
import ch.fwvraura.members.data.model.AvailableItem
import ch.fwvraura.members.data.model.AvailableRecipe
import ch.fwvraura.members.data.model.CreateOrganizerNoteRequest
import ch.fwvraura.members.data.model.Event
import ch.fwvraura.members.data.model.EventRegistration
import ch.fwvraura.members.data.model.LinkRecipeRequest
import ch.fwvraura.members.data.model.LinkedRecipe
import ch.fwvraura.members.data.model.MyRegistration
import ch.fwvraura.members.data.model.NotifyResult
import ch.fwvraura.members.data.model.OrganizerNote
import ch.fwvraura.members.data.model.PublicRegistrationRequest
import ch.fwvraura.members.data.model.PublicRegistrationResponse
import ch.fwvraura.members.data.model.Recipe
import ch.fwvraura.members.data.model.ShoppingList
import ch.fwvraura.members.data.model.UpdateServingsRequest
import okhttp3.RequestBody
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Streaming

interface EventsApi {

    /** Alle Events (oeffentlich, kein Auth-Header noetig). */
    @GET("events")
    suspend fun listEvents(): Response<List<Event>>

    @GET("events/{id}")
    suspend fun getEvent(@Path("id") id: String): Response<Event>

    /**
     * Event vorschlagen (eingeloggtes Mitglied). Erzeugt KEIN veroeffentlichtes
     * Event, sondern einen Vorschlag (status='proposed'), den der Vorstand spaeter
     * prueft und freigibt. Body: {title, subtitle?, description?, start_date,
     * end_date?, location?, category?, cost?}. Das Backend setzt den Vorschlagenden
     * automatisch als Organisator — daher keine Organizer-Felder senden.
     */
    @POST("events/propose")
    suspend fun proposeEvent(@Body body: Map<String, @JvmSuppressWildcards Any?>): Response<Event>

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

    /** Anmeldung als Organisator manuell hinzufuegen (z.B. fuer telefonisch gemeldete Gaeste). */
    @POST("events/{id}/registrations-as-organizer")
    suspend fun addRegistrationAsOrganizer(
        @Path("id") eventId: String,
        @Body body: ch.fwvraura.members.data.model.OrganizerAddRegistrationRequest
    ): Response<PublicRegistrationResponse>

    /** Anmeldung als Organisator bearbeiten (Name, E-Mail, Telefon, Personen, Notiz, Status). */
    @PUT("events/{eventId}/registrations/{regId}/as-organizer")
    suspend fun editAsOrganizer(
        @Path("eventId") eventId: String,
        @Path("regId") regId: String,
        @Body body: ch.fwvraura.members.data.model.OrganizerEditRegistrationRequest
    ): Response<Unit>

    /** Anmeldung als Organisator loeschen. */
    @DELETE("events/{eventId}/registrations/{regId}/as-organizer")
    suspend fun deleteAsOrganizer(
        @Path("eventId") eventId: String,
        @Path("regId") regId: String
    ): Response<Unit>

    /** Eigene Anmeldungen des eingeloggten Users (mit Event-Details). */
    @GET("registrations/mine")
    suspend fun listMyRegistrations(): Response<List<MyRegistration>>

    /** Aggregierte Kalender-Eintraege (events + Beitraege + Dispatches). */
    @GET("calendar/items")
    suspend fun listCalendarItems(): Response<List<ch.fwvraura.members.data.model.CalendarItem>>

    // ============================================================
    // Organisator-Verwaltung (E-Mail-Match auf event.organizer_email).
    // Alle Endpunkte pruefen serverseitig ueber ensureOrganizerAccess.
    // ============================================================

    /**
     * Event-Grunddaten als Organisator bearbeiten (eingeschraenkte Felder).
     * Vorserialisierter JSON-Body (RequestBody), damit gezielt Felder auf null
     * gesetzt werden koennen (z.B. PDF-Aushang entfernen) — der Standard-Gson
     * laesst null-Felder sonst weg.
     */
    @PUT("events/{id}/as-organizer")
    suspend fun updateEventAsOrganizer(
        @Path("id") id: String,
        @Body body: RequestBody
    ): Response<Event>

    /** Schicht zu einem organisierten Event hinzufuegen. */
    @POST("events/{id}/shifts-as-organizer")
    suspend fun createShiftAsOrganizer(
        @Path("id") eventId: String,
        @Body body: Map<String, @JvmSuppressWildcards Any?>
    ): Response<Unit>

    /** Schicht eines organisierten Events bearbeiten. */
    @PUT("events/{eventId}/shifts/{shiftId}/as-organizer")
    suspend fun updateShiftAsOrganizer(
        @Path("eventId") eventId: String,
        @Path("shiftId") shiftId: String,
        @Body body: Map<String, @JvmSuppressWildcards Any?>
    ): Response<Unit>

    /** Schicht eines organisierten Events loeschen. */
    @DELETE("events/{eventId}/shifts/{shiftId}/as-organizer")
    suspend fun deleteShiftAsOrganizer(
        @Path("eventId") eventId: String,
        @Path("shiftId") shiftId: String
    ): Response<Unit>

    /**
     * Alternative Schicht vorschlagen (als Organisator).
     * Body: {newShiftId, email, shiftInfo (Label-String reicht), comment?}.
     */
    @POST("events/{eventId}/registrations/{regId}/suggest-alternative-as-organizer")
    suspend fun suggestAlternativeAsOrganizer(
        @Path("eventId") eventId: String,
        @Path("regId") regId: String,
        @Body body: Map<String, @JvmSuppressWildcards Any?>
    ): Response<Unit>

    /**
     * Angemeldete ueber eine Aenderung informieren (als Organisator).
     * Body: {subject, message}.
     */
    @POST("events/{id}/notify-registrants-as-organizer")
    suspend fun notifyRegistrantsAsOrganizer(
        @Path("id") id: String,
        @Body body: Map<String, @JvmSuppressWildcards Any?>
    ): Response<NotifyResult>

    // ============================================================
    // Rezepte & Einkaufsliste (read-only Proxy zur Inventar-API;
    // Zugriff serverseitig fuer Vorstand ODER Organisator).
    // ============================================================

    @GET("events/{id}/recipes")
    suspend fun getRecipes(@Path("id") id: String): Response<List<Recipe>>

    @GET("events/{id}/shopping-list")
    suspend fun getShoppingList(@Path("id") id: String): Response<ShoppingList>

    // ============================================================
    // Rezepte & Material — editierbar (Vorstand ODER Organisator des Events,
    // serverseitig via requireEventRecipeAccess geprueft). Proxy zur Inventar-API.
    // ============================================================

    /** Mit dem Event verknuepfte Rezepte (ausfuehrlich: id, servings, ...). */
    @GET("events/{id}/recipes")
    suspend fun getLinkedRecipes(@Path("id") id: String): Response<List<LinkedRecipe>>

    /** Alle auswaehlbaren Rezepte. */
    @GET("events/{id}/available-recipes")
    suspend fun getAvailableRecipes(@Path("id") id: String): Response<List<AvailableRecipe>>

    /** Alle auswaehlbaren Materialien. */
    @GET("events/{id}/available-items")
    suspend fun getAvailableItems(@Path("id") id: String): Response<List<AvailableItem>>

    /** Rezept mit dem Event verknuepfen (Upsert von Portionen). */
    @POST("events/{id}/recipes")
    suspend fun linkRecipe(
        @Path("id") id: String,
        @Body body: LinkRecipeRequest
    ): Response<Unit>

    /** Portionen einer Verknuepfung aendern. */
    @PUT("events/{id}/recipes/{recipeId}")
    suspend fun updateRecipeServings(
        @Path("id") id: String,
        @Path("recipeId") recipeId: Int,
        @Body body: UpdateServingsRequest
    ): Response<Unit>

    /** Verknuepfung loesen. */
    @DELETE("events/{id}/recipes/{recipeId}")
    suspend fun unlinkRecipe(
        @Path("id") id: String,
        @Path("recipeId") recipeId: Int
    ): Response<Unit>

    /** Manuelle Material-Position hinzufuegen (Upsert von Menge). */
    @POST("events/{id}/manual-items")
    suspend fun addManualItem(
        @Path("id") id: String,
        @Body body: AddManualItemRequest
    ): Response<Unit>

    /** Manuelle Material-Position entfernen. */
    @DELETE("events/{id}/manual-items/{itemId}")
    suspend fun removeManualItem(
        @Path("id") id: String,
        @Path("itemId") itemId: Int
    ): Response<Unit>

    // ============================================================
    // Organisator-Notizen (pro Event; Zugriff fuer Vorstand ODER Organisator,
    // serverseitig geprueft). Jede Notiz hat Text und/oder Anhaenge.
    // ============================================================

    /** Alle Notizen eines Events (neueste zuerst). */
    @GET("events/{id}/organizer-notes")
    suspend fun getOrganizerNotes(@Path("id") eventId: String): Response<List<OrganizerNote>>

    /** Neue Notiz anlegen (Text und/oder Anhaenge als Base64.NO_WRAP). */
    @POST("events/{id}/organizer-notes")
    suspend fun createOrganizerNote(
        @Path("id") eventId: String,
        @Body body: CreateOrganizerNoteRequest
    ): Response<OrganizerNote>

    /** Eine ganze Notiz (samt Anhaengen) loeschen. */
    @DELETE("events/{eventId}/organizer-notes/{noteId}")
    suspend fun deleteOrganizerNote(
        @Path("eventId") eventId: String,
        @Path("noteId") noteId: String
    ): Response<Unit>

    /** Einen einzelnen Anhang einer Notiz loeschen. */
    @DELETE("events/{eventId}/organizer-notes/{noteId}/attachments/{attId}")
    suspend fun deleteOrganizerNoteAttachment(
        @Path("eventId") eventId: String,
        @Path("noteId") noteId: String,
        @Path("attId") attId: String
    ): Response<Unit>

    /**
     * Die Bytes eines Anhangs authentifiziert laden (Content-Type wird
     * serverseitig gesetzt). Ueber @Streaming, damit der Bearer-Token via
     * Interceptor mitgeht — NICHT ueber eine <img>-URL.
     */
    @Streaming
    @GET("events/{eventId}/organizer-notes/{noteId}/attachments/{attId}")
    suspend fun getOrganizerNoteAttachment(
        @Path("eventId") eventId: String,
        @Path("noteId") noteId: String,
        @Path("attId") attId: String
    ): Response<ResponseBody>

    // ============================================================
    // PDFs (binaer). Endpunkte sind serverseitig oeffentlich lesbar.
    // ============================================================

    @Streaming
    @GET("events/{id}/pdf/teilnehmerliste")
    suspend fun getTeilnehmerlistePdf(@Path("id") id: String): Response<ResponseBody>

    @Streaming
    @GET("events/{id}/pdf")
    suspend fun getAushangPdf(@Path("id") id: String): Response<ResponseBody>
}
