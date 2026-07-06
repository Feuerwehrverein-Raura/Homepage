package ch.fwvraura.members.ui.organizer

import android.os.Bundle
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import ch.fwvraura.members.R
import ch.fwvraura.members.data.api.ApiModule
import ch.fwvraura.members.data.model.AddManualItemRequest
import ch.fwvraura.members.data.model.AvailableItem
import ch.fwvraura.members.data.model.AvailableRecipe
import ch.fwvraura.members.data.model.EventMaterialNumbers
import ch.fwvraura.members.data.model.LinkRecipeRequest
import ch.fwvraura.members.data.model.LinkedRecipe
import ch.fwvraura.members.data.model.ShoppingItem
import ch.fwvraura.members.data.model.ShoppingList
import ch.fwvraura.members.data.model.UpdateServingsRequest
import ch.fwvraura.members.databinding.ActivityEventMaterialsBinding
import com.google.android.material.snackbar.Snackbar
import kotlinx.coroutines.launch
import kotlin.math.floor

/**
 * EventMaterialsActivity — editierbares Modul "Rezepte & Material" fuer ein Event.
 *
 * Startet aus dem Organisator-Dashboard und erwartet die Intent-Extras
 * [EXTRA_EVENT_ID] und [EXTRA_EVENT_TITLE]. Der Organisator (oder Vorstand) kann:
 * - Rezepte am Event verknuepfen, Portionen aendern und wieder entfernen,
 * - manuelle Materialien mit Menge erfassen und entfernen,
 * - die benoetigten Materialien gegen das Lager abgeglichen sehen (was fehlt =
 *   to_buy, hervorgehoben).
 *
 * Alle Endpunkte laufen ueber [ApiModule.eventsApi]; der Server prueft den Zugriff
 * per requireEventRecipeAccess (Vorstand ODER Organisator des Events).
 */
class EventMaterialsActivity : AppCompatActivity() {

    private lateinit var binding: ActivityEventMaterialsBinding
    private lateinit var recipeAdapter: LinkedRecipeAdapter
    private lateinit var manualAdapter: ManualMaterialAdapter
    private lateinit var shoppingAdapter: ShoppingItemAdapter

    private lateinit var eventId: String
    private var eventTitle: String = ""

    // Zuletzt geladene Daten.
    private var linkedRecipes: List<LinkedRecipe> = emptyList()
    private var manualItems: List<ShoppingItem> = emptyList()
    private var availableRecipes: List<AvailableRecipe> = emptyList()
    private var availableItems: List<AvailableItem> = emptyList()

    // Aktuelle Dropdown-Auswahl (Index in [selectableRecipes]/[selectableItems], -1 = keine).
    private var selectableRecipes: List<AvailableRecipe> = emptyList()
    private var selectableItems: List<AvailableItem> = emptyList()
    private var selectedRecipeIndex = -1
    private var selectedItemIndex = -1

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        @Suppress("DEPRECATION")
        androidx.core.view.WindowCompat.setDecorFitsSystemWindows(window, true)
        binding = ActivityEventMaterialsBinding.inflate(layoutInflater)
        setContentView(binding.root)

        eventId = intent.getStringExtra(EXTRA_EVENT_ID).orEmpty()
        eventTitle = intent.getStringExtra(EXTRA_EVENT_TITLE).orEmpty()
        if (eventId.isBlank()) {
            toast("Kein Event angegeben")
            finish()
            return
        }

        binding.toolbar.setNavigationOnClickListener { finish() }
        if (eventTitle.isNotBlank()) {
            binding.toolbar.subtitle = eventTitle
            binding.toolbar.setSubtitleTextColor(getColor(R.color.on_primary))
        }

        recipeAdapter = LinkedRecipeAdapter(
            onSaveServings = { recipe, servings -> saveServings(recipe, servings) },
            onRemove = { recipe -> confirmRemoveRecipe(recipe) }
        )
        manualAdapter = ManualMaterialAdapter(
            onRemove = { item -> confirmRemoveManual(item) }
        )
        shoppingAdapter = ShoppingItemAdapter()

        binding.recipesList.layoutManager = LinearLayoutManager(this)
        binding.recipesList.adapter = recipeAdapter
        binding.manualList.layoutManager = LinearLayoutManager(this)
        binding.manualList.adapter = manualAdapter
        binding.shoppingList.layoutManager = LinearLayoutManager(this)
        binding.shoppingList.adapter = shoppingAdapter

        binding.recipePicker.setOnItemClickListener { _, _, position, _ ->
            selectedRecipeIndex = position
        }
        binding.itemPicker.setOnItemClickListener { _, _, position, _ ->
            selectedItemIndex = position
        }

        binding.swipeRefresh.setOnRefreshListener { load() }
        binding.btnAddRecipe.setOnClickListener { addRecipe() }
        binding.btnAddItem.setOnClickListener { addManualItem() }

        load()
    }

    // ── Laden ─────────────────────────────────────────────────────────────────

    private fun load() {
        binding.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val recipesResp = ApiModule.eventsApi.getLinkedRecipes(eventId)
                if (!recipesResp.isSuccessful) {
                    showError(errorMessage(recipesResp.code()))
                    return@launch
                }
                linkedRecipes = recipesResp.body().orEmpty()

                val shoppingResp = ApiModule.eventsApi.getShoppingList(eventId)
                val shopping = if (shoppingResp.isSuccessful) shoppingResp.body() else null

                val availRecResp = ApiModule.eventsApi.getAvailableRecipes(eventId)
                availableRecipes = if (availRecResp.isSuccessful) availRecResp.body().orEmpty() else emptyList()

                val availItemResp = ApiModule.eventsApi.getAvailableItems(eventId)
                availableItems = if (availItemResp.isSuccessful) availItemResp.body().orEmpty() else emptyList()

                render(shopping)
            } catch (e: Exception) {
                showError("Netzwerkfehler: ${e.message}")
            } finally {
                binding.progress.visibility = View.GONE
                binding.swipeRefresh.isRefreshing = false
            }
        }
    }

    private fun render(shopping: ShoppingList?) {
        // (1) Verknuepfte Rezepte
        recipeAdapter.submitList(linkedRecipes)
        binding.recipesEmpty.visibility = if (linkedRecipes.isEmpty()) View.VISIBLE else View.GONE

        // (2) Manuelle Materialien = shopping-list-Positionen mit manual_needed > 0
        val allItems = shopping?.items.orEmpty()
        manualItems = allItems.filter { EventMaterialNumbers.toDouble(it.manualNeeded) > 0 }
        manualAdapter.submitList(manualItems)
        binding.manualEmpty.visibility = if (manualItems.isEmpty()) View.VISIBLE else View.GONE

        // (3) Benoetigte Materialien
        shoppingAdapter.submitList(allItems)
        binding.shoppingEmpty.visibility = if (allItems.isEmpty()) View.VISIBLE else View.GONE
        binding.shoppingHeader.visibility = if (allItems.isEmpty()) View.GONE else View.VISIBLE

        if (shopping != null && allItems.isNotEmpty()) {
            val missing = allItems.count { (it.toBuy ?: 0.0) > 0 }
            val open = shopping.estimatedOpenCost ?: 0.0
            val total = EventMaterialNumbers.toDouble(shopping.estimatedTotalCost)
            binding.shoppingSummary.text =
                "$missing fehlen · offen CHF ${EventMaterialNumbers.formatCost(open)} / total CHF ${EventMaterialNumbers.formatCost(total)}"
            binding.shoppingSummary.visibility = View.VISIBLE
        } else {
            binding.shoppingSummary.visibility = View.GONE
        }

        updateRecipePicker()
        updateItemPicker()
    }

    // ── Dropdowns ─────────────────────────────────────────────────────────────

    private fun updateRecipePicker() {
        val linkedIds = linkedRecipes.mapNotNull { it.effectiveRecipeId }.toSet()
        selectableRecipes = availableRecipes.filter { it.id !in linkedIds }
        selectedRecipeIndex = -1

        val labels = selectableRecipes.map { r ->
            val cat = r.categoryName?.takeIf { it.isNotBlank() }
            if (cat != null) "${r.name.orEmpty()} ($cat)" else r.name.orEmpty()
        }
        binding.recipePicker.setAdapter(
            ArrayAdapter(this, android.R.layout.simple_dropdown_item_1line, labels)
        )
        binding.recipePicker.setText("", false)
        binding.recipePicker.isEnabled = selectableRecipes.isNotEmpty()
        binding.recipePickerLayout.hint =
            if (selectableRecipes.isEmpty()) "Keine weiteren Rezepte" else "Rezept wählen"
    }

    private fun updateItemPicker() {
        val manualIds = manualItems.mapNotNull { it.itemId }.toSet()
        selectableItems = availableItems.filter { it.id !in manualIds }
        selectedItemIndex = -1

        val labels = selectableItems.map { i ->
            val unit = i.unit?.takeIf { it.isNotBlank() }
            if (unit != null) "${i.name.orEmpty()} ($unit)" else i.name.orEmpty()
        }
        binding.itemPicker.setAdapter(
            ArrayAdapter(this, android.R.layout.simple_dropdown_item_1line, labels)
        )
        binding.itemPicker.setText("", false)
        binding.itemPicker.isEnabled = selectableItems.isNotEmpty()
        binding.itemPickerLayout.hint =
            if (selectableItems.isEmpty()) "Keine weiteren Materialien" else "Material wählen"
    }

    // ── Rezepte: hinzufuegen / Portionen / entfernen ──────────────────────────

    private fun addRecipe() {
        val index = selectedRecipeIndex
        if (index < 0 || index >= selectableRecipes.size) {
            toast("Bitte ein Rezept wählen")
            return
        }
        val recipe = selectableRecipes[index]
        val servings = floor(EventMaterialNumbers.toDouble(binding.recipeServingsInput.text?.toString())).toInt()
        if (servings < 1) {
            toast("Portionen muss mindestens 1 sein")
            return
        }
        setInputsEnabled(false)
        binding.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val resp = ApiModule.eventsApi.linkRecipe(eventId, LinkRecipeRequest(recipe.id, servings))
                if (resp.isSuccessful) {
                    binding.recipeServingsInput.setText("1")
                    load()
                } else {
                    showError(errorMessage(resp.code()))
                }
            } catch (e: Exception) {
                showError("Netzwerkfehler: ${e.message}")
            } finally {
                setInputsEnabled(true)
                binding.progress.visibility = View.GONE
            }
        }
    }

    private fun saveServings(recipe: LinkedRecipe, servingsInput: String) {
        val recipeId = recipe.effectiveRecipeId ?: run {
            toast("Rezept-ID fehlt")
            return
        }
        val servings = floor(EventMaterialNumbers.toDouble(servingsInput)).toInt()
        if (servings < 1) {
            toast("Portionen muss mindestens 1 sein")
            return
        }
        binding.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val resp = ApiModule.eventsApi.updateRecipeServings(
                    eventId, recipeId, UpdateServingsRequest(servings)
                )
                if (resp.isSuccessful) load() else showError(errorMessage(resp.code()))
            } catch (e: Exception) {
                showError("Netzwerkfehler: ${e.message}")
            } finally {
                binding.progress.visibility = View.GONE
            }
        }
    }

    private fun confirmRemoveRecipe(recipe: LinkedRecipe) {
        val recipeId = recipe.effectiveRecipeId ?: return
        AlertDialog.Builder(this)
            .setTitle("Rezept entfernen?")
            .setMessage("„${recipe.name.orEmpty()}“ vom Anlass entfernen?")
            .setPositiveButton("Entfernen") { _, _ -> performRemoveRecipe(recipeId) }
            .setNegativeButton("Abbrechen", null)
            .show()
    }

    private fun performRemoveRecipe(recipeId: Int) {
        binding.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val resp = ApiModule.eventsApi.unlinkRecipe(eventId, recipeId)
                if (resp.isSuccessful) load() else showError(errorMessage(resp.code()))
            } catch (e: Exception) {
                showError("Netzwerkfehler: ${e.message}")
            } finally {
                binding.progress.visibility = View.GONE
            }
        }
    }

    // ── Manuelle Materialien: hinzufuegen / entfernen ─────────────────────────

    private fun addManualItem() {
        val index = selectedItemIndex
        if (index < 0 || index >= selectableItems.size) {
            toast("Bitte ein Material wählen")
            return
        }
        val item = selectableItems[index]
        val quantity = EventMaterialNumbers.toDouble(binding.itemQtyInput.text?.toString())
        if (quantity <= 0) {
            toast("Menge muss größer als 0 sein")
            return
        }
        setInputsEnabled(false)
        binding.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val resp = ApiModule.eventsApi.addManualItem(eventId, AddManualItemRequest(item.id, quantity))
                if (resp.isSuccessful) {
                    binding.itemQtyInput.setText("1")
                    load()
                } else {
                    showError(errorMessage(resp.code()))
                }
            } catch (e: Exception) {
                showError("Netzwerkfehler: ${e.message}")
            } finally {
                setInputsEnabled(true)
                binding.progress.visibility = View.GONE
            }
        }
    }

    private fun confirmRemoveManual(item: ShoppingItem) {
        val itemId = item.itemId ?: return
        AlertDialog.Builder(this)
            .setTitle("Material entfernen?")
            .setMessage("„${item.itemName.orEmpty()}“ vom Anlass entfernen?")
            .setPositiveButton("Entfernen") { _, _ -> performRemoveManual(itemId) }
            .setNegativeButton("Abbrechen", null)
            .show()
    }

    private fun performRemoveManual(itemId: Int) {
        binding.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val resp = ApiModule.eventsApi.removeManualItem(eventId, itemId)
                if (resp.isSuccessful) load() else showError(errorMessage(resp.code()))
            } catch (e: Exception) {
                showError("Netzwerkfehler: ${e.message}")
            } finally {
                binding.progress.visibility = View.GONE
            }
        }
    }

    // ── Sonstiges ─────────────────────────────────────────────────────────────

    private fun setInputsEnabled(enabled: Boolean) {
        binding.btnAddRecipe.isEnabled = enabled
        binding.btnAddItem.isEnabled = enabled
    }

    /** Menschenlesbare Fehlermeldung fuer die bekannten Backend-Status-Codes. */
    private fun errorMessage(code: Int): String = when (code) {
        403 -> "Kein Zugriff (nur Organisator/Vorstand)"
        400 -> "Ungültige Eingabe"
        404 -> "Nicht gefunden"
        else -> "Fehler $code"
    }

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_LONG).show()

    private fun showError(msg: String) =
        Snackbar.make(binding.root, msg, Snackbar.LENGTH_LONG).show()

    companion object {
        const val EXTRA_EVENT_ID = "eventId"
        const val EXTRA_EVENT_TITLE = "eventTitle"
    }
}
