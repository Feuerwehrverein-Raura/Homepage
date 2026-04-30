package ch.fwvraura.members.sync

import android.accounts.AbstractAccountAuthenticator
import android.accounts.Account
import android.accounts.AccountAuthenticatorResponse
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.IBinder

/**
 * Stub-Authenticator: Wir brauchen keinen System-Account-Login-Flow, weil die
 * App selbst bereits eingeloggt ist. Der Authenticator existiert nur, damit
 * Android unser Konto im "Konten"-Bildschirm akzeptiert und der SyncAdapter
 * laufen kann.
 */
class FwvAccountAuthenticator(context: Context) : AbstractAccountAuthenticator(context) {
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

    override fun getAuthTokenLabel(authTokenType: String?): String = "FWV Raura"

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

class FwvAuthenticatorService : Service() {
    private lateinit var authenticator: FwvAccountAuthenticator
    override fun onCreate() {
        authenticator = FwvAccountAuthenticator(this)
    }
    override fun onBind(intent: Intent?): IBinder? = authenticator.iBinder
}
