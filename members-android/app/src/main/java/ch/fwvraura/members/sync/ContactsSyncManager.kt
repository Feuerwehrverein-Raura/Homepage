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
    const val ACCOUNT_TYPE = "ch.fwvraura.members"
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

    /** Deaktiviert den Sync und entfernt das Konto (was die FWV-Kontakte mitnimmt). */
    fun disableSync(context: Context) {
        val am = AccountManager.get(context)
        for (acc in am.getAccountsByType(ACCOUNT_TYPE)) {
            ContentResolver.setSyncAutomatically(acc, AUTHORITY, false)
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
}
