package ch.fwvraura.members.sync

import android.accounts.Account
import android.accounts.AccountManager
import android.app.Service
import android.content.AbstractThreadedSyncAdapter
import android.content.ContentProviderOperation
import android.content.ContentResolver
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.SyncResult
import android.os.Bundle
import android.os.IBinder
import android.provider.ContactsContract
import android.util.Log
import ch.fwvraura.members.data.api.ApiModule
import ch.fwvraura.members.data.model.DirectoryEntry
import kotlinx.coroutines.runBlocking

/**
 * SyncAdapter — laedt das Mitglieder-Verzeichnis vom Backend und schreibt es ins
 * Android-Adressbuch unter dem Konto "FWV Raura".
 *
 * - Beim ersten Sync: alle aktiven Mitglieder werden als RawContacts angelegt.
 * - Spaetere Syncs: nur fehlende Mitglieder werden hinzugefuegt; bestehende werden
 *   mit den aktuellen Daten ueberschrieben (Telefon, E-Mail, Funktion).
 * - Wenn der User einen Kontakt manuell loescht, setzt Android RawContacts.DELETED=1.
 *   Diese Eintraege werden bei spaeteren Syncs nicht erneut angelegt.
 */
class ContactsSyncAdapter(context: Context, autoInitialize: Boolean) :
    AbstractThreadedSyncAdapter(context, autoInitialize) {

    override fun onPerformSync(
        account: Account,
        extras: Bundle,
        authority: String,
        provider: android.content.ContentProviderClient,
        syncResult: SyncResult
    ) {
        try {
            val entries: List<DirectoryEntry> = runBlocking {
                val resp = ApiModule.membersApi.getDirectory()
                if (!resp.isSuccessful) emptyList() else resp.body().orEmpty()
            }
            if (entries.isEmpty()) return

            // Welche FWV-RawContacts existieren bereits? (inkl. der vom User geloeschten)
            val existing = mutableMapOf<String, Long>() // sourceId (member-uuid) -> rawContactId
            val deleted = mutableSetOf<String>()
            context.contentResolver.query(
                ContactsContract.RawContacts.CONTENT_URI.buildUpon()
                    .appendQueryParameter(ContactsContract.CALLER_IS_SYNCADAPTER, "true").build(),
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
                    val sourceId = c.getString(1)
                    val isDeleted = c.getInt(2) == 1
                    if (sourceId != null) {
                        if (isDeleted) deleted.add(sourceId) else existing[sourceId] = rawId
                    }
                }
            }

            val ops = ArrayList<ContentProviderOperation>()
            val serverIds = HashSet<String>()
            for (e in entries) {
                serverIds.add(e.id)
                if (deleted.contains(e.id)) continue          // User hat ihn geloescht — respektieren
                val existingId = existing[e.id]
                if (existingId != null) {
                    // Aktualisieren: erst alle Daten loeschen, dann neu anlegen
                    ops.add(ContentProviderOperation.newDelete(syncerUri(ContactsContract.Data.CONTENT_URI))
                        .withSelection("${ContactsContract.Data.RAW_CONTACT_ID}=?", arrayOf(existingId.toString()))
                        .build())
                    appendContactData(ops, existingId, e, account, isInsertOp = false)
                } else {
                    appendContactInsert(ops, e, account)
                }
            }

            // Mitglieder die nicht mehr im Verzeichnis sind: lokal entfernen (Hard-Delete)
            for ((sourceId, rawId) in existing) {
                if (!serverIds.contains(sourceId)) {
                    ops.add(ContentProviderOperation.newDelete(syncerUri(ContactsContract.RawContacts.CONTENT_URI))
                        .withSelection("${ContactsContract.RawContacts._ID}=?", arrayOf(rawId.toString()))
                        .build())
                }
            }

            if (ops.isNotEmpty()) {
                context.contentResolver.applyBatch(ContactsContract.AUTHORITY, ops)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Sync failed", e)
            syncResult.stats.numIoExceptions++
        }
    }

    private fun appendContactInsert(
        ops: ArrayList<ContentProviderOperation>, e: DirectoryEntry, account: Account
    ) {
        val rawIdx = ops.size
        ops.add(ContentProviderOperation.newInsert(syncerUri(ContactsContract.RawContacts.CONTENT_URI))
            .withValue(ContactsContract.RawContacts.ACCOUNT_TYPE, account.type)
            .withValue(ContactsContract.RawContacts.ACCOUNT_NAME, account.name)
            .withValue(ContactsContract.RawContacts.SOURCE_ID, e.id)
            .build())
        appendContactData(ops, null, e, account, isInsertOp = true, backRefIndex = rawIdx)
    }

    private fun appendContactData(
        ops: ArrayList<ContentProviderOperation>,
        rawContactId: Long?,
        e: DirectoryEntry,
        account: Account,
        isInsertOp: Boolean,
        backRefIndex: Int = -1
    ) {
        fun newDataOp(): ContentProviderOperation.Builder {
            val b = ContentProviderOperation.newInsert(syncerUri(ContactsContract.Data.CONTENT_URI))
            if (isInsertOp) b.withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, backRefIndex)
            else b.withValue(ContactsContract.Data.RAW_CONTACT_ID, rawContactId)
            return b
        }

        // Strukturierter Name
        ops.add(newDataOp()
            .withValue(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.StructuredName.CONTENT_ITEM_TYPE)
            .withValue(ContactsContract.CommonDataKinds.StructuredName.GIVEN_NAME, e.vorname)
            .withValue(ContactsContract.CommonDataKinds.StructuredName.FAMILY_NAME, e.nachname)
            .build())

        // Mobile
        if (!e.mobile.isNullOrBlank()) {
            ops.add(newDataOp()
                .withValue(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.Phone.CONTENT_ITEM_TYPE)
                .withValue(ContactsContract.CommonDataKinds.Phone.NUMBER, e.mobile)
                .withValue(ContactsContract.CommonDataKinds.Phone.TYPE, ContactsContract.CommonDataKinds.Phone.TYPE_MOBILE)
                .build())
        }
        // Festnetz
        if (!e.telefon.isNullOrBlank()) {
            ops.add(newDataOp()
                .withValue(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.Phone.CONTENT_ITEM_TYPE)
                .withValue(ContactsContract.CommonDataKinds.Phone.NUMBER, e.telefon)
                .withValue(ContactsContract.CommonDataKinds.Phone.TYPE, ContactsContract.CommonDataKinds.Phone.TYPE_HOME)
                .build())
        }
        // E-Mail
        if (!e.email.isNullOrBlank()) {
            ops.add(newDataOp()
                .withValue(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.Email.CONTENT_ITEM_TYPE)
                .withValue(ContactsContract.CommonDataKinds.Email.ADDRESS, e.email)
                .withValue(ContactsContract.CommonDataKinds.Email.TYPE, ContactsContract.CommonDataKinds.Email.TYPE_HOME)
                .build())
        }
        // Funktion (z.B. "Aktuar, Social Media") als Job-Titel + "Feuerwehrverein Raura" als Firma
        if (!e.funktion.isNullOrBlank()) {
            ops.add(newDataOp()
                .withValue(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.Organization.CONTENT_ITEM_TYPE)
                .withValue(ContactsContract.CommonDataKinds.Organization.COMPANY, "Feuerwehrverein Raura")
                .withValue(ContactsContract.CommonDataKinds.Organization.TITLE, e.funktion)
                .withValue(ContactsContract.CommonDataKinds.Organization.TYPE, ContactsContract.CommonDataKinds.Organization.TYPE_WORK)
                .build())
        } else {
            ops.add(newDataOp()
                .withValue(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.Organization.CONTENT_ITEM_TYPE)
                .withValue(ContactsContract.CommonDataKinds.Organization.COMPANY, "Feuerwehrverein Raura")
                .withValue(ContactsContract.CommonDataKinds.Organization.TYPE, ContactsContract.CommonDataKinds.Organization.TYPE_WORK)
                .build())
        }
    }

    private fun syncerUri(uri: android.net.Uri) = uri.buildUpon()
        .appendQueryParameter(ContactsContract.CALLER_IS_SYNCADAPTER, "true")
        .build()

    companion object {
        private const val TAG = "ContactsSyncAdapter"
    }
}

class ContactsSyncService : Service() {
    private var adapter: ContactsSyncAdapter? = null
    private val lock = Any()
    override fun onCreate() {
        synchronized(lock) {
            if (adapter == null) adapter = ContactsSyncAdapter(applicationContext, true)
        }
    }
    override fun onBind(intent: Intent?): IBinder? = adapter?.syncAdapterBinder
}
