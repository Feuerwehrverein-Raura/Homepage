package ch.fwvraura.vorstand.data.model

import com.google.gson.annotations.SerializedName

/**
 * Modelle fuer das editierbare "Rezepte & Material"-Modul im Event-Detail
 * (EventMaterialsFragment). Numerische Felder, die vom Backend teils als String
 * geliefert werden, sind als String deklariert und werden ueber Getter tolerant
 * nach Zahl gewandelt (siehe parseNum in Recipe.kt).
 */

/**
 * Ein mit dem Event verknuepftes Rezept (GET events/{id}/recipes).
 *
 * Die Backend-Eintraege tragen die Rezept-ID mal als "recipe_id", mal als "id" —
 * @SerializedName mit alternate deckt beide Faelle ab. Die Portionsgroesse kann
 * als String oder Zahl kommen.
 */
data class LinkedRecipe(
    @SerializedName(value = "recipe_id", alternate = ["id"]) val recipeId: String? = null,
    val name: String? = null,
    @SerializedName("servings") private val servingsRaw: String? = null
) {
    /** Portionen (mindestens 1, falls nicht/ungueltig geliefert). */
    val servings: Int get() = (parseNum(servingsRaw)).toInt().coerceAtLeast(1)
}

/** Ein waehlbares Rezept aus dem Lager (GET events/{id}/available-recipes). */
data class AvailableRecipe(
    val id: String? = null,
    val name: String? = null
)

/** Ein waehlbares Material aus dem Lager (GET events/{id}/available-items). */
data class AvailableItem(
    val id: String? = null,
    val name: String? = null,
    val unit: String? = null,
    @SerializedName("quantity") private val quantityRaw: String? = null
) {
    /** Aktuell im Lager verfuegbare Menge. */
    val quantity: Double get() = parseNum(quantityRaw)
}

/** Request-Body: Rezept mit dem Event verknuepfen (POST events/{id}/recipes). */
data class LinkRecipeRequest(
    @SerializedName("recipe_id") val recipeId: String,
    val servings: Int
)

/** Request-Body: Portionen eines verknuepften Rezepts aendern (PUT .../recipes/{recipeId}). */
data class UpdateServingsRequest(
    val servings: Int
)

/** Request-Body: manuelles Material hinzufuegen (POST events/{id}/manual-items). */
data class AddManualItemRequest(
    @SerializedName("item_id") val itemId: String,
    val quantity: Double
)
