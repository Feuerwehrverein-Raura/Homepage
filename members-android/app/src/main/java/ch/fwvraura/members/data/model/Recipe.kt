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
 * Eine Position der Einkaufsliste eines Events (aus verknuepften Rezepten UND
 * manuell erfassten Materialien gegen das Lager berechnet). Feldnamen wie von
 * der Inventar-API geliefert.
 *
 * Numerische Mengen-/Preisfelder kommen teils als String (PG-numeric) — daher
 * als String? gehalten und ueber [EventMaterialNumbers.toDouble] tolerant
 * geparst. Einzig [toBuy] bleibt Double? (bereits von der read-only Ansicht im
 * Organisator-Dashboard genutzt); Gson wandelt String→Double automatisch.
 */
data class ShoppingItem(
    @SerializedName("item_id") val itemId: Int? = null,
    @SerializedName("item_name") val itemName: String? = null,
    @SerializedName("to_buy") val toBuy: Double? = null,
    val unit: String? = null,
    val purchased: Boolean = false,
    val recommendation: String? = null,
    /** Gesamtbedarf = recipe_needed + manual_needed. */
    val needed: String? = null,
    /** Bedarf aus verknuepften Rezepten. */
    @SerializedName("recipe_needed") val recipeNeeded: String? = null,
    /** Bedarf aus manuell erfassten Positionen (>0 ⇒ manuelles Material). */
    @SerializedName("manual_needed") val manualNeeded: String? = null,
    /** Aktueller Lagerbestand. */
    @SerializedName("in_stock") val inStock: String? = null,
    @SerializedName("purchase_price") val purchasePrice: String? = null,
    val supplier: String? = null,
    @SerializedName("estimated_cost") val estimatedCost: String? = null
)

/**
 * Die Einkaufsliste eines Events samt Summen.
 */
data class ShoppingList(
    val items: List<ShoppingItem> = emptyList(),
    @SerializedName("total_items") val totalItems: Int? = null,
    @SerializedName("total_to_buy") val totalToBuy: Int? = null,
    @SerializedName("estimated_open_cost") val estimatedOpenCost: Double? = null,
    @SerializedName("estimated_total_cost") val estimatedTotalCost: String? = null,
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
