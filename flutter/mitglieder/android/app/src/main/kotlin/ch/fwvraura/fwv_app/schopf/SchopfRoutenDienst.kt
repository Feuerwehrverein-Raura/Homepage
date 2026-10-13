package ch.fwvraura.fwv_app.schopf

// Der Rote Schopf als Ausgabegeraet ("Roter Schopf" auf dem Knopf des
// Mini-Players oben, statt "Dieses Telefon") - wie ein Lautsprecher in der
// Geraeteauswahl.
//
// Wie Android das zuordnet (AOSP, MediaRouter2Manager.areSessionsMatched):
// Die Media-Session des Schopf-Players spielt "entfernt" mit der
// Lautstaerke-Kennung SITZUNG; dieser Dienst meldet eine Routing-Sitzung mit
// derselben Kennung. Beide aus derselben App -> die Systemoberflaeche zeigt
// den Namen dieser Sitzung.
//
// Grenze: Android bindet den Dienst nur, wenn er schon eine Sitzung hat oder
// jemand im Vordergrund nach Geraeten sucht (im Hintergrund suchen darf nur
// eine App mit MEDIA_ROUTING_CONTROL). Deshalb sucht die App kurz, wenn sie
// waehrend der Schicht geoeffnet wird (MainActivity.onResume). Danach haelt
// Android den Dienst, solange die Sitzung besteht. Ohne Kopplung zeigt der
// Player oben trotzdem alles - nur mit "Dieses Telefon".

import android.content.Context
import android.media.MediaRoute2Info
import android.media.MediaRoute2ProviderService
import android.media.MediaRouter2
import android.media.RouteDiscoveryPreference
import android.media.RoutingSessionInfo
import android.os.Build
import android.os.Bundle
import androidx.annotation.RequiresApi

@RequiresApi(Build.VERSION_CODES.R)
class SchopfRoutenDienst : MediaRoute2ProviderService() {

    companion object {
        const val ROUTE = "roter-schopf"
        const val SITZUNG = "roter-schopf-sitzung"
        const val MERKMAL = "ch.fwvraura.fwv_app.ROTER_SCHOPF"

        @Volatile
        var laufend: SchopfRoutenDienst? = null
            private set

        /** Gerade mit dem Roten Schopf gekoppelt? */
        fun gekoppelt(): Boolean = laufend?.getSessionInfo(SITZUNG) != null

        private var suche: MediaRouter2.RouteCallback? = null

        /** Kurz nach Geraeten suchen, damit Android den Dienst bindet (nur im Vordergrund). */
        fun suchen(c: Context) {
            if (suche != null) return
            val cb = object : MediaRouter2.RouteCallback() {}
            MediaRouter2.getInstance(c).registerRouteCallback(
                c.mainExecutor, cb,
                RouteDiscoveryPreference.Builder(listOf(MERKMAL), false).build()
            )
            suche = cb
        }

        fun sucheBeenden(c: Context) {
            suche?.let { MediaRouter2.getInstance(c).unregisterRouteCallback(it) }
            suche = null
        }
    }

    private val route: MediaRoute2Info
        get() = MediaRoute2Info.Builder(ROUTE, "Roter Schopf")
            .addFeature(MERKMAL)
            .addFeature(MediaRoute2Info.FEATURE_REMOTE_PLAYBACK)
            .setDescription("Laptop im Vereinslokal")
            .setVolumeHandling(MediaRoute2Info.PLAYBACK_VOLUME_FIXED)
            .setConnectionState(MediaRoute2Info.CONNECTION_STATE_CONNECTED)
            .build()

    override fun onCreate() {
        super.onCreate()
        laufend = this
        SchopfDiagnose.melden(applicationContext, "dienst-gestartet")
        notifyRoutes(listOf(route))
        // Schicht laeuft schon: gleich koppeln und den Player oben umstellen.
        if (SchopfPlayer.aktiv(this)) {
            sitzungStarten()
            SchopfPlayer.neuZeichnen(applicationContext)
        }
    }

    override fun onDestroy() {
        SchopfDiagnose.melden(applicationContext, "dienst-beendet")
        if (laufend === this) laufend = null
        super.onDestroy()
    }

    fun sitzungStarten() {
        if (getSessionInfo(SITZUNG) != null) return
        SchopfDiagnose.melden(applicationContext, "sitzung-gemeldet", gekoppelt = true)
        notifySessionCreated(
            REQUEST_ID_NONE,
            RoutingSessionInfo.Builder(SITZUNG, packageName)
                .addSelectedRoute(ROUTE)
                .setName("Roter Schopf")
                .setVolumeHandling(MediaRoute2Info.PLAYBACK_VOLUME_FIXED)
                .build()
        )
    }

    fun sitzungBeenden() {
        if (getSessionInfo(SITZUNG) != null) {
            SchopfDiagnose.melden(applicationContext, "sitzung-beendet")
            notifySessionReleased(SITZUNG)
        }
    }

    override fun onDiscoveryPreferenceChanged(preference: RouteDiscoveryPreference) {
        notifyRoutes(listOf(route))
    }

    // Die Schopf-Musik kommt nie aufs Handy; "Roter Schopf" in der
    // Geraeteauswahl zu waehlen, aendert nichts an der eigenen Wiedergabe.
    override fun onCreateSession(requestId: Long, packageName: String, routeId: String, sessionHints: Bundle?) {
        SchopfDiagnose.melden(applicationContext, "geraet-gewaehlt", info = "von=$packageName")
        notifyRequestFailed(requestId, REASON_ROUTE_NOT_AVAILABLE)
    }

    override fun onReleaseSession(requestId: Long, sessionId: String) {
        // Das System (oder die Geraeteauswahl) hat die Kopplung getrennt.
        SchopfDiagnose.melden(applicationContext, "sitzung-vom-system-beendet")
        notifySessionReleased(sessionId)
    }

    override fun onSetRouteVolume(requestId: Long, routeId: String, volume: Int) =
        notifyRequestFailed(requestId, REASON_INVALID_COMMAND)

    override fun onSetSessionVolume(requestId: Long, sessionId: String, volume: Int) =
        notifyRequestFailed(requestId, REASON_INVALID_COMMAND)

    override fun onSelectRoute(requestId: Long, sessionId: String, routeId: String) =
        notifyRequestFailed(requestId, REASON_INVALID_COMMAND)

    override fun onDeselectRoute(requestId: Long, sessionId: String, routeId: String) =
        notifyRequestFailed(requestId, REASON_INVALID_COMMAND)

    override fun onTransferToRoute(requestId: Long, sessionId: String, routeId: String) =
        notifyRequestFailed(requestId, REASON_INVALID_COMMAND)
}
