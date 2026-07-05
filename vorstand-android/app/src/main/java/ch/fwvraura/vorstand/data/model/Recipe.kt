package ch.fwvraura.vorstand.data.model

import com.google.gson.annotations.SerializedName

/**
 * Ein mit einem Event verknuepftes Rezept (aus der Inventar-/Lager-API, ueber
 * den Events-Backend-Proxy read-only geladen). Angezeigt als Chip.
 */
data class Recipe(
    val name: String? = null
)

/** Eine Position der Einkaufsliste (aus verknuepften Rezepten berechnet). */
data class ShoppingItem(
    @SerializedName("item_name") val itemName: String? = null,
    @SerializedName("to_buy") val toBuy: Double? = null,
    val unit: String? = null,
    val purchased: Boolean = false,
    val recommendation: String? = null
)

/** Die Einkaufsliste eines Events samt Summen. */
data class ShoppingList(
    val items: List<ShoppingItem> = emptyList(),
    @SerializedName("total_to_buy") val totalToBuy: Int? = null,
    @SerializedName("estimated_open_cost") val estimatedOpenCost: Double? = null,
    @SerializedName("total_purchased") val totalPurchased: Int? = null
)
