package ch.fwvraura.members

import android.app.Application
import android.util.Log
import ch.fwvraura.members.data.api.ApiModule
import ch.fwvraura.members.data.model.FcmTokenRegistration
import ch.fwvraura.members.util.TokenManager
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

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
                    val token = tokenManager.fcmToken
                        ?: FirebaseMessaging.getInstance().token.await()
                    if (!token.isNullOrBlank()) {
                        tokenManager.fcmToken = token
                        ApiModule.membersApi.registerFcmToken(FcmTokenRegistration(token = token))
                        Log.d("MembersApp", "FCM token (re)registered with backend")
                    }
                } catch (e: Exception) {
                    Log.w("MembersApp", "FCM token push failed: ${e.message}")
                }
            }
        }
    }

    companion object {
        lateinit var instance: MembersApp
            private set
    }
}
