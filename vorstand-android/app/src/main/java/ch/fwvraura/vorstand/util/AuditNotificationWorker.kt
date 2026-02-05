package ch.fwvraura.vorstand.util

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.VorstandApp
import ch.fwvraura.vorstand.data.api.ApiModule

class AuditNotificationWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    private val relevantActions = setOf(
        "MEMBER_CREATE", "MEMBER_DELETE", "MEMBER_DELETE_REQUESTED",
        "MEMBER_UPDATE", "MEMBER_REGISTRATION"
    )

    override suspend fun doWork(): Result {
        val tokenManager = VorstandApp.instance.tokenManager
        if (!tokenManager.isLoggedIn) return Result.success()

        val since = tokenManager.lastAuditCheck

        return try {
            val response = ApiModule.auditApi.getAuditLog(since = since, limit = 20)
            if (!response.isSuccessful) return Result.retry()

            val entries = response.body() ?: emptyList()
            val relevant = entries.filter { it.action in relevantActions }

            if (relevant.isNotEmpty()) {
                // Update timestamp to newest entry
                entries.firstOrNull()?.createdAt?.let {
                    tokenManager.lastAuditCheck = it
                }

                val ctx = applicationContext
                val title = ctx.getString(R.string.notification_audit_title)
                val text = if (relevant.size == 1) {
                    formatSingleEntry(ctx, relevant.first())
                } else {
                    ctx.getString(R.string.notification_multiple, relevant.size)
                }

                NotificationHelper.showAuditNotification(ctx, title, text)
            } else if (entries.isNotEmpty()) {
                // Update timestamp even if no relevant entries
                entries.firstOrNull()?.createdAt?.let {
                    tokenManager.lastAuditCheck = it
                }
            }

            Result.success()
        } catch (_: Exception) {
            Result.retry()
        }
    }

    @Suppress("UNCHECKED_CAST")
    private fun formatSingleEntry(ctx: Context, entry: ch.fwvraura.vorstand.data.model.AuditEntry): String {
        val name = try {
            val values = entry.newValues
            if (values is Map<*, *>) {
                val map = values as Map<String, Any?>
                listOfNotNull(map["vorname"], map["nachname"]).joinToString(" ")
            } else ""
        } catch (_: Exception) { "" }

        return when (entry.action) {
            "MEMBER_CREATE" -> ctx.getString(R.string.notification_member_created, name.ifEmpty { "?" })
            "MEMBER_DELETE", "MEMBER_DELETE_REQUESTED" -> ctx.getString(R.string.notification_member_deleted, name.ifEmpty { "?" })
            "MEMBER_UPDATE" -> ctx.getString(R.string.notification_member_updated, name.ifEmpty { "?" })
            "MEMBER_REGISTRATION" -> ctx.getString(R.string.notification_registration)
            else -> ctx.getString(R.string.notification_multiple, 1)
        }
    }
}
