package ch.fwvraura.vorstand

import android.app.Application
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import ch.fwvraura.vorstand.data.api.ApiModule
import ch.fwvraura.vorstand.util.AuditNotificationWorker
import ch.fwvraura.vorstand.util.NotificationHelper
import ch.fwvraura.vorstand.util.TokenManager
import java.util.concurrent.TimeUnit

class VorstandApp : Application() {

    lateinit var tokenManager: TokenManager
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this
        tokenManager = TokenManager(this)
        ApiModule.init(tokenManager)
        NotificationHelper.createChannel(this)
        scheduleAuditWorker()
    }

    private fun scheduleAuditWorker() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val request = PeriodicWorkRequestBuilder<AuditNotificationWorker>(15, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .build()

        WorkManager.getInstance(this)
            .enqueueUniquePeriodicWork("audit_check", ExistingPeriodicWorkPolicy.KEEP, request)
    }

    companion object {
        lateinit var instance: VorstandApp
            private set
    }
}
