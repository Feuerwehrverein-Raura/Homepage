package ch.fwvraura.vorstand.data.api

import ch.fwvraura.vorstand.data.model.ApproveRequest
import ch.fwvraura.vorstand.data.model.MemberRegistration
import ch.fwvraura.vorstand.data.model.PendingCount
import ch.fwvraura.vorstand.data.model.RejectRequest
import retrofit2.Response
import retrofit2.http.*

/**
 * Retrofit-Interface fuer Mitgliedschaftsantraege (Member Registrations).
 *
 * Dieses Interface definiert die HTTP-Endpunkte fuer die Verwaltung von
 * Mitgliedschaftsantraegen. Wenn sich eine Person ueber die Webseite als neues Mitglied
 * registriert, wird ein Antrag erstellt, der vom Vorstand genehmigt oder abgelehnt
 * werden kann. Dieses Interface stellt Endpunkte bereit fuer:
 * - Abrufen der Anzahl offener Antraege
 * - Auflisten aller Antraege (optional nach Status gefiltert)
 * - Abrufen eines einzelnen Antrags
 * - Genehmigen eines Antrags
 * - Ablehnen eines Antrags
 *
 * Verwendete Retrofit-Annotationen in diesem Interface:
 * - @GET: Sendet einen HTTP-GET-Request (zum Abrufen von Daten).
 * - @POST: Sendet einen HTTP-POST-Request (zum Ausfuehren von Aktionen wie Genehmigen/Ablehnen).
 * - @Path: Ersetzt einen Platzhalter in der URL (z.B. {id}) durch den uebergebenen Wert.
 * - @Query: Fuegt einen Query-Parameter an die URL an (z.B. ?status=pending).
 * - @Body: Serialisiert das Objekt zu JSON und sendet es im HTTP-Request-Body.
 * - suspend: Kotlin-Coroutine-Funktion - wird asynchron ausgefuehrt, ohne den
 *   Haupt-Thread zu blockieren.
 */
interface MemberRegistrationsApi {

    /**
     * Ruft die Anzahl der ausstehenden (pending) Mitgliedschaftsantraege ab.
     *
     * Sendet einen GET-Request an "member-registrations/count/pending".
     * Wird z.B. verwendet, um ein Badge mit der Anzahl offener Antraege
     * in der Navigation anzuzeigen.
     *
     * @return Response<PendingCount> - Enthaelt bei Erfolg ein PendingCount-Objekt
     *         mit der Anzahl der ausstehenden Antraege.
     */
    @GET("member-registrations/count/pending")
    suspend fun getPendingCount(): Response<PendingCount>

    /**
     * Ruft die Liste aller Mitgliedschaftsantraege ab, optional gefiltert nach Status.
     *
     * Sendet einen GET-Request an "member-registrations" mit optionalem Query-Parameter.
     * Beispiel-URL: /member-registrations?status=pending
     *
     * @param status Optionaler Filter fuer den Antragsstatus (z.B. "pending", "approved", "rejected").
     *               Wird durch @Query als URL-Parameter angehaengt. Wenn null, werden
     *               alle Antraege unabhaengig vom Status zurueckgegeben.
     * @return Response<List<MemberRegistration>> - Enthaelt bei Erfolg eine Liste
     *         von MemberRegistration-Objekten mit den Antragsdaten
     *         (Name, E-Mail, Geburtsdatum, Status etc.).
     */
    @GET("member-registrations")
    suspend fun getRegistrations(
        @Query("status") status: String? = null
    ): Response<List<MemberRegistration>>

    /**
     * Ruft einen einzelnen Mitgliedschaftsantrag anhand seiner ID ab.
     *
     * Sendet einen GET-Request an "member-registrations/{id}", wobei {id} durch
     * den uebergebenen Wert ersetzt wird.
     *
     * @param id Die eindeutige ID des Antrags. Wird durch @Path in die URL eingesetzt.
     * @return Response<MemberRegistration> - Enthaelt bei Erfolg das vollstaendige
     *         MemberRegistration-Objekt mit allen Antragsdaten.
     */
    @GET("member-registrations/{id}")
    suspend fun getRegistration(@Path("id") id: String): Response<MemberRegistration>

    /**
     * Genehmigt einen Mitgliedschaftsantrag.
     *
     * Sendet einen POST-Request an "member-registrations/{id}/approve", um den
     * Antrag zu genehmigen. Der ApproveRequest im Body kann zusaetzliche Informationen
     * enthalten (z.B. zugewiesene Mitgliedsnummer, Startdatum etc.).
     * Nach der Genehmigung wird die Person als Mitglied im System angelegt.
     *
     * @param id Die eindeutige ID des zu genehmigenden Antrags.
     *           Wird durch @Path in die URL eingesetzt.
     * @param request Das ApproveRequest-Objekt mit zusaetzlichen Genehmigungs-Daten.
     *                Wird durch @Body als JSON im Body gesendet.
     * @return Response<Unit> - Kein Response-Body erwartet. Der HTTP-Statuscode
     *         zeigt den Erfolg oder Misserfolg an.
     */
    @POST("member-registrations/{id}/approve")
    suspend fun approve(
        @Path("id") id: String,
        @Body request: ApproveRequest
    ): Response<Unit>

    /**
     * Lehnt einen Mitgliedschaftsantrag ab.
     *
     * Sendet einen POST-Request an "member-registrations/{id}/reject", um den
     * Antrag abzulehnen. Der RejectRequest im Body kann einen Ablehnungsgrund
     * enthalten, der dem Antragsteller mitgeteilt werden kann.
     *
     * @param id Die eindeutige ID des abzulehnenden Antrags.
     *           Wird durch @Path in die URL eingesetzt.
     * @param request Das RejectRequest-Objekt mit dem Ablehnungsgrund.
     *                Wird durch @Body als JSON im Body gesendet.
     * @return Response<Unit> - Kein Response-Body erwartet. Der HTTP-Statuscode
     *         zeigt den Erfolg oder Misserfolg an.
     */
    @POST("member-registrations/{id}/reject")
    suspend fun reject(
        @Path("id") id: String,
        @Body request: RejectRequest
    ): Response<Unit>
}
