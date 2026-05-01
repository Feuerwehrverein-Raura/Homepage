package ch.fwvraura.members.sync

import android.accounts.Account
import android.accounts.AccountManager
import android.content.ContentResolver
import android.content.Context
import android.os.Bundle
import android.provider.ContactsContract

/**
 * Hilfsmethoden um den FWV-Adressbuch-Sync ein-/auszuschalten und manuell zu triggern.
 */
object ContactsSyncManager {
    const val ACCOUNT_TYPE = "com.fwv.members"
    const val ACCOUNT_NAME = "FWV Raura"
    private const val AUTHORITY = ContactsContract.AUTHORITY

    fun account() = Account(ACCOUNT_NAME, ACCOUNT_TYPE)

    /** Erstellt das Konto wenn noetig und aktiviert den Adressbuch-Sync. */
    fun enableSync(context: Context) {
        val am = AccountManager.get(context)
        val acc = account()
        val existing = am.getAccountsByType(ACCOUNT_TYPE)
        if (existing.isEmpty()) {
            am.addAccountExplicitly(acc, null, null)
        }
        ContentResolver.setIsSyncable(acc, AUTHORITY, 1)
        ContentResolver.setSyncAutomatically(acc, AUTHORITY, true)
        // Periodischer Sync alle 24h, damit Telefonnummer-Aenderungen ankommen
        ContentResolver.addPeriodicSync(acc, AUTHORITY, Bundle.EMPTY, 24 * 60 * 60L)
    }

    /**
     * Deaktiviert den Sync, loescht alle FWV-RawContacts hart (kein Tombstone)
     * und entfernt anschliessend das Konto.
     *
     * Wichtig: ohne CALLER_IS_SYNCADAPTER haengen "deleted=1"-Tombstones zurueck;
     * mit removeAccountExplicitly allein kommt es vor, dass Android die Kontakte
     * erst nach Stunden wirklich aufraeumt. Diese Funktion stellt sicher dass
     * die FWV-Kontakte sofort und komplett vom Geraet verschwinden.
     */
    fun disableSync(context: Context) {
        val am = AccountManager.get(context)
        val syncerUri = ContactsContract.RawContacts.CONTENT_URI.buildUpon()
            .appendQueryParameter(ContactsContract.CALLER_IS_SYNCADAPTER, "true")
            .build()
        for (acc in am.getAccountsByType(ACCOUNT_TYPE)) {
            ContentResolver.setSyncAutomatically(acc, AUTHORITY, false)
            ContentResolver.cancelSync(acc, AUTHORITY)
            try {
                context.contentResolver.delete(
                    syncerUri,
                    "${ContactsContract.RawContacts.ACCOUNT_TYPE}=? AND " +
                            "${ContactsContract.RawContacts.ACCOUNT_NAME}=?",
                    arrayOf(ACCOUNT_TYPE, acc.name)
                )
            } catch (_: SecurityException) { /* WRITE_CONTACTS evtl. weg — Account-Removal raeumt dann auf */ }
            am.removeAccountExplicitly(acc)
        }
    }

    /** Triggert sofort einen Sync (wird auch bei jedem Login aufgerufen). */
    fun requestSyncNow(context: Context) {
        val acc = account()
        val am = AccountManager.get(context)
        if (am.getAccountsByType(ACCOUNT_TYPE).isEmpty()) return
        val extras = Bundle().apply {
            putBoolean(ContentResolver.SYNC_EXTRAS_MANUAL, true)
            putBoolean(ContentResolver.SYNC_EXTRAS_EXPEDITED, true)
        }
        ContentResolver.requestSync(acc, AUTHORITY, extras)
    }

    fun isEnabled(context: Context): Boolean {
        val am = AccountManager.get(context)
        return am.getAccountsByType(ACCOUNT_TYPE).isNotEmpty()
    }

    /**
     * Loescht alle "Tombstones" (vom User geloeschte FWV-RawContacts mit DELETED=1).
     * Beim naechsten Sync werden alle Mitglieder wieder neu angelegt — rueckgaengig
     * fuer versehentliche Loeschungen.
     *
     * Gibt die Anzahl der entfernten Tombstones zurueck.
     */
    fun restoreDeletedContacts(context: Context): Int {
        val syncerUri = ContactsContract.RawContacts.CONTENT_URI.buildUpon()
            .appendQueryParameter(ContactsContract.CALLER_IS_SYNCADAPTER, "true")
            .build()
        val deleted = context.contentResolver.delete(
            syncerUri,
            "${ContactsContract.RawContacts.ACCOUNT_TYPE}=? AND " +
                    "${ContactsContract.RawContacts.ACCOUNT_NAME}=? AND " +
                    "${ContactsContract.RawContacts.DELETED}=1",
            arrayOf(ACCOUNT_TYPE, ACCOUNT_NAME)
        )
        requestSyncNow(context)
        return deleted
    }
}
