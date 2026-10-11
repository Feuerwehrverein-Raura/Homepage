package ch.fwvraura.fwv_app.kontakte

import android.accounts.Account
import android.app.Service
import android.content.AbstractThreadedSyncAdapter
import android.content.ContentProviderClient
import android.content.ContentProviderOperation
import android.content.Context
import android.content.Intent
import android.content.SyncResult
import android.os.Bundle
import android.os.IBinder
import android.provider.ContactsContract
import android.provider.ContactsContract.CommonDataKinds.Email
import android.provider.ContactsContract.CommonDataKinds.Organization
import android.provider.ContactsContract.CommonDataKinds.Phone
import android.provider.ContactsContract.CommonDataKinds.StructuredName
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** Eintrag aus GET /members/directory. */
data class VerzeichnisEintrag(
    val id: String,
    val vorname: String?,
    val nachname: String?,
    val email: String?,
    val mobile: String?,
    val telefon: String?,
    val funktion: String?,
)

/**
 * Laedt das Mitglieder-Verzeichnis und schreibt es ins Adressbuch unter dem
 * Konto "FWV Raura". Verhalten wie members-android sync/ContactsSyncAdapter.kt:
 *
 * - Fehlende Mitglieder werden angelegt, bestehende mit den aktuellen Daten
 *   ueberschrieben (Name, Telefon, E-Mail, Funktion/Firma).
 * - Vom Nutzer geloeschte Kontakte (RawContacts.DELETED=1) werden nicht neu
 *   angelegt ("wiederherstellen" raeumt diese Reste weg).
 * - Mitglieder, die nicht mehr im Verzeichnis stehen, werden entfernt.
 * - Ohne Token oder bei 401 (Token abgelaufen) passiert still nichts; der
 *   naechste App-Start erneuert den Token und teilt ihn mit.
 */
class KontakteSyncAdapter(context: Context, autoInitialize: Boolean) :
    AbstractThreadedSyncAdapter(context, autoInitialize) {

    override fun onPerformSync(
        account: Account,
        extras: Bundle,
        authority: String,
        provider: ContentProviderClient,
        syncResult: SyncResult
    ) {
        try {
            val token = TokenAblage.lesen(context)
            if (token == null) {
                Log.i(TAG, "Kein Token — Abgleich uebersprungen")
                return
            }
            val eintraege = verzeichnisLaden(token) ?: return
            if (eintraege.isEmpty()) return
            abgleichen(account, eintraege)
        } catch (e: IOException) {
            Log.w(TAG, "Abgleich fehlgeschlagen (Netz)", e)
            syncResult.stats.numIoExceptions++
        } catch (e: Exception) {
            Log.e(TAG, "Abgleich fehlgeschlagen", e)
            syncResult.stats.numIoExceptions++
        }
    }

    /** null: Server antwortet nicht mit 2xx (z. B. 401) — still auslassen. */
    private fun verzeichnisLaden(token: String): List<VerzeichnisEintrag>? {
        val verbindung = URL(VERZEICHNIS_URL).openConnection() as HttpURLConnection
        try {
            verbindung.connectTimeout = 15_000
            verbindung.readTimeout = 30_000
            verbindung.setRequestProperty("Authorization", "Bearer $token")
            verbindung.setRequestProperty("Accept", "application/json")
            val code = verbindung.responseCode
            if (code !in 200..299) {
                Log.i(TAG, "Verzeichnis: HTTP $code — Abgleich uebersprungen")
                return null
            }
            val text = verbindung.inputStream.bufferedReader().use { it.readText() }
            val liste = JSONArray(text)
            val ergebnis = ArrayList<VerzeichnisEintrag>(liste.length())
            for (i in 0 until liste.length()) {
                val o = liste.optJSONObject(i) ?: continue
                val id = o.text("id") ?: continue
                ergebnis.add(
                    VerzeichnisEintrag(
                        id = id,
                        vorname = o.text("vorname"),
                        nachname = o.text("nachname"),
                        email = o.text("email"),
                        mobile = o.text("mobile"),
                        telefon = o.text("telefon"),
                        funktion = o.text("funktion"),
                    )
                )
            }
            return ergebnis
        } finally {
            verbindung.disconnect()
        }
    }

    private fun JSONObject.text(name: String): String? =
        if (isNull(name)) null else optString(name).takeIf { it.isNotEmpty() }

    private fun abgleichen(account: Account, eintraege: List<VerzeichnisEintrag>) {
        // Vorhandene FWV-RawContacts (inkl. der vom Nutzer geloeschten)
        val vorhanden = mutableMapOf<String, Long>() // sourceId (Mitglieds-UUID) -> rawContactId
        val geloescht = mutableSetOf<String>()
        context.contentResolver.query(
            KontakteKonto.alsSyncAdapter(ContactsContract.RawContacts.CONTENT_URI),
            arrayOf(
                ContactsContract.RawContacts._ID,
                ContactsContract.RawContacts.SOURCE_ID,
                ContactsContract.RawContacts.DELETED
            ),
            "${ContactsContract.RawContacts.ACCOUNT_TYPE}=? AND ${ContactsContract.RawContacts.ACCOUNT_NAME}=?",
            arrayOf(account.type, account.name),
            null
        )?.use { c ->
            while (c.moveToNext()) {
                val rawId = c.getLong(0)
                val sourceId = c.getString(1) ?: continue
                if (c.getInt(2) == 1) geloescht.add(sourceId) else vorhanden[sourceId] = rawId
            }
        }

        val ops = ArrayList<ContentProviderOperation>()
        val serverIds = HashSet<String>()
        for (e in eintraege) {
            serverIds.add(e.id)
            if (geloescht.contains(e.id)) continue // Nutzer hat ihn geloescht — respektieren
            val rawId = vorhanden[e.id]
            if (rawId != null) {
                // Aktualisieren: alle Daten loeschen, dann neu anlegen
                ops.add(
                    ContentProviderOperation.newDelete(KontakteKonto.alsSyncAdapter(ContactsContract.Data.CONTENT_URI))
                        .withSelection("${ContactsContract.Data.RAW_CONTACT_ID}=?", arrayOf(rawId.toString()))
                        .build()
                )
                datenAnhaengen(ops, e, rawId, rueckverweis = -1)
            } else {
                val index = ops.size
                ops.add(
                    ContentProviderOperation.newInsert(KontakteKonto.alsSyncAdapter(ContactsContract.RawContacts.CONTENT_URI))
                        .withValue(ContactsContract.RawContacts.ACCOUNT_TYPE, account.type)
                        .withValue(ContactsContract.RawContacts.ACCOUNT_NAME, account.name)
                        .withValue(ContactsContract.RawContacts.SOURCE_ID, e.id)
                        .build()
                )
                datenAnhaengen(ops, e, rawId = null, rueckverweis = index)
            }
        }

        // Nicht mehr im Verzeichnis: lokal hart entfernen
        for ((sourceId, rawId) in vorhanden) {
            if (!serverIds.contains(sourceId)) {
                ops.add(
                    ContentProviderOperation.newDelete(KontakteKonto.alsSyncAdapter(ContactsContract.RawContacts.CONTENT_URI))
                        .withSelection("${ContactsContract.RawContacts._ID}=?", arrayOf(rawId.toString()))
                        .build()
                )
            }
        }

        if (ops.isNotEmpty()) {
            context.contentResolver.applyBatch(ContactsContract.AUTHORITY, ops)
        }
        Log.i(TAG, "Abgleich: ${eintraege.size} Mitglieder, ${geloescht.size} vom Nutzer geloescht")
    }

    private fun datenAnhaengen(
        ops: ArrayList<ContentProviderOperation>,
        e: VerzeichnisEintrag,
        rawId: Long?,
        rueckverweis: Int,
    ) {
        fun neu(): ContentProviderOperation.Builder {
            val b = ContentProviderOperation.newInsert(KontakteKonto.alsSyncAdapter(ContactsContract.Data.CONTENT_URI))
            if (rawId == null) b.withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, rueckverweis)
            else b.withValue(ContactsContract.Data.RAW_CONTACT_ID, rawId)
            return b
        }

        ops.add(
            neu()
                .withValue(ContactsContract.Data.MIMETYPE, StructuredName.CONTENT_ITEM_TYPE)
                .withValue(StructuredName.GIVEN_NAME, e.vorname)
                .withValue(StructuredName.FAMILY_NAME, e.nachname)
                .build()
        )
        if (!e.mobile.isNullOrBlank()) {
            ops.add(
                neu()
                    .withValue(ContactsContract.Data.MIMETYPE, Phone.CONTENT_ITEM_TYPE)
                    .withValue(Phone.NUMBER, e.mobile)
                    .withValue(Phone.TYPE, Phone.TYPE_MOBILE)
                    .build()
            )
        }
        if (!e.telefon.isNullOrBlank()) {
            ops.add(
                neu()
                    .withValue(ContactsContract.Data.MIMETYPE, Phone.CONTENT_ITEM_TYPE)
                    .withValue(Phone.NUMBER, e.telefon)
                    .withValue(Phone.TYPE, Phone.TYPE_HOME)
                    .build()
            )
        }
        if (!e.email.isNullOrBlank()) {
            ops.add(
                neu()
                    .withValue(ContactsContract.Data.MIMETYPE, Email.CONTENT_ITEM_TYPE)
                    .withValue(Email.ADDRESS, e.email)
                    .withValue(Email.TYPE, Email.TYPE_HOME)
                    .build()
            )
        }
        // Firma "Feuerwehrverein Raura", Funktion (z. B. "Aktuar") als Titel
        val organisation = neu()
            .withValue(ContactsContract.Data.MIMETYPE, Organization.CONTENT_ITEM_TYPE)
            .withValue(Organization.COMPANY, FIRMA)
            .withValue(Organization.TYPE, Organization.TYPE_WORK)
        if (!e.funktion.isNullOrBlank()) organisation.withValue(Organization.TITLE, e.funktion)
        ops.add(organisation.build())
    }

    companion object {
        private const val TAG = "KontakteSyncAdapter"
        private const val VERZEICHNIS_URL = "https://api.fwv-raura.ch/members/directory"
        private const val FIRMA = "Feuerwehrverein Raura"
    }
}

/** Bindet den SyncAdapter fuer Android (Manifest: android.content.SyncAdapter). */
class KontakteSyncService : Service() {
    override fun onCreate() {
        synchronized(sperre) {
            if (adapter == null) adapter = KontakteSyncAdapter(applicationContext, true)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = adapter?.syncAdapterBinder

    companion object {
        private val sperre = Any()
        private var adapter: KontakteSyncAdapter? = null
    }
}
