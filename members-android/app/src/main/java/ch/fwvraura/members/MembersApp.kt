package ch.fwvraura.members

import android.app.Application
import android.util.Log
import ch.fwvraura.members.notifications.PushProviderResolver
import ch.fwvraura.members.notifications.PushTokenRegistrar
import ch.fwvraura.members.util.TokenManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class MembersApp : Application() {
    lateinit var tokenManager: TokenManager
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this
        tokenManager = TokenManager(this)

        // Push-Token bei jedem App-Start an Backend pushen, falls eingeloggt.
        // Verhindert, dass ein einmal fehlgeschlagener Push (z.B. Backend war zur
        // Login-Zeit nicht aktualisiert) bis zum naechsten Re-Login haengen bleibt.
        // Provider (FCM/HMS) wird zur Laufzeit aus den verfuegbaren Mobile Services
        // ermittelt — Huawei-Geraete ohne GMS landen automatisch auf HMS.
        if (tokenManager.isLoggedIn) {
            CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
                try {
                    val (provider, token) = PushProviderResolver.fetchToken(this@MembersApp)
                        ?: run {
                            Log.w("MembersApp", "Kein Push-Provider verfuegbar (kein GMS, kein HMS)")
                            return@launch
                        }
                    PushTokenRegistrar.register(provider, token)
                } catch (e: Exception) {
                    Log.w("MembersApp", "Push-Token-Refresh fehlgeschlagen: ${e.message}")
                }
            }
        }
    }

    companion object {
        lateinit var instance: MembersApp
            private set
    }
}
