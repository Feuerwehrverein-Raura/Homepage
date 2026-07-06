package ch.fwvraura.members.data.model

import com.google.gson.annotations.SerializedName
import java.util.Locale

/**
 * Modelle fuer das editierbare Event-Modul "Rezepte & Material" (Organisator und
 * Vorstand). Gegenstueck zur read-only Anzeige in Recipe.kt.
 *
 * Zahlenwerte koennen vom Backend als String ODER Number kommen (PG-numeric) —
 * daher werden alle numerischen Anzeigefelder als String? gehalten und ueber
 * [EventMaterialNumbers.toDouble] tolerant geparst.
 */

/** Ein mit dem Event verknuepftes Rezept (GET events/{id}/recipes, ausfuehrlich). */
data class LinkedRecipe(
    val id: Int? = null,
    @SerializedName("recipe_id") val recipeId: Int? = null,
    @SerializedName("link_id") val linkId: Int? = null,
    val name: String? = null,
    /** Portionen fuer diesen Anlass. */
    val servings: String? = null,
    @SerializedName("category_name") val categoryName: String? = null,
    /** Aktuell aus dem Lager herstellbare Portionen. */
    @SerializedName("available_portions") val availablePortions: String? = null
) {
    /** Rezept-ID fuer PUT/DELETE: bevorzugt recipe_id, sonst id. */
    val effectiveRecipeId: Int? get() = recipeId ?: id
}

/** Ein auswaehlbares Rezept (GET events/{id}/available-recipes). */
data class AvailableRecipe(
    val id: Int,
    val name: String? = null,
    @SerializedName("category_name") val categoryName: String? = null,
    @SerializedName("available_portions") val availablePortions: String? = null
)

/** Ein auswaehlbares Material (GET events/{id}/available-items). */
data class AvailableItem(
    val id: Int,
    val name: String? = null,
    val unit: String? = null,
    val quantity: String? = null,
    @SerializedName("category_name") val categoryName: String? = null
)

/** Body von POST events/{id}/recipes — Rezept verknuepfen (Upsert von Portionen). */
data class LinkRecipeRequest(
    @SerializedName("recipe_id") val recipeId: Int,
    val servings: Int
)

/** Body von PUT events/{id}/recipes/{recipeId} — Portionen aendern. */
data class UpdateServingsRequest(val servings: Int)

/** Body von POST events/{id}/manual-items — manuelles Material hinzufuegen. */
data class AddManualItemRequest(
    @SerializedName("item_id") val itemId: Int,
    val quantity: Double
)

/** Tolerante Zahl- und Formathilfen fuer das Rezepte-&-Material-Modul. */
object EventMaterialNumbers {
    /** Parst eine Zahl, die als String ODER Number geliefert wurde. */
    fun toDouble(value: String?): Double = value?.trim()?.toDoubleOrNull() ?: 0.0

    /** Menge ohne unnoetige Nachkommastellen (2.0 → "2", 1.5 → "1.5"/"1.50"). */
    fun format(value: Double): String =
        if (value % 1.0 == 0.0) value.toLong().toString()
        else String.format(Locale.US, "%.2f", value)

    /** "{Menge} {Einheit}" bzw. nur die Menge, wenn keine Einheit vorhanden. */
    fun formatQty(value: Double, unit: String?): String {
        val n = format(value)
        return if (unit.isNullOrBlank()) n else "$n $unit"
    }

    /** Betrag immer mit zwei Nachkommastellen (fuer CHF-Summen). */
    fun formatCost(value: Double): String = String.format(Locale.US, "%.2f", value)
}
