package ch.fwvraura.fwv_app.kontakte

import android.accounts.AbstractAccountAuthenticator
import android.accounts.Account
import android.accounts.AccountAuthenticatorResponse
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.IBinder

/**
 * Platzhalter-Authenticator fuer den Kontotyp com.fwv.members (aus
 * members-android sync/FwvAccountAuthenticator.kt). Ein Anmeldeablauf ueber
 * die Systemkonten gibt es nicht — die App meldet sich selbst an. Er muss aber
 * existieren: ohne Authenticator fuer den Kontotyp entfernt Android das Konto
 * "FWV Raura" samt aller abgeglichenen Kontakte.
 */
class FwvKontoAuthenticator(context: Context) : AbstractAccountAuthenticator(context) {
    override fun editProperties(response: AccountAuthenticatorResponse?, accountType: String?): Bundle = Bundle()

    override fun addAccount(
        response: AccountAuthenticatorResponse?,
        accountType: String?,
        authTokenType: String?,
        requiredFeatures: Array<out String>?,
        options: Bundle?
    ): Bundle = Bundle()

    override fun confirmCredentials(
        response: AccountAuthenticatorResponse?,
        account: Account?,
        options: Bundle?
    ): Bundle = Bundle()

    override fun getAuthToken(
        response: AccountAuthenticatorResponse?,
        account: Account?,
        authTokenType: String?,
        options: Bundle?
    ): Bundle = Bundle()

    override fun getAuthTokenLabel(authTokenType: String?): String = KontakteKonto.KONTONAME

    override fun updateCredentials(
        response: AccountAuthenticatorResponse?,
        account: Account?,
        authTokenType: String?,
        options: Bundle?
    ): Bundle = Bundle()

    override fun hasFeatures(
        response: AccountAuthenticatorResponse?,
        account: Account?,
        features: Array<out String>?
    ): Bundle = Bundle()
}

/** Bindet den Authenticator (Manifest: android.accounts.AccountAuthenticator). */
class FwvKontoAuthenticatorService : Service() {
    private lateinit var authenticator: FwvKontoAuthenticator

    override fun onCreate() {
        authenticator = FwvKontoAuthenticator(this)
    }

    override fun onBind(intent: Intent?): IBinder? = authenticator.iBinder
}
