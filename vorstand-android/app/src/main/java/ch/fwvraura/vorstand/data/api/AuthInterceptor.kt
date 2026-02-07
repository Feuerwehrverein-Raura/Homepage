package ch.fwvraura.vorstand.data.api

import android.content.Intent
import ch.fwvraura.vorstand.VorstandApp
import ch.fwvraura.vorstand.util.TokenManager
import okhttp3.Interceptor
import okhttp3.Response

/**
 * OkHttp-Interceptor fuer die automatische JWT-Authentifizierung.
 *
 * Diese Klasse implementiert das OkHttp-Interceptor-Interface und wird bei jedem
 * HTTP-Request automatisch aufgerufen. Der Interceptor hat zwei Hauptaufgaben:
 *
 * 1. JWT-Token hinzufuegen: Bei jedem ausgehenden Request wird der gespeicherte
 *    JWT-Bearer-Token automatisch in den "Authorization"-Header eingefuegt,
 *    damit der Server den Benutzer authentifizieren kann.
 *
 * 2. 401/403-Fehlerbehandlung: Wenn der Server mit HTTP 401 (Unauthorized) oder
 *    403 (Forbidden) antwortet (z.B. weil der Token abgelaufen ist), wird der Token
 *    geloescht und die App automatisch zur Login-Seite weitergeleitet.
 *    Hinweis: Das Backend gibt 403 zurueck bei abgelaufenen Vorstand-JWTs
 *    (authenticateVorstand), daher muessen beide Status-Codes behandelt werden.
 *
 * @param tokenManager Der TokenManager, der den JWT-Token sicher speichert und bereitstellt.
 *                     Wird per Dependency Injection uebergeben.
 */
class AuthInterceptor(private val tokenManager: TokenManager) : Interceptor {

    /**
     * Faengt jeden HTTP-Request ab und fuegt den Authorization-Header hinzu.
     * Prueft anschliessend die Response auf 401/403-Fehler.
     *
     * Ablauf Schritt fuer Schritt:
     * 1. Originalen Request aus der Chain holen
     * 2. Token aus dem TokenManager lesen
     * 3. Falls Token vorhanden: Neuen Request mit "Authorization: Bearer <token>" Header erstellen
     *    Falls kein Token vorhanden: Originalen Request unveraendert verwenden
     * 4. Request ausfuehren und Response erhalten
     * 5. Falls Response-Code 401 (Unauthorized) oder 403 (Forbidden) UND der Request
     *    kein Login-Request war:
     *    - Token loeschen (da er ungueltig/abgelaufen ist)
     *    - App zur Login-Seite weiterleiten (durch Neustart der Haupt-Activity)
     * 6. Response zurueckgeben
     *
     * @param chain Die Interceptor-Chain von OkHttp. Enthaelt den originalen Request
     *              und ermoeglicht das Weiterleiten (proceed) an den naechsten Interceptor
     *              bzw. den eigentlichen Netzwerk-Aufruf.
     * @return Die HTTP-Response vom Server.
     */
    override fun intercept(chain: Interceptor.Chain): Response {
        // Schritt 1: Den originalen Request aus der Chain holen
        val original = chain.request()

        // Schritt 2: Den gespeicherten JWT-Token aus dem TokenManager auslesen
        val token = tokenManager.token

        // Schritt 3: Falls ein Token vorhanden ist, einen neuen Request mit dem
        // Authorization-Header erstellen. "Bearer" ist das Standard-Praefix fuer JWT-Tokens.
        // Falls kein Token vorhanden ist (null oder leer), wird der originale Request
        // ohne Aenderung verwendet.
        val request = if (!token.isNullOrEmpty()) {
            original.newBuilder()
                .header("Authorization", "Bearer $token")
                .build()
        } else {
            original
        }

        // Schritt 4: Den (ggf. modifizierten) Request ausfuehren und die Response erhalten.
        // chain.proceed() leitet den Request an den naechsten Interceptor oder an das
        // Netzwerk weiter und gibt die Server-Antwort zurueck.
        val response = chain.proceed(request)

        // Schritt 5: Pruefen, ob der Server mit 401 oder 403 geantwortet hat.
        // 401 = kein Token vorhanden, 403 = Token ungueltig/abgelaufen.
        // Das Backend (authenticateVorstand) gibt 403 bei abgelaufenen JWTs zurueck.
        // Die zusaetzliche Pruefung "!original.url.encodedPath.contains("login")" stellt
        // sicher, dass ein fehlgeschlagener Login-Versuch NICHT zur automatischen
        // Weiterleitung fuehrt - nur abgelaufene/ungueltige Tokens bei anderen Requests
        // loesen die Weiterleitung aus.
        if ((response.code == 401 || response.code == 403) && !original.url.encodedPath.contains("login")) {
            // Token loeschen, da er ungueltig oder abgelaufen ist
            tokenManager.clear()

            // Die Application-Instanz als Context verwenden, um die App neu zu starten
            val context = VorstandApp.instance

            // Die Launch-Activity der App ermitteln (normalerweise die LoginActivity)
            val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            if (intent != null) {
                // FLAG_ACTIVITY_NEW_TASK: Startet eine neue Task (noetig, da wir von
                //   ausserhalb einer Activity starten, naemlich aus einem Interceptor).
                // FLAG_ACTIVITY_CLEAR_TASK: Loescht alle bisherigen Activities vom Stack,
                //   damit der Benutzer nicht mit "Zurueck" zu einer geschuetzten Seite
                //   navigieren kann.
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                context.startActivity(intent)
            }
        }

        // Schritt 6: Die Response zurueckgeben (an Retrofit/den Aufrufer)
        return response
    }
}
