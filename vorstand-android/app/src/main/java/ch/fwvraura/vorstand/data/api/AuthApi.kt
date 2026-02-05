package ch.fwvraura.vorstand.data.api

import ch.fwvraura.vorstand.data.model.LoginRequest
import ch.fwvraura.vorstand.data.model.LoginResponse
import ch.fwvraura.vorstand.data.model.UserInfo
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

/**
 * Retrofit-Interface fuer die Authentifizierungs-Endpunkte der Vorstand-App.
 *
 * Dieses Interface definiert die HTTP-Endpunkte, die fuer Login und Benutzerinformationen
 * verwendet werden. Retrofit generiert zur Laufzeit automatisch eine Implementierung
 * dieses Interfaces, die die HTTP-Aufrufe ausfuehrt.
 *
 * Verwendete Retrofit-Annotationen in diesem Interface:
 * - @POST: Sendet einen HTTP-POST-Request an den angegebenen Pfad (zum Erstellen/Senden von Daten).
 * - @GET: Sendet einen HTTP-GET-Request an den angegebenen Pfad (zum Abrufen von Daten).
 * - @Body: Markiert einen Parameter als HTTP-Request-Body. Das Objekt wird automatisch
 *   zu JSON serialisiert und im Request-Body mitgesendet.
 * - suspend: Kennzeichnet eine Kotlin-Coroutine-Funktion. Dadurch kann die Funktion
 *   asynchron ausgefuehrt werden, ohne den Haupt-Thread zu blockieren.
 *   Retrofit unterstuetzt suspend-Funktionen nativ.
 */
interface AuthApi {

    /**
     * Login-Endpunkt fuer Vorstandsmitglieder.
     *
     * Sendet einen POST-Request an "auth/vorstand/login" mit den Anmeldedaten
     * (E-Mail und Passwort) im Request-Body.
     *
     * @param request Das LoginRequest-Objekt mit den Anmeldedaten (wird durch @Body
     *                automatisch zu JSON serialisiert und im HTTP-Body gesendet).
     * @return Response<LoginResponse> - Enthaelt bei Erfolg ein LoginResponse-Objekt
     *         mit dem JWT-Token fuer die weitere Authentifizierung.
     *         Response ist ein Retrofit-Wrapper, der auch den HTTP-Statuscode enthaelt.
     */
    @POST("auth/vorstand/login")
    suspend fun login(@Body request: LoginRequest): Response<LoginResponse>

    /**
     * Endpunkt zum Abrufen der eigenen Benutzerinformationen.
     *
     * Sendet einen GET-Request an "auth/vorstand/me", um die Informationen des
     * aktuell eingeloggten Benutzers abzurufen. Der JWT-Token wird automatisch
     * durch den AuthInterceptor im Header mitgesendet.
     *
     * @return Response<UserInfo> - Enthaelt bei Erfolg ein UserInfo-Objekt
     *         mit den Details des eingeloggten Benutzers (z.B. Name, Rolle).
     */
    @GET("auth/vorstand/me")
    suspend fun getMe(): Response<UserInfo>
}
