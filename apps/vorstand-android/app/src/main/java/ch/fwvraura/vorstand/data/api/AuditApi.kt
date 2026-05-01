package ch.fwvraura.vorstand.data.api

import ch.fwvraura.vorstand.data.model.AuditEntry
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Query

/**
 * Retrofit-Interface fuer den Audit-Log.
 *
 * Dieses Interface definiert den HTTP-Endpunkt zum Abrufen des Audit-Logs.
 * Der Audit-Log protokolliert alle wichtigen Aktionen im System (z.B. Mitglied erstellt,
 * Event geaendert, Login durchgefuehrt), sodass Vorstandsmitglieder nachvollziehen koennen,
 * wer wann welche Aenderungen vorgenommen hat.
 *
 * Verwendete Retrofit-Annotationen in diesem Interface:
 * - @GET: Sendet einen HTTP-GET-Request an den angegebenen Pfad (zum Abrufen von Daten).
 * - @Query: Fuegt einen Query-Parameter an die URL an (z.B. ?action=create&limit=50&since=2024-01-01).
 *   Wenn der Wert null ist, wird der Parameter weggelassen.
 * - suspend: Kotlin-Coroutine-Funktion - wird asynchron ausgefuehrt, ohne den
 *   Haupt-Thread zu blockieren.
 */
interface AuditApi {

    /**
     * Ruft den Audit-Log ab, optional gefiltert nach Aktion, Anzahl und Zeitraum.
     *
     * Sendet einen GET-Request an "audit" mit optionalen Query-Parametern.
     * Beispiel-URL: /audit?action=create&limit=50&since=2024-01-01T00:00:00Z
     *
     * @param action Optionaler Filter fuer die Art der Aktion (z.B. "create", "update", "delete").
     *               Wird durch @Query als URL-Parameter angehaengt. Wenn null, werden
     *               alle Aktionstypen zurueckgegeben.
     * @param limit Optionale Begrenzung der Anzahl zurueckgegebener Eintraege.
     *              Standardwert ist 100. Wird durch @Query als URL-Parameter angehaengt.
     * @param since Optionaler Zeitfilter - gibt nur Eintraege ab diesem Zeitpunkt zurueck.
     *              Erwartet ein Datum als String (z.B. ISO-8601-Format).
     *              Wird durch @Query als URL-Parameter angehaengt. Wenn null, wird
     *              kein zeitlicher Filter angewendet.
     * @return Response<List<AuditEntry>> - Enthaelt bei Erfolg eine Liste von
     *         AuditEntry-Objekten mit Details zu jeder protokollierten Aktion
     *         (Zeitstempel, Benutzer, Aktion, betroffene Ressource etc.).
     */
    @GET("audit")
    suspend fun getAuditLog(
        @Query("action") action: String? = null,
        @Query("limit") limit: Int? = 100,
        @Query("since") since: String? = null
    ): Response<List<AuditEntry>>
}
