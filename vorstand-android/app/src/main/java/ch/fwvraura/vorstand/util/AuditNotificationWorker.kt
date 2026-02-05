package ch.fwvraura.vorstand.util

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.VorstandApp
import ch.fwvraura.vorstand.data.api.ApiModule

/**
 * WorkManager-Worker, der alle 15 Minuten im Hintergrund laeuft.
 * Prueft ob es neue Audit-Eintraege gibt und zeigt ggf. eine Notification.
 *
 * Ablauf:
 * 1. Pruefen ob User eingeloggt ist (Token vorhanden)
 * 2. Letzten Check-Zeitstempel aus TokenManager lesen
 * 3. API aufrufen: GET /audit?since=<zeitstempel>&limit=20
 * 4. Nur relevante Aktionen filtern (Mitglieder-Aenderungen)
 * 5. Wenn neue relevante Eintraege: Notification anzeigen
 * 6. Zeitstempel des neuesten Eintrags speichern fuer naechsten Check
 *
 * CoroutineWorker erlaubt "suspend" Funktionen (= asynchrone API-Aufrufe)
 * im Gegensatz zum normalen Worker, der nur synchronen Code erlaubt.
 */
class AuditNotificationWorker(
    context: Context,       // Android-Kontext (fuer Zugriff auf Ressourcen, Dateien etc.)
    params: WorkerParameters // WorkManager-Parameter (z.B. Input-Daten, Run-Attempt-Count)
) : CoroutineWorker(context, params) {

    // Nur diese Audit-Aktionen loesen eine Notification aus.
    // Andere Aktionen wie AUDIT_VIEW oder LOGIN werden ignoriert,
    // da sie fuer den Vorstand nicht relevant sind.
    private val relevantActions = setOf(
        "MEMBER_CREATE",            // Neues Mitglied wurde erstellt
        "MEMBER_DELETE",            // Mitglied wurde geloescht (direkt in DB)
        "MEMBER_DELETE_REQUESTED",  // Loeschantrag wurde gestellt (4-Augen-Prinzip)
        "MEMBER_UPDATE",            // Mitgliederdaten wurden geaendert
        "MEMBER_REGISTRATION"       // Neuer Mitgliedschaftsantrag eingegangen
    )

    /**
     * Hauptmethode — wird von WorkManager alle 15 Minuten aufgerufen.
     *
     * Rueckgabewerte:
     * - Result.success() = Arbeit erledigt, naechster Lauf in 15 Min
     * - Result.retry()   = Fehler aufgetreten, WorkManager versucht es spaeter nochmal
     * - Result.failure()  = Dauerhafter Fehler (nutzen wir nicht, da retry besser ist)
     */
    override suspend fun doWork(): Result {
        // TokenManager aus der Application-Instanz holen (Singleton)
        val tokenManager = VorstandApp.instance.tokenManager

        // Wenn nicht eingeloggt, nichts tun — success() damit Worker nicht nochmal versucht
        if (!tokenManager.isLoggedIn) return Result.success()

        // Zeitstempel des letzten Checks lesen (z.B. "2026-02-05T14:30:00.000Z")
        // Beim allerersten Aufruf ist since=null → API gibt die neuesten 20 Eintraege zurueck
        val since = tokenManager.lastAuditCheck

        return try {
            // API-Aufruf: GET /audit?since=2026-02-05T14:30:00&limit=20
            // Gibt nur Eintraege zurueck, die NACH dem Zeitstempel erstellt wurden
            val response = ApiModule.auditApi.getAuditLog(since = since, limit = 20)

            // Bei HTTP-Fehler (401, 500 etc.) spaeter nochmal versuchen
            if (!response.isSuccessful) return Result.retry()

            // Response-Body parsen — Liste von AuditEntry-Objekten
            val entries = response.body() ?: emptyList()

            // Nur die relevanten Aktionen herausfiltern (Mitglieder-Aenderungen)
            val relevant = entries.filter { it.action in relevantActions }

            if (relevant.isNotEmpty()) {
                // Es gibt neue relevante Eintraege → Notification anzeigen

                // Zeitstempel des neuesten Eintrags speichern (entries sind nach created_at DESC sortiert)
                // Beim naechsten Check werden dann nur noch neuere Eintraege abgefragt
                entries.firstOrNull()?.createdAt?.let {
                    tokenManager.lastAuditCheck = it
                }

                val ctx = applicationContext
                // Notification-Titel: "Neue Aktivitaet"
                val title = ctx.getString(R.string.notification_audit_title)

                // Notification-Text: Bei einem Eintrag den konkreten Text zeigen,
                // bei mehreren nur die Anzahl (z.B. "3 neue Aenderungen")
                val text = if (relevant.size == 1) {
                    formatSingleEntry(ctx, relevant.first())
                } else {
                    ctx.getString(R.string.notification_multiple, relevant.size)
                }

                // Notification anzeigen (ersetzt vorherige, da gleiche ID)
                NotificationHelper.showAuditNotification(ctx, title, text)
            } else if (entries.isNotEmpty()) {
                // Es gibt neue Eintraege, aber keine relevanten (z.B. nur LOGIN-Eintraege)
                // Trotzdem Zeitstempel aktualisieren, damit wir diese beim naechsten Mal ueberspringen
                entries.firstOrNull()?.createdAt?.let {
                    tokenManager.lastAuditCheck = it
                }
            }
            // Beim allerersten Aufruf (since=null) werden die neuesten Eintraege geladen,
            // aber KEINE Notification gezeigt — erst beim naechsten Mal, wenn wirklich neue kommen

            Result.success()
        } catch (_: Exception) {
            // Netzwerkfehler, Timeout etc. → WorkManager versucht es spaeter nochmal
            // (mit exponentiellem Backoff: 30s, 60s, 120s, ...)
            Result.retry()
        }
    }

    /**
     * Formatiert einen einzelnen Audit-Eintrag als lesbaren Notification-Text.
     * Versucht den Namen des Mitglieds aus den new_values zu extrahieren.
     *
     * @Suppress("UNCHECKED_CAST") unterdrueckt die Compiler-Warnung beim Cast
     * von Map<*, *> zu Map<String, Any?> — ist sicher, da JSON immer String-Keys hat.
     */
    @Suppress("UNCHECKED_CAST")
    private fun formatSingleEntry(ctx: Context, entry: ch.fwvraura.vorstand.data.model.AuditEntry): String {
        // Versuchen, Vor- und Nachname aus den gespeicherten Werten zu extrahieren
        // new_values enthaelt das JSON-Objekt des Mitglieds (z.B. {"vorname": "Max", "nachname": "Muster"})
        val name = try {
            val values = entry.newValues
            // Gson deserialisiert JSON-Objekte als LinkedTreeMap (= Map<*, *>)
            if (values is Map<*, *>) {
                val map = values as Map<String, Any?>
                // vorname + nachname zusammenfuegen, null-Werte ignorieren
                listOfNotNull(map["vorname"], map["nachname"]).joinToString(" ")
            } else ""
        } catch (_: Exception) { "" } // Bei Fehler leeren String zurueckgeben

        // Je nach Aktion den passenden Text aus strings.xml laden
        return when (entry.action) {
            "MEMBER_CREATE" ->
                ctx.getString(R.string.notification_member_created, name.ifEmpty { "?" })
                // z.B. "Neues Mitglied: Max Muster"
            "MEMBER_DELETE", "MEMBER_DELETE_REQUESTED" ->
                ctx.getString(R.string.notification_member_deleted, name.ifEmpty { "?" })
                // z.B. "Mitglied geloescht: Max Muster"
            "MEMBER_UPDATE" ->
                ctx.getString(R.string.notification_member_updated, name.ifEmpty { "?" })
                // z.B. "Mitglied aktualisiert: Max Muster"
            "MEMBER_REGISTRATION" ->
                ctx.getString(R.string.notification_registration)
                // "Neuer Mitgliedschaftsantrag"
            else ->
                ctx.getString(R.string.notification_multiple, 1)
                // Fallback: "1 neue Aenderungen"
        }
    }
}
