package ch.fwvraura.fwv_app.kontakte

import android.accounts.Account
import android.accounts.AccountManager
import android.content.ContentResolver
import android.content.Context
import android.os.Bundle
import android.provider.ContactsContract

/**
 * Konto "FWV Raura" (Kontotyp com.fwv.members) ein-/ausschalten und den
 * Abgleich anstossen. Uebernommen aus members-android sync/ContactsSyncManager.kt
 * — Kontotyp, Kontoname und Authority muessen gleich bleiben, sonst verliert
 * ein Update von der alten App das Konto samt Kontakten.
 */
object KontakteKonto {
    const val KONTOTYP = "com.fwv.members"
    const val KONTONAME = "FWV Raura"
    private const val AUTHORITY = ContactsContract.AUTHORITY

    /** Periodischer Abgleich alle 24h, damit Nummern-Aenderungen ankommen (wie bisher). */
    private const val INTERVALL_SEKUNDEN = 24 * 60 * 60L

    fun konto() = Account(KONTONAME, KONTOTYP)

    /** Wie die alte App: eingeschaltet heisst "das Konto existiert". */
    fun istAktiv(context: Context): Boolean =
        AccountManager.get(context).getAccountsByType(KONTOTYP).isNotEmpty()

    /**
     * Ist das Konto da, die Abgleich-Einstellungen wiederherstellen. Noetig nach
     * dem Update von der alten App bzw. von einer App-Version ohne SyncAdapter:
     * Android setzt dann "automatisch synchronisieren" fuer das Konto zurueck.
     * Gibt zurueck, ob der Abgleich eingeschaltet ist.
     */
    fun sicherstellen(context: Context): Boolean {
        if (!istAktiv(context)) return false
        aktivieren(context)
        return true
    }

    /** Legt das Konto an (falls noetig) und schaltet den Abgleich ein. */
    fun aktivieren(context: Context) {
        val am = AccountManager.get(context)
        val konto = konto()
        if (am.getAccountsByType(KONTOTYP).isEmpty()) {
            am.addAccountExplicitly(konto, null, null)
        }
        ContentResolver.setIsSyncable(konto, AUTHORITY, 1)
        ContentResolver.setSyncAutomatically(konto, AUTHORITY, true)
        ContentResolver.addPeriodicSync(konto, AUTHORITY, Bundle.EMPTY, INTERVALL_SEKUNDEN)
    }

    /**
     * Schaltet aus, loescht alle FWV-RawContacts hart (als SyncAdapter, also
     * ohne "deleted=1"-Reste) und entfernt danach das Konto.
     */
    fun deaktivieren(context: Context) {
        val am = AccountManager.get(context)
        for (konto in am.getAccountsByType(KONTOTYP)) {
            ContentResolver.setSyncAutomatically(konto, AUTHORITY, false)
            ContentResolver.cancelSync(konto, AUTHORITY)
            try {
                context.contentResolver.delete(
                    alsSyncAdapter(ContactsContract.RawContacts.CONTENT_URI),
                    "${ContactsContract.RawContacts.ACCOUNT_TYPE}=? AND " +
                        "${ContactsContract.RawContacts.ACCOUNT_NAME}=?",
                    arrayOf(KONTOTYP, konto.name)
                )
            } catch (_: SecurityException) {
                // WRITE_CONTACTS entzogen — das Entfernen des Kontos raeumt dann auf.
            }
            am.removeAccountExplicitly(konto)
        }
    }

    /** Stoesst sofort einen Abgleich an (nur wenn das Konto existiert). */
    fun jetztAbgleichen(context: Context) {
        if (!istAktiv(context)) return
        val extras = Bundle().apply {
            putBoolean(ContentResolver.SYNC_EXTRAS_MANUAL, true)
            putBoolean(ContentResolver.SYNC_EXTRAS_EXPEDITED, true)
        }
        ContentResolver.requestSync(konto(), AUTHORITY, extras)
    }

    /**
     * Entfernt die vom Nutzer geloeschten FWV-Kontakte (DELETED=1) endgueltig;
     * der folgende Abgleich legt die Mitglieder dann wieder an. Gibt die
     * Anzahl der entfernten Eintraege zurueck.
     */
    fun wiederherstellen(context: Context): Int {
        val anzahl = context.contentResolver.delete(
            alsSyncAdapter(ContactsContract.RawContacts.CONTENT_URI),
            "${ContactsContract.RawContacts.ACCOUNT_TYPE}=? AND " +
                "${ContactsContract.RawContacts.ACCOUNT_NAME}=? AND " +
                "${ContactsContract.RawContacts.DELETED}=1",
            arrayOf(KONTOTYP, KONTONAME)
        )
        jetztAbgleichen(context)
        return anzahl
    }

    fun alsSyncAdapter(uri: android.net.Uri): android.net.Uri = uri.buildUpon()
        .appendQueryParameter(ContactsContract.CALLER_IS_SYNCADAPTER, "true")
        .build()
}
