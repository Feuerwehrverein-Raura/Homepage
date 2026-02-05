package ch.fwvraura.vorstand

import android.app.Application
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import ch.fwvraura.vorstand.data.api.ApiModule
import ch.fwvraura.vorstand.util.AuditNotificationWorker
import ch.fwvraura.vorstand.util.NotificationHelper
import ch.fwvraura.vorstand.util.TokenManager
import java.util.concurrent.TimeUnit

/**
 * Application-Klasse — wird einmal beim App-Start initialisiert, BEVOR irgendeine Activity startet.
 * Registriert im AndroidManifest.xml unter android:name=".VorstandApp".
 *
 * Aufgaben:
 * 1. TokenManager initialisieren (verschluesselte SharedPreferences fuer JWT-Token)
 * 2. API-Modul initialisieren (Retrofit HTTP-Client mit Auth-Interceptor)
 * 3. Notification-Kanal erstellen (Pflicht ab Android 8)
 * 4. WorkManager-Job registrieren (alle 15 Min Audit-Log pruefen)
 */
class VorstandApp : Application() {

    // TokenManager wird spaeter initialisiert (lateinit), aber nur innerhalb dieser Klasse (private set)
    // Andere Klassen koennen ihn lesen: VorstandApp.instance.tokenManager
    lateinit var tokenManager: TokenManager
        private set

    /**
     * Wird einmal beim App-Start aufgerufen — noch vor der ersten Activity.
     */
    override fun onCreate() {
        super.onCreate()

        // Singleton-Instanz setzen, damit andere Klassen darauf zugreifen koennen
        // z.B. VorstandApp.instance.tokenManager im AuditNotificationWorker
        instance = this

        // TokenManager erstellen — liest/schreibt JWT-Token in verschluesselte SharedPreferences
        tokenManager = TokenManager(this)

        // Retrofit API-Client initialisieren — setzt den Auth-Interceptor, der bei jedem
        // API-Aufruf automatisch den Bearer-Token aus dem TokenManager in den Header setzt
        ApiModule.init(tokenManager)

        // Android Notification-Kanal erstellen — muss einmal vor dem Senden von Notifications passieren
        // Der Kanal erscheint in den System-Einstellungen unter "Vorstand Benachrichtigungen"
        NotificationHelper.createChannel(this)

        // WorkManager-Job registrieren fuer periodisches Audit-Polling
        scheduleAuditWorker()
    }

    /**
     * Registriert einen periodischen WorkManager-Job, der alle 15 Minuten den Audit-Log prueft.
     *
     * WorkManager Vorteile gegenueber einem einfachen Timer:
     * - Ueberlebt App-Neustart und Geraete-Reboot
     * - Beachtet Doze-Mode und Battery-Optimierungen
     * - Fuehrt Job nur aus wenn Netzwerk verfuegbar (Constraint)
     * - Minimum-Intervall ist 15 Minuten (Android-Beschraenkung)
     */
    private fun scheduleAuditWorker() {
        // Bedingungen festlegen: Job nur ausfuehren wenn Netzwerk verbunden
        // Ohne Netzwerk wuerde der API-Aufruf sowieso fehlschlagen
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        // Periodischen Work-Request erstellen: AuditNotificationWorker alle 15 Minuten
        // Das ist das Android-Minimum — kuerzere Intervalle sind nicht moeglich
        val request = PeriodicWorkRequestBuilder<AuditNotificationWorker>(15, TimeUnit.MINUTES)
            .setConstraints(constraints) // Nur mit Netzwerk ausfuehren
            .build()

        // Job beim WorkManager registrieren mit eindeutigem Namen "audit_check"
        // ExistingPeriodicWorkPolicy.KEEP = Wenn schon ein Job mit dem Namen laeuft,
        // den bestehenden behalten (nicht ersetzen). So wird bei jedem App-Start
        // kein neuer Job erstellt, sondern der alte weiterverwendet.
        WorkManager.getInstance(this)
            .enqueueUniquePeriodicWork("audit_check", ExistingPeriodicWorkPolicy.KEEP, request)
    }

    companion object {
        // Globale Singleton-Instanz — erlaubt Zugriff von ueberall via VorstandApp.instance
        // lateinit weil sie erst in onCreate() gesetzt wird
        lateinit var instance: VorstandApp
            private set
    }
}
