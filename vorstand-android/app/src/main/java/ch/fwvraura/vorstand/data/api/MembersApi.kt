package ch.fwvraura.vorstand.data.api

import ch.fwvraura.vorstand.data.model.Member
import ch.fwvraura.vorstand.data.model.MemberCreate
import ch.fwvraura.vorstand.data.model.MemberStats
import okhttp3.MultipartBody
import retrofit2.Response
import retrofit2.http.*

/**
 * Retrofit-Interface fuer die Mitglieder-Verwaltung.
 *
 * Dieses Interface definiert alle HTTP-Endpunkte, die fuer das Erstellen, Lesen,
 * Aktualisieren und Loeschen (CRUD) von Vereinsmitgliedern benoetigt werden.
 * Zusaetzlich werden Endpunkte fuer Statistiken und Foto-Upload/-Loeschung bereitgestellt.
 *
 * Verwendete Retrofit-Annotationen in diesem Interface:
 * - @GET: Sendet einen HTTP-GET-Request (zum Abrufen von Daten).
 * - @POST: Sendet einen HTTP-POST-Request (zum Erstellen neuer Datensaetze).
 * - @PUT: Sendet einen HTTP-PUT-Request (zum Aktualisieren bestehender Datensaetze).
 * - @DELETE: Sendet einen HTTP-DELETE-Request (zum Loeschen von Datensaetzen).
 * - @Path: Ersetzt einen Platzhalter in der URL (z.B. {id}) durch den uebergebenen Wert.
 * - @Query: Fuegt einen Query-Parameter an die URL an (z.B. ?status=active&search=Hans).
 *   Wenn der Wert null ist, wird der Parameter weggelassen.
 * - @Body: Serialisiert das Objekt zu JSON und sendet es im HTTP-Request-Body.
 * - @Multipart: Kennzeichnet, dass der Request als Multipart-Formular gesendet wird
 *   (notwendig fuer Datei-Uploads).
 * - @Part: Markiert einen einzelnen Teil eines Multipart-Requests (z.B. eine Datei).
 * - suspend: Kotlin-Coroutine-Funktion - wird asynchron ausgefuehrt, ohne den
 *   Haupt-Thread zu blockieren.
 */
interface MembersApi {

    /**
     * Ruft die Mitglieder-Statistiken ab.
     *
     * Sendet einen GET-Request an "members/stats/overview", um eine Uebersicht
     * der Mitgliederstatistiken zu erhalten (z.B. Anzahl aktive Mitglieder,
     * Neumitglieder etc.).
     *
     * @return Response<MemberStats> - Enthaelt bei Erfolg ein MemberStats-Objekt
     *         mit den aggregierten Statistiken.
     */
    @GET("members/stats/overview")
    suspend fun getStats(): Response<MemberStats>

    /**
     * Ruft die Liste aller Mitglieder ab, optional gefiltert nach Status und Suchbegriff.
     *
     * Sendet einen GET-Request an "members" mit optionalen Query-Parametern.
     * Beispiel-URL: /members?status=active&search=Hans
     *
     * @param status Optionaler Filter fuer den Mitgliedsstatus (z.B. "active", "inactive").
     *               Wird durch @Query als URL-Parameter angehaengt. Wenn null, wird
     *               der Parameter weggelassen und alle Status werden zurueckgegeben.
     * @param search Optionaler Suchbegriff zum Filtern nach Name oder anderen Feldern.
     *               Wird durch @Query als URL-Parameter angehaengt. Wenn null, wird
     *               nicht nach Text gefiltert.
     * @return Response<List<Member>> - Enthaelt bei Erfolg eine Liste von Member-Objekten.
     */
    @GET("members")
    suspend fun getMembers(
        @Query("status") status: String? = null,
        @Query("search") search: String? = null
    ): Response<List<Member>>

    /**
     * Ruft ein einzelnes Mitglied anhand seiner ID ab.
     *
     * Sendet einen GET-Request an "members/{id}", wobei {id} durch den uebergebenen
     * Wert ersetzt wird (z.B. "members/abc123").
     *
     * @param id Die eindeutige ID des Mitglieds. Wird durch @Path in die URL eingesetzt.
     * @return Response<Member> - Enthaelt bei Erfolg das vollstaendige Member-Objekt.
     */
    @GET("members/{id}")
    suspend fun getMember(@Path("id") id: String): Response<Member>

    /**
     * Erstellt ein neues Mitglied.
     *
     * Sendet einen POST-Request an "members" mit den Mitgliedsdaten im Request-Body.
     * Das MemberCreate-Objekt wird durch @Body automatisch zu JSON serialisiert.
     *
     * @param member Das MemberCreate-Objekt mit den Daten des neuen Mitglieds
     *               (Name, E-Mail, etc.). Wird als JSON im Body gesendet.
     * @return Response<Member> - Enthaelt bei Erfolg das erstellte Member-Objekt
     *         (inkl. server-generierter ID).
     */
    @POST("members")
    suspend fun createMember(@Body member: MemberCreate): Response<Member>

    /**
     * Aktualisiert ein bestehendes Mitglied.
     *
     * Sendet einen PUT-Request an "members/{id}" mit den aktualisierten Daten
     * im Request-Body. Ersetzt die vorhandenen Daten des Mitglieds vollstaendig.
     *
     * @param id Die eindeutige ID des zu aktualisierenden Mitglieds.
     *           Wird durch @Path in die URL eingesetzt.
     * @param member Das MemberCreate-Objekt mit den neuen Daten.
     *               Wird durch @Body als JSON im Body gesendet.
     * @return Response<Member> - Enthaelt bei Erfolg das aktualisierte Member-Objekt.
     */
    @PUT("members/{id}")
    suspend fun updateMember(
        @Path("id") id: String,
        @Body member: MemberCreate
    ): Response<Member>

    /**
     * Loescht ein Mitglied anhand seiner ID.
     *
     * Sendet einen DELETE-Request an "members/{id}".
     *
     * @param id Die eindeutige ID des zu loeschenden Mitglieds.
     *           Wird durch @Path in die URL eingesetzt.
     * @return Response<Unit> - Unit bedeutet, dass kein Response-Body erwartet wird.
     *         Der HTTP-Statuscode zeigt den Erfolg oder Misserfolg an.
     */
    @DELETE("members/{id}")
    suspend fun deleteMember(@Path("id") id: String): Response<Unit>

    /**
     * Laedt ein Profilfoto fuer ein Mitglied hoch.
     *
     * Sendet einen POST-Request als Multipart-Formular an "members/{id}/photo".
     * @Multipart kennzeichnet, dass der Request als multipart/form-data gesendet wird,
     * was fuer Datei-Uploads erforderlich ist.
     * @Part markiert den Foto-Parameter als einzelnen Teil des Multipart-Requests.
     *
     * @param id Die eindeutige ID des Mitglieds, fuer das das Foto hochgeladen wird.
     *           Wird durch @Path in die URL eingesetzt.
     * @param photo Das Foto als MultipartBody.Part. Enthaelt die Bilddatei mit
     *              Dateiname und Content-Type. Wird durch @Part als Multipart-Teil gesendet.
     * @return Response<Map<String, String>> - Enthaelt bei Erfolg eine Map mit
     *         Informationen zum hochgeladenen Foto (z.B. die URL des Fotos).
     */
    @Multipart
    @POST("members/{id}/photo")
    suspend fun uploadPhoto(
        @Path("id") id: String,
        @Part photo: MultipartBody.Part
    ): Response<Map<String, String>>

    /**
     * Loescht das Profilfoto eines Mitglieds.
     *
     * Sendet einen DELETE-Request an "members/{id}/photo", um das aktuelle
     * Profilfoto des Mitglieds zu entfernen.
     *
     * @param id Die eindeutige ID des Mitglieds, dessen Foto geloescht werden soll.
     *           Wird durch @Path in die URL eingesetzt.
     * @return Response<Unit> - Kein Response-Body erwartet. Der HTTP-Statuscode
     *         zeigt den Erfolg oder Misserfolg an.
     */
    @DELETE("members/{id}/photo")
    suspend fun deletePhoto(@Path("id") id: String): Response<Unit>
}
