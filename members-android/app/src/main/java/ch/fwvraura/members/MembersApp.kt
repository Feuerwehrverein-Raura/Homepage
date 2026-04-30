package ch.fwvraura.members

import android.app.Application
import ch.fwvraura.members.data.api.ApiModule
import ch.fwvraura.members.data.model.FcmTokenRegistration
import ch.fwvraura.members.util.TokenManager
import com.google.firebase.messaging.FirebaseMessaging
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

        // FCM-Token bei jedem App-Start an Backend pushen, falls eingeloggt.
        // Verhindert dass ein einmal fehlgeschlagener Push (z.B. Backend war zur
        // Login-Zeit nicht aktualisiert) bis zum naechsten Re-Login haengen bleibt.
        if (tokenManager.isLoggedIn) {
            CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
                try {
                    val token = tokenManager.fcmToken ?: FirebaseMessaging.getInstance()
                        .token.let { task ->
                            kotlinx.coroutines.suspendCancellableCoroutine { cont ->
                                task.addOnCompleteListener { t ->
                                    if (cont.isActive) cont.resume(
                                        if (t.isSuccessful) t.result else null
                                    ) { _, _, _ -> }
                                }
                            }
                        }
                    if (!token.isNullOrBlank()) {
                        tokenManager.fcmToken = token
                        ApiModule.membersApi.registerFcmToken(FcmTokenRegistration(token = token))
                    }
                } catch (_: Exception) { /* nicht kritisch — Service registriert beim naechsten Refresh */ }
            }
        }
    }

    companion object {
        lateinit var instance: MembersApp
            private set
    }
}
