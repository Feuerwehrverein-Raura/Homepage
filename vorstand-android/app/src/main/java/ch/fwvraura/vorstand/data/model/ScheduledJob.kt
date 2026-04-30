package ch.fwvraura.vorstand.data.model

import com.google.gson.annotations.SerializedName

/** Eintrag in scheduled_jobs (api-dispatch). */
data class ScheduledJob(
    val id: String,
    val action: String,
    val payload: Map<String, Any?>? = null,
    val label: String? = null,
    @SerializedName("scheduled_at") val scheduledAt: String? = null,
    /** "scheduled" | "running" | "done" | "failed" | "cancelled" */
    val status: String? = null,
    val result: Map<String, Any?>? = null,
    @SerializedName("started_at") val startedAt: String? = null,
    @SerializedName("finished_at") val finishedAt: String? = null,
    @SerializedName("created_by") val createdBy: String? = null,
    @SerializedName("created_at") val createdAt: String? = null
)

/** Body fuer POST /scheduled-jobs */
data class ScheduledJobCreate(
    val action: String,
    val payload: Map<String, Any?>? = null,
    val label: String? = null,
    @SerializedName("scheduled_at") val scheduledAt: String  // ISO-8601 mit Timezone
)
