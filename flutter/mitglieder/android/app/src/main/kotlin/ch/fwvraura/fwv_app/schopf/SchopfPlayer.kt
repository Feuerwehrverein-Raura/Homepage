package ch.fwvraura.fwv_app.schopf

// "Im Schopf laeuft ..." als Mini-Player OBEN in der Benachrichtigungsleiste
// (Medien-Bereich, wie bei einem Android-TV im gleichen WLAN).
//
// Oben steht nur, was eine eigene Media-Session hat. flutter_local_notifications
// kann das nicht - deshalb nativ: api-members (src/schopf-melder.js) schickt
// waehrend der Schicht stille Push-Nachrichten (notificationType
// "schopf_musik"); SchopfPushEmpfaenger nimmt sie direkt ab, ohne Flutter,
// auch bei geschlossener App.
//
// Eine zweite Session neben der eigenen Wiedergabe (audio_service): Android
// zeigt beide oben nebeneinander.
//
// Knoepfe (Benachrichtigung und Medien-Bereich) schicken die Freigabe aus der
// Nachricht an POST kiosk/t400/musik-push/<aktion> - ohne Anmelde-Token, damit
// die Sitzung der App unberuehrt bleibt.

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.media.VolumeProviderCompat
import androidx.media.app.NotificationCompat.MediaStyle
import ch.fwvraura.fwv_app.MainActivity
import ch.fwvraura.fwv_app.R
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import kotlin.concurrent.thread

object SchopfPlayer {
    private const val KANAL = "schopf_player"
    private const val NUMMER = 4243
    private const val API = "https://api.fwv-raura.ch/"
    private const val SPEICHER = "schopf_player"

    private var session: MediaSessionCompat? = null

    /** Daten einer Push-Nachricht (art, titel, interpret, laeuft, bis, t). */
    @Synchronized
    fun aktualisieren(c: Context, d: Map<String, String?>) {
        if (d["art"] != "zeigen") {
            weg(c)
            return
        }
        val titel = d["titel"].orEmpty()
        val interpret = d["interpret"].orEmpty()
        val laeuft = d["laeuft"] == "1"
        val bis = d["bis"]?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }
        // Fuer die Knoepfe merken (laufen in eigenen Aufrufen).
        c.getSharedPreferences(SPEICHER, Context.MODE_PRIVATE).edit()
            .putString("t", d["t"]).putString("bis", d["bis"])
            .putString("titel", titel).putString("interpret", interpret)
            .putBoolean("laeuft", laeuft).apply()

        val s = session ?: MediaSessionCompat(c, "SchopfMusik").also {
            it.setCallback(Rueckruf(c.applicationContext))
            session = it
        }
        // Immer "entfernt" - nie "Dieses Telefon" (Entscheid Stefan). Oben
        // erscheint der Player nur mit Kopplung an SchopfRoutenDienst; ohne
        // passende Routing-Sitzung blendet Android eine entfernte Session aus.
        // Dann steht unten eine normale Benachrichtigung (siehe gekoppelt).
        val dienst = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) SchopfRoutenDienst.laufend else null
        dienst?.sitzungStarten()
        val gekoppelt = dienst != null
        // Kommt die Nachricht, waehrend die App offen ist: gleich koppeln
        // (Suchen geht nur im Vordergrund). Der Dienst zeichnet danach neu.
        if (!gekoppelt && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && MainActivity.sichtbar) {
            Handler(Looper.getMainLooper()).post {
                try {
                    SchopfRoutenDienst.suchen(c.applicationContext)
                    SchopfDiagnose.melden(c, "suche-gestartet")
                } catch (e: Exception) {
                    SchopfDiagnose.melden(c, "fehler-suche", fehler = e)
                }
            }
        }
        // Feste Lautstaerke: Die Tasten des Handys sollen nicht aus Versehen
        // den Raum lauter drehen.
        s.setPlaybackToRemote(
            object : VolumeProviderCompat(VOLUME_CONTROL_FIXED, 100, 100, SchopfRoutenDienst.SITZUNG) {}
        )
        s.setMetadata(
            MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, titel)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, interpret)
                .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, "Im Roten Schopf")
                .build()
        )
        s.setPlaybackState(
            PlaybackStateCompat.Builder()
                .setActions(
                    PlaybackStateCompat.ACTION_PLAY or PlaybackStateCompat.ACTION_PAUSE or
                        PlaybackStateCompat.ACTION_PLAY_PAUSE or PlaybackStateCompat.ACTION_SKIP_TO_NEXT
                )
                .setState(
                    if (laeuft) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED,
                    PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1f
                )
                .build()
        )
        s.isActive = true

        kanalAnlegen(c)
        val oeffnen = PendingIntent.getActivity(
            c, 0, Intent(c, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val n = NotificationCompat.Builder(c, KANAL)
            .setSmallIcon(R.drawable.ic_benachrichtigung)
            .setContentTitle(titel)
            .setContentText(if (interpret.isEmpty()) "Im Roten Schopf" else interpret)
            .setSubText(
                when {
                    !gekoppelt -> "Antippen, um den Player oben zu zeigen"
                    laeuft -> "Läuft im Schopf"
                    else -> "Pausiert im Schopf"
                }
            )
            .setContentIntent(oeffnen)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setShowWhen(false)
            .addAction(
                if (laeuft) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
                if (laeuft) "Pause" else "Abspielen",
                knopf(c, "umschalten")
            )
            .addAction(android.R.drawable.ic_media_next, "Weiter", knopf(c, "weiter"))
        // Medien-Stil nur gekoppelt: Ohne Kopplung wuerde Android die
        // Benachrichtigung samt Session ganz verstecken.
        // Und nur, solange es laeuft: Einen pausierten Player blendet SystemUI
        // nach etwa 10 min aus (MediaTimeoutListener; ohne "Fortsetzen", das
        // auf Samsung aus ist). Die Benachrichtigung bleibt dann trotzdem aus
        // der normalen Liste gefiltert und ist nirgends mehr zu sehen
        // (gemessen am A37, 13.10.2026). Pausiert also normal unten.
        val medienStil = gekoppelt && laeuft
        if (medienStil) {
            n.setStyle(MediaStyle().setMediaSession(s.sessionToken).setShowActionsInCompactView(0, 1))
        }
        // Nach Schichtende von selbst weg, auch wenn "weg" nie ankommt.
        bis?.let { n.setTimeoutAfter((it - System.currentTimeMillis()).coerceAtLeast(1000)) }

        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            SchopfDiagnose.melden(c, "keine-erlaubnis", gekoppelt)
            return
        }
        NotificationManagerCompat.from(c).notify(NUMMER, n.build())
        // Hat das System sie wirklich? (Samsung blendet z.B. manches aus)
        val sichtbarImSystem = c.getSystemService(NotificationManager::class.java)
            .activeNotifications.any { it.id == NUMMER }
        SchopfDiagnose.melden(
            c, if (sichtbarImSystem) "angezeigt" else "nicht-im-system", gekoppelt,
            stil = if (medienStil) "medien" else "normal"
        )
    }

    @Synchronized
    fun weg(c: Context) {
        SchopfDiagnose.melden(c, "weg")
        c.getSharedPreferences(SPEICHER, Context.MODE_PRIVATE).edit().clear().apply()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) SchopfRoutenDienst.laufend?.sitzungBeenden()
        NotificationManagerCompat.from(c).cancel(NUMMER)
        session?.run { isActive = false; release() }
        session = null
    }

    /** Laeuft gerade eine Schicht mit Schopf-Player (Freigabe noch gueltig)? */
    fun aktiv(c: Context): Boolean {
        val p = c.getSharedPreferences(SPEICHER, Context.MODE_PRIVATE)
        val bis = p.getString("bis", null)?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }
        return p.getString("t", null) != null && bis != null && bis > System.currentTimeMillis()
    }

    /** Mit dem zuletzt bekannten Stand neu zeichnen (z.B. nach dem Koppeln). */
    fun neuZeichnen(c: Context) {
        if (!aktiv(c)) return
        val p = c.getSharedPreferences(SPEICHER, Context.MODE_PRIVATE)
        aktualisieren(
            c, mapOf(
                "art" to "zeigen",
                "titel" to p.getString("titel", ""),
                "interpret" to p.getString("interpret", ""),
                "laeuft" to if (p.getBoolean("laeuft", false)) "1" else "0",
                "bis" to p.getString("bis", null),
                "t" to p.getString("t", null)
            )
        )
    }

    private fun kanalAnlegen(c: Context) {
        val nm = c.getSystemService(NotificationManager::class.java)
        // Kanal der Flutter-Fassung (1.0.10) aufraeumen.
        nm.deleteNotificationChannel("schopf_musik")
        if (nm.getNotificationChannel(KANAL) != null) return
        nm.createNotificationChannel(
            NotificationChannel(KANAL, "Musik im Schopf", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Was während deiner Schicht im Roten Schopf läuft"
                setShowBadge(false)
            }
        )
    }

    private fun knopf(c: Context, aktion: String): PendingIntent = PendingIntent.getBroadcast(
        c, aktion.hashCode(),
        Intent(c, SchopfKnopfEmpfaenger::class.java).setAction(aktion),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )

    /** Befehl an den Laptop im Schopf; danach gleich den neuen Stand zeigen. */
    fun befehl(c: Context, aktion: String, fertig: (() -> Unit)? = null) {
        val p = c.getSharedPreferences(SPEICHER, Context.MODE_PRIVATE)
        val t = p.getString("t", null)
        if (t == null) {
            fertig?.invoke()
            return
        }
        thread {
            try {
                val v = URL("${API}kiosk/t400/musik-push/$aktion").openConnection() as HttpURLConnection
                v.requestMethod = "POST"
                v.connectTimeout = 8000
                v.readTimeout = 8000
                v.doOutput = true
                v.setRequestProperty("Content-Type", "application/json")
                v.outputStream.use { it.write(JSONObject().put("t", t).toString().toByteArray()) }
                if (v.responseCode == 200) {
                    val m = JSONObject(v.inputStream.bufferedReader().readText()).optJSONObject("musik")
                    if (m != null && m.optBoolean("erreichbar")) {
                        aktualisieren(
                            c, mapOf(
                                "art" to "zeigen",
                                "titel" to m.optString("titel", p.getString("titel", "")),
                                "interpret" to m.optString("interpret", p.getString("interpret", "")),
                                "laeuft" to if (m.optBoolean("laeuft")) "1" else "0",
                                "bis" to p.getString("bis", null),
                                "t" to t
                            )
                        )
                    }
                } else {
                    Log.w("SchopfPlayer", "$aktion: HTTP ${v.responseCode}")
                }
                v.disconnect()
            } catch (e: Exception) {
                Log.w("SchopfPlayer", "$aktion: ${e.message}")
            } finally {
                fertig?.invoke()
            }
        }
    }

    /** Knoepfe im Medien-Bereich oben (Session). */
    private class Rueckruf(private val c: Context) : MediaSessionCompat.Callback() {
        override fun onPlay() = befehl(c, "umschalten")
        override fun onPause() = befehl(c, "umschalten")
        override fun onSkipToNext() = befehl(c, "weiter")
    }
}

/** Knoepfe in der Benachrichtigung selbst. */
class SchopfKnopfEmpfaenger : BroadcastReceiver() {
    override fun onReceive(c: Context, i: Intent) {
        val aktion = i.action ?: return
        val ergebnis = goAsync()
        SchopfPlayer.befehl(c.applicationContext, aktion) { ergebnis.finish() }
    }
}

/**
 * Stille Push-Nachrichten direkt abnehmen - neben dem Empfaenger von
 * firebase_messaging (beide bekommen jede Nachricht). Alles andere bleibt
 * Sache von Flutter.
 */
class SchopfPushEmpfaenger : BroadcastReceiver() {
    override fun onReceive(c: Context, i: Intent) {
        val extras = i.extras ?: return
        if (extras.getString("notificationType") != "schopf_musik") return
        val d = listOf("art", "titel", "interpret", "laeuft", "bis", "t")
            .associateWith { extras.getString(it) }
        SchopfDiagnose.melden(c.applicationContext, "empfangen:${d["art"]}", t = d["t"])
        try {
            SchopfPlayer.aktualisieren(c.applicationContext, d)
        } catch (e: Exception) {
            SchopfDiagnose.melden(c.applicationContext, "fehler-aktualisieren", fehler = e, t = d["t"])
        }
    }
}
