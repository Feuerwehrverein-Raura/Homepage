package ch.fwvraura.members.data.model

import com.google.gson.annotations.SerializedName

/**
 * Ein mit einem Event verknuepftes Rezept (aus der Inventar-/Lager-API,
 * ueber den Events-Backend-Proxy read-only geladen). Angezeigt als Chip —
 * nur der Name wird gebraucht.
 */
data class Recipe(
    val name: String? = null
)

/**
 * Eine Position der Einkaufsliste eines Events (aus verknuepften Rezepten
 * berechnet). Feldnamen wie von der Inventar-API geliefert.
 */
data class ShoppingItem(
    @SerializedName("item_name") val itemName: String? = null,
    @SerializedName("to_buy") val toBuy: Double? = null,
    val unit: String? = null,
    val purchased: Boolean = false,
    val recommendation: String? = null
)

/**
 * Die Einkaufsliste eines Events samt Summen.
 */
data class ShoppingList(
    val items: List<ShoppingItem> = emptyList(),
    @SerializedName("total_to_buy") val totalToBuy: Int? = null,
    @SerializedName("estimated_open_cost") val estimatedOpenCost: Double? = null,
    @SerializedName("total_purchased") val totalPurchased: Int? = null
)

/** Antwort von POST /events/:id/notify-registrants(-as-organizer). */
data class NotifyResult(
    val success: Boolean = false,
    val emailed: Int = 0,
    val posted: Int = 0,
    val skipped: Int = 0,
    val unreachable: List<String> = emptyList()
)
