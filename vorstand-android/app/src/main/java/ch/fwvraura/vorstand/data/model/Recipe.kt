package ch.fwvraura.vorstand.data.model

import com.google.gson.annotations.SerializedName

/**
 * Ein mit einem Event verknuepftes Rezept (aus der Inventar-/Lager-API, ueber
 * den Events-Backend-Proxy read-only geladen). Angezeigt als Chip.
 */
data class Recipe(
    val name: String? = null
)

/**
 * Tolerante Zahl-Konvertierung: das Backend liefert numerische Felder teils als
 * String ("3.5") und teils als echte Zahl. Als String deklarierte Felder werden
 * von Gson in beiden Faellen korrekt gefuellt (JsonReader.nextString() akzeptiert
 * auch Zahl-Tokens); hier wandeln wir sie robust nach Double (leer/ungueltig -> 0).
 */
internal fun parseNum(raw: String?): Double = raw?.trim()?.toDoubleOrNull() ?: 0.0

/**
 * Eine Position der Einkaufsliste (aus verknuepften Rezepten + manuellen
 * Materialien berechnet und gegen das Lager abgeglichen).
 *
 * Die read-only Kurzansicht im EventRegistrationsFragment nutzt itemName/toBuy/
 * unit/purchased/recommendation. Das editierbare EventMaterialsFragment nutzt
 * zusaetzlich needed/recipeNeeded/manualNeeded/inStock sowie itemId (zum Loeschen
 * manueller Materialien). Numerische Felder, die als String kommen koennen, sind
 * als String deklariert und werden ueber die Getter tolerant nach Double gewandelt.
 */
data class ShoppingItem(
    @SerializedName("item_id") val itemId: String? = null,
    @SerializedName("item_name") val itemName: String? = null,
    @SerializedName("to_buy") val toBuy: Double? = null,
    val unit: String? = null,
    val purchased: Boolean = false,
    val recommendation: String? = null,
    val supplier: String? = null,
    @SerializedName("needed") private val neededRaw: String? = null,
    @SerializedName("recipe_needed") private val recipeNeededRaw: String? = null,
    @SerializedName("manual_needed") private val manualNeededRaw: String? = null,
    @SerializedName("in_stock") private val inStockRaw: String? = null,
    @SerializedName("purchase_price") private val purchasePriceRaw: String? = null,
    @SerializedName("estimated_cost") private val estimatedCostRaw: String? = null
) {
    /** Gesamt benoetigte Menge (Rezepte + manuell). */
    val needed: Double get() = parseNum(neededRaw)

    /** Aus verknuepften Rezepten benoetigte Menge. */
    val recipeNeeded: Double get() = parseNum(recipeNeededRaw)

    /** Manuell hinzugefuegte Menge (>0 => Position ist ein manuelles Material). */
    val manualNeeded: Double get() = parseNum(manualNeededRaw)

    /** Aktuell im Lager verfuegbare Menge. */
    val inStock: Double get() = parseNum(inStockRaw)

    /** Einkaufspreis pro Einheit (optional). */
    val purchasePrice: Double get() = parseNum(purchasePriceRaw)

    /** Geschaetzte Kosten fuer die zu kaufende Menge (optional). */
    val estimatedCost: Double get() = parseNum(estimatedCostRaw)
}

/** Die Einkaufsliste eines Events samt Summen. */
data class ShoppingList(
    val items: List<ShoppingItem> = emptyList(),
    @SerializedName("total_items") val totalItems: Int? = null,
    @SerializedName("total_to_buy") val totalToBuy: Int? = null,
    @SerializedName("estimated_total_cost") val estimatedTotalCost: Double? = null,
    @SerializedName("estimated_open_cost") val estimatedOpenCost: Double? = null,
    @SerializedName("total_purchased") val totalPurchased: Int? = null
)
