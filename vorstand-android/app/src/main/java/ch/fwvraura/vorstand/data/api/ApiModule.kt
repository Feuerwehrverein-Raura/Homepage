package ch.fwvraura.vorstand.data.api

import ch.fwvraura.vorstand.util.TokenManager
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

/**
 * ApiModule — Singleton-Objekt, das die gesamte Netzwerk-Konfiguration verwaltet.
 *
 * Dieses Objekt konfiguriert Retrofit und OkHttp fuer die Kommunikation mit der
 * Backend-API der Feuerwehrverein-Raura-App. Es stellt alle API-Interfaces als
 * Lazy-Properties bereit, sodass sie erst beim ersten Zugriff erstellt werden.
 *
 * Wichtig: init() muss aufgerufen werden, bevor auf die API-Properties zugegriffen wird.
 */
object ApiModule {

    /**
     * Basis-URL der Backend-API.
     * Alle API-Endpoints werden relativ zu dieser URL aufgeloest.
     */
    private const val BASE_URL = "https://api.fwv-raura.ch/"

    /**
     * Retrofit-Instanz — wird in init() erstellt und von allen API-Properties gemeinsam genutzt.
     * Ist null, solange init() noch nicht aufgerufen wurde.
     */
    private var retrofit: Retrofit? = null

    /**
     * TokenManager-Referenz — verwaltet JWT-Tokens fuer die Authentifizierung.
     * Wird in init() gesetzt und vom AuthInterceptor verwendet.
     */
    private var tokenManager: TokenManager? = null

    /**
     * Initialisiert das ApiModule mit dem gegebenen TokenManager.
     *
     * Diese Methode erstellt:
     * 1. Einen HttpLoggingInterceptor, der den gesamten HTTP-Body loggt (fuer Debugging).
     * 2. Einen OkHttpClient mit:
     *    - AuthInterceptor: Fuegt automatisch den JWT-Token als Authorization-Header
     *      an jede ausgehende Anfrage an.
     *    - LoggingInterceptor: Loggt alle HTTP-Anfragen und -Antworten (inklusive Body)
     *      fuer Debugging-Zwecke.
     *    - Timeouts: 30 Sekunden fuer Verbindungsaufbau, Lesen und Schreiben.
     * 3. Eine Retrofit-Instanz mit:
     *    - Der BASE_URL als Basis fuer alle Endpoints.
     *    - Dem konfigurierten OkHttpClient.
     *    - GsonConverterFactory fuer automatische JSON-Serialisierung/-Deserialisierung.
     *
     * @param tokenManager Der TokenManager, der JWT-Tokens bereitstellt und verwaltet.
     */
    fun init(tokenManager: TokenManager) {
        this.tokenManager = tokenManager

        // Logging-Interceptor erstellen: Loggt den gesamten HTTP-Body (Request + Response)
        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        }

        // OkHttpClient konfigurieren mit Interceptors und Timeouts
        val client = OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor(tokenManager))  // JWT-Token automatisch anfuegen
            .addInterceptor(logging)                         // HTTP-Logging fuer Debugging
            .connectTimeout(30, TimeUnit.SECONDS)            // Max. 30s fuer Verbindungsaufbau
            .readTimeout(30, TimeUnit.SECONDS)               // Max. 30s fuer Antwort-Lesen
            .writeTimeout(30, TimeUnit.SECONDS)              // Max. 30s fuer Daten-Senden
            .build()

        // Retrofit-Instanz erstellen mit Gson als JSON-Converter
        retrofit = Retrofit.Builder()
            .baseUrl(BASE_URL)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
    }

    /**
     * API-Interface fuer Authentifizierung (Login, Logout, Token-Refresh).
     * Wird lazy erstellt — erst beim ersten Zugriff wird das Retrofit-Interface generiert.
     */
    val authApi: AuthApi by lazy { retrofit!!.create(AuthApi::class.java) }

    /**
     * API-Interface fuer Mitglieder-Verwaltung (CRUD-Operationen auf Mitgliedern).
     * Wird lazy erstellt — erst beim ersten Zugriff wird das Retrofit-Interface generiert.
     */
    val membersApi: MembersApi by lazy { retrofit!!.create(MembersApi::class.java) }

    /**
     * API-Interface fuer Anlass-Verwaltung (Erstellen, Abrufen, Bearbeiten von Events).
     * Wird lazy erstellt — erst beim ersten Zugriff wird das Retrofit-Interface generiert.
     */
    val eventsApi: EventsApi by lazy { retrofit!!.create(EventsApi::class.java) }

    /**
     * API-Interface fuer Anmeldungen zu Anlaessen (Mitglieder-Registrierungen).
     * Wird lazy erstellt — erst beim ersten Zugriff wird das Retrofit-Interface generiert.
     */
    val registrationsApi: MemberRegistrationsApi by lazy { retrofit!!.create(MemberRegistrationsApi::class.java) }

    /**
     * API-Interface fuer das Audit-Log (Protokollierung von Aenderungen).
     * Wird lazy erstellt — erst beim ersten Zugriff wird das Retrofit-Interface generiert.
     */
    val auditApi: AuditApi by lazy { retrofit!!.create(AuditApi::class.java) }

    /**
     * API-Interface fuer Dispatch (Nachrichtenversand per E-Mail und Briefpost).
     * Wird lazy erstellt — erst beim ersten Zugriff wird das Retrofit-Interface generiert.
     */
    val dispatchApi: DispatchApi by lazy { retrofit!!.create(DispatchApi::class.java) }

    val mailcowApi: MailcowApi by lazy { retrofit!!.create(MailcowApi::class.java) }
}
