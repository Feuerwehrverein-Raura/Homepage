package ch.fwvraura.members.data.model

import com.google.gson.annotations.SerializedName

/**
 * Aggregierter Kalender-Eintrag von GET /calendar/items.
 *
 * type: "event" | "board_meeting" | "fee_due" | "fee_paid" | "letter" | "email"
 * date: YYYY-MM-DD
 * refId: ID des urspruenglichen Eintrags (Event-UUID, Beitrags-Jahr, Dispatch-UUID)
 */
data class CalendarItem(
    val id: String,
    val type: String,
    val date: String,
    val title: String,
    val subtitle: String? = null,
    val description: String? = null,
    @SerializedName("refId") val refId: String? = null
)
