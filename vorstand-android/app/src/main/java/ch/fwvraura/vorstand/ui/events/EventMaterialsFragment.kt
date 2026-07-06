package ch.fwvraura.vorstand.ui.events

import android.graphics.Typeface
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.AutoCompleteTextView
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.data.api.ApiModule
import ch.fwvraura.vorstand.data.model.AddManualItemRequest
import ch.fwvraura.vorstand.data.model.AvailableItem
import ch.fwvraura.vorstand.data.model.AvailableRecipe
import ch.fwvraura.vorstand.data.model.LinkRecipeRequest
import ch.fwvraura.vorstand.data.model.LinkedRecipe
import ch.fwvraura.vorstand.data.model.ShoppingItem
import ch.fwvraura.vorstand.data.model.UpdateServingsRequest
import ch.fwvraura.vorstand.databinding.FragmentEventMaterialsBinding
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import java.util.Locale
import kotlinx.coroutines.launch

/**
 * EventMaterialsFragment – editierbares "Rezepte & Material"-Modul im Event-Detail.
 *
 * Drei Abschnitte:
 * (a) Verknuepfte Rezepte: Portionen aendern (PUT), entfernen (DELETE),
 *     hinzufuegen aus den verfuegbaren Rezepten (POST).
 * (b) Manuelle Materialien: aus der Einkaufsliste (manual_needed > 0), entfernen
 *     (DELETE), hinzufuegen aus den verfuegbaren Lager-Materialien inkl. Menge (POST).
 * (c) Benoetigte Materialien: aus Rezepten + manuellen Positionen berechnet und
 *     gegen das Lager abgeglichen – zeigt Benoetigt / im Lager / was fehlt (to_buy,
 *     rot hervorgehoben).
 *
 * Nach jeder Mutation wird komplett neu geladen. Die Event-ID kommt als
 * Fragment-Argument "eventId" (siehe nav_graph), geoeffnet aus dem
 * EventRegistrationsFragment.
 */
class EventMaterialsFragment : Fragment() {

    /** View-Binding-Referenz, wird in onDestroyView auf null gesetzt. */
    private var _binding: FragmentEventMaterialsBinding? = null

    /** Sicherer Zugriff auf das Binding. */
    private val binding get() = _binding!!

    /** ID des Events, dessen Rezepte/Materialien verwaltet werden. */
    private var eventId: String? = null

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentEventMaterialsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        eventId = arguments?.getString("eventId")

        binding.toolbar.setNavigationOnClickListener { findNavController().navigateUp() }
        binding.swipeRefresh.setOnRefreshListener { load() }
        binding.btnAddRecipe.setOnClickListener { showAddRecipeDialog() }
        binding.btnAddManualItem.setOnClickListener { showAddManualItemDialog() }

        load()
    }

    // ── Laden ────────────────────────────────────────────────────────────────

    /** Laedt verknuepfte Rezepte und die Einkaufsliste und baut alle Abschnitte auf. */
    private fun load() {
        val eid = eventId ?: return
        binding.swipeRefresh.isRefreshing = true
        viewLifecycleOwner.lifecycleScope.launch {
            val recipes = try {
                val r = ApiModule.eventsApi.getLinkedRecipes(eid)
                if (r.isSuccessful) r.body() ?: emptyList() else null
            } catch (_: Exception) {
                null
            }
            val shopping = try {
                val r = ApiModule.eventsApi.getShoppingList(eid)
                if (r.isSuccessful) r.body() else null
            } catch (_: Exception) {
                null
            }

            val b = _binding ?: return@launch
            b.swipeRefresh.isRefreshing = false

            if (recipes == null && shopping == null) {
                Toast.makeText(requireContext(), "Fehler beim Laden", Toast.LENGTH_SHORT).show()
            }

            renderRecipes(recipes ?: emptyList())

            val items = shopping?.items ?: emptyList()
            renderManualItems(items.filter { it.manualNeeded > 0 })
            renderNeeded(items)

            // Zusammenfassung: zu kaufende Positionen + geschaetzte offene Kosten
            if (shopping != null) {
                val summary = StringBuilder()
                    .append("${shopping.totalToBuy ?: 0} von ${shopping.totalItems ?: items.size} Positionen fehlen")
                    .append(" · Offen: CHF ")
                    .append(String.format(Locale.ROOT, "%.2f", shopping.estimatedOpenCost ?: 0.0))
                b.shoppingSummary.text = summary.toString()
                b.shoppingSummary.visibility = View.VISIBLE
            } else {
                b.shoppingSummary.visibility = View.GONE
            }
        }
    }

    // ── Abschnitt (a): verknuepfte Rezepte ─────────────────────────────────────

    /** Baut die Liste der verknuepften Rezepte auf. */
    private fun renderRecipes(recipes: List<LinkedRecipe>) {
        val b = _binding ?: return
        b.recipesContainer.removeAllViews()
        b.recipesEmpty.visibility = if (recipes.isEmpty()) View.VISIBLE else View.GONE
        for (recipe in recipes) {
            b.recipesContainer.addView(buildRecipeRow(recipe))
        }
    }

    /** Eine Zeile fuer ein verknuepftes Rezept: Name + Portionen, Bearbeiten, Entfernen. */
    private fun buildRecipeRow(recipe: LinkedRecipe): View {
        val row = horizontalRow()

        val label = TextView(requireContext()).apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            text = "${recipe.name ?: "Rezept"}  ·  ${recipe.servings} Portionen"
            textSize = 14f
            setTextColor(ContextCompat.getColor(requireContext(), R.color.text_primary))
        }
        row.addView(label)

        row.addView(actionText("Portionen") { showEditServingsDialog(recipe) })
        row.addView(actionText("Entfernen", error = true) { confirmDeleteRecipe(recipe) })

        return row
    }

    /** Dialog zum Verknuepfen eines Rezepts (Dropdown + Portionen). */
    private fun showAddRecipeDialog() {
        val eid = eventId ?: return
        viewLifecycleOwner.lifecycleScope.launch {
            val available = try {
                val r = ApiModule.eventsApi.getAvailableRecipes(eid)
                if (r.isSuccessful) r.body() ?: emptyList() else emptyList()
            } catch (_: Exception) {
                emptyList<AvailableRecipe>()
            }
            if (available.isEmpty()) {
                Toast.makeText(requireContext(), "Keine Rezepte verfügbar", Toast.LENGTH_SHORT).show()
                return@launch
            }

            val container = dialogContainer()
            val dropdown = AutoCompleteTextView(requireContext()).apply {
                hint = "Rezept wählen"
            }
            val names = available.map { it.name ?: "Rezept" }
            dropdown.setAdapter(
                ArrayAdapter(requireContext(), android.R.layout.simple_dropdown_item_1line, names)
            )
            var selected: AvailableRecipe? = null
            dropdown.setOnItemClickListener { _, _, position, _ -> selected = available[position] }
            container.addView(dropdown)

            val servingsInput = EditText(requireContext()).apply {
                hint = "Portionen"
                inputType = InputType.TYPE_CLASS_NUMBER
                setText("1")
            }
            container.addView(servingsInput)

            val dialog = MaterialAlertDialogBuilder(requireContext())
                .setTitle("Rezept hinzufügen")
                .setView(container)
                .setPositiveButton("Hinzufügen", null)
                .setNegativeButton("Abbrechen", null)
                .create()

            dialog.setOnShowListener {
                dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                    val recipe = selected
                    if (recipe?.id == null) {
                        Toast.makeText(requireContext(), "Bitte ein Rezept wählen", Toast.LENGTH_SHORT).show()
                        return@setOnClickListener
                    }
                    val servings = servingsInput.text?.toString()?.trim()?.toIntOrNull()?.takeIf { it >= 1 } ?: 1
                    addRecipe(recipe.id, servings, dialog)
                }
            }
            dialog.show()
        }
    }

    /** Verknuepft ein Rezept ueber die API und laedt neu. */
    private fun addRecipe(recipeId: String, servings: Int, dialog: androidx.appcompat.app.AlertDialog) {
        val eid = eventId ?: return
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.eventsApi.addRecipe(eid, LinkRecipeRequest(recipeId, servings))
                if (response.isSuccessful) {
                    Toast.makeText(requireContext(), "Rezept hinzugefügt", Toast.LENGTH_SHORT).show()
                    dialog.dismiss()
                    load()
                } else {
                    Toast.makeText(requireContext(), "Fehler beim Hinzufügen (${response.code()})", Toast.LENGTH_SHORT).show()
                }
            } catch (_: Exception) {
                Toast.makeText(requireContext(), "Netzwerkfehler", Toast.LENGTH_SHORT).show()
            }
        }
    }

    /** Dialog zum Aendern der Portionen eines verknuepften Rezepts. */
    private fun showEditServingsDialog(recipe: LinkedRecipe) {
        val recipeId = recipe.recipeId
        if (recipeId == null) {
            Toast.makeText(requireContext(), "Rezept-ID fehlt", Toast.LENGTH_SHORT).show()
            return
        }
        val container = dialogContainer()
        val servingsInput = EditText(requireContext()).apply {
            hint = "Portionen"
            inputType = InputType.TYPE_CLASS_NUMBER
            setText(recipe.servings.toString())
        }
        container.addView(servingsInput)

        val dialog = MaterialAlertDialogBuilder(requireContext())
            .setTitle("Portionen – ${recipe.name ?: "Rezept"}")
            .setView(container)
            .setPositiveButton("Speichern", null)
            .setNegativeButton("Abbrechen", null)
            .create()

        dialog.setOnShowListener {
            dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val servings = servingsInput.text?.toString()?.trim()?.toIntOrNull()?.takeIf { it >= 1 }
                if (servings == null) {
                    Toast.makeText(requireContext(), "Bitte eine gültige Zahl eingeben", Toast.LENGTH_SHORT).show()
                    return@setOnClickListener
                }
                updateServings(recipeId, servings, dialog)
            }
        }
        dialog.show()
    }

    /** Aktualisiert die Portionen ueber die API und laedt neu. */
    private fun updateServings(recipeId: String, servings: Int, dialog: androidx.appcompat.app.AlertDialog) {
        val eid = eventId ?: return
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.eventsApi.updateRecipeServings(eid, recipeId, UpdateServingsRequest(servings))
                if (response.isSuccessful) {
                    Toast.makeText(requireContext(), "Portionen aktualisiert", Toast.LENGTH_SHORT).show()
                    dialog.dismiss()
                    load()
                } else {
                    Toast.makeText(requireContext(), "Fehler beim Speichern (${response.code()})", Toast.LENGTH_SHORT).show()
                }
            } catch (_: Exception) {
                Toast.makeText(requireContext(), "Netzwerkfehler", Toast.LENGTH_SHORT).show()
            }
        }
    }

    /** Rueckfrage vor dem Entfernen eines verknuepften Rezepts. */
    private fun confirmDeleteRecipe(recipe: LinkedRecipe) {
        val recipeId = recipe.recipeId
        if (recipeId == null) {
            Toast.makeText(requireContext(), "Rezept-ID fehlt", Toast.LENGTH_SHORT).show()
            return
        }
        MaterialAlertDialogBuilder(requireContext())
            .setTitle("Rezept entfernen")
            .setMessage("\"${recipe.name ?: "Rezept"}\" wirklich entfernen?")
            .setPositiveButton("Entfernen") { _, _ -> deleteRecipe(recipeId) }
            .setNegativeButton("Abbrechen", null)
            .show()
    }

    /** Entfernt ein verknuepftes Rezept ueber die API und laedt neu. */
    private fun deleteRecipe(recipeId: String) {
        val eid = eventId ?: return
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.eventsApi.deleteRecipe(eid, recipeId)
                if (response.isSuccessful) {
                    Toast.makeText(requireContext(), "Rezept entfernt", Toast.LENGTH_SHORT).show()
                    load()
                } else {
                    Toast.makeText(requireContext(), "Fehler beim Entfernen (${response.code()})", Toast.LENGTH_SHORT).show()
                }
            } catch (_: Exception) {
                Toast.makeText(requireContext(), "Netzwerkfehler", Toast.LENGTH_SHORT).show()
            }
        }
    }

    // ── Abschnitt (b): manuelle Materialien ────────────────────────────────────

    /** Baut die Liste der manuellen Materialien auf (aus der Einkaufsliste). */
    private fun renderManualItems(items: List<ShoppingItem>) {
        val b = _binding ?: return
        b.manualContainer.removeAllViews()
        b.manualEmpty.visibility = if (items.isEmpty()) View.VISIBLE else View.GONE
        for (item in items) {
            b.manualContainer.addView(buildManualRow(item))
        }
    }

    /** Eine Zeile fuer ein manuelles Material: Name + Menge, Entfernen. */
    private fun buildManualRow(item: ShoppingItem): View {
        val row = horizontalRow()

        val label = TextView(requireContext()).apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            text = "${item.itemName ?: "Material"}  ·  ${formatQty(item.manualNeeded)} ${item.unit ?: ""}".trim()
            textSize = 14f
            setTextColor(ContextCompat.getColor(requireContext(), R.color.text_primary))
        }
        row.addView(label)

        row.addView(actionText("Entfernen", error = true) { confirmDeleteManualItem(item) })

        return row
    }

    /** Dialog zum Hinzufuegen eines manuellen Materials (Dropdown + Menge). */
    private fun showAddManualItemDialog() {
        val eid = eventId ?: return
        viewLifecycleOwner.lifecycleScope.launch {
            val available = try {
                val r = ApiModule.eventsApi.getAvailableItems(eid)
                if (r.isSuccessful) r.body() ?: emptyList() else emptyList()
            } catch (_: Exception) {
                emptyList<AvailableItem>()
            }
            if (available.isEmpty()) {
                Toast.makeText(requireContext(), "Keine Materialien verfügbar", Toast.LENGTH_SHORT).show()
                return@launch
            }

            val container = dialogContainer()
            val dropdown = AutoCompleteTextView(requireContext()).apply {
                hint = "Material wählen"
            }
            val names = available.map { item ->
                val unit = item.unit?.let { " (${it})" } ?: ""
                "${item.name ?: "Material"}$unit"
            }
            dropdown.setAdapter(
                ArrayAdapter(requireContext(), android.R.layout.simple_dropdown_item_1line, names)
            )
            var selected: AvailableItem? = null
            dropdown.setOnItemClickListener { _, _, position, _ -> selected = available[position] }
            container.addView(dropdown)

            val quantityInput = EditText(requireContext()).apply {
                hint = "Menge"
                inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
                setText("1")
            }
            container.addView(quantityInput)

            val dialog = MaterialAlertDialogBuilder(requireContext())
                .setTitle("Material hinzufügen")
                .setView(container)
                .setPositiveButton("Hinzufügen", null)
                .setNegativeButton("Abbrechen", null)
                .create()

            dialog.setOnShowListener {
                dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                    val item = selected
                    if (item?.id == null) {
                        Toast.makeText(requireContext(), "Bitte ein Material wählen", Toast.LENGTH_SHORT).show()
                        return@setOnClickListener
                    }
                    val quantity = quantityInput.text?.toString()?.trim()
                        ?.replace(',', '.')?.toDoubleOrNull()?.takeIf { it > 0 }
                    if (quantity == null) {
                        Toast.makeText(requireContext(), "Bitte eine gültige Menge eingeben", Toast.LENGTH_SHORT).show()
                        return@setOnClickListener
                    }
                    addManualItem(item.id, quantity, dialog)
                }
            }
            dialog.show()
        }
    }

    /** Fuegt ein manuelles Material ueber die API hinzu und laedt neu. */
    private fun addManualItem(itemId: String, quantity: Double, dialog: androidx.appcompat.app.AlertDialog) {
        val eid = eventId ?: return
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.eventsApi.addManualItem(eid, AddManualItemRequest(itemId, quantity))
                if (response.isSuccessful) {
                    Toast.makeText(requireContext(), "Material hinzugefügt", Toast.LENGTH_SHORT).show()
                    dialog.dismiss()
                    load()
                } else {
                    Toast.makeText(requireContext(), "Fehler beim Hinzufügen (${response.code()})", Toast.LENGTH_SHORT).show()
                }
            } catch (_: Exception) {
                Toast.makeText(requireContext(), "Netzwerkfehler", Toast.LENGTH_SHORT).show()
            }
        }
    }

    /** Rueckfrage vor dem Entfernen eines manuellen Materials. */
    private fun confirmDeleteManualItem(item: ShoppingItem) {
        val itemId = item.itemId
        if (itemId == null) {
            Toast.makeText(requireContext(), "Material-ID fehlt", Toast.LENGTH_SHORT).show()
            return
        }
        MaterialAlertDialogBuilder(requireContext())
            .setTitle("Material entfernen")
            .setMessage("\"${item.itemName ?: "Material"}\" wirklich entfernen?")
            .setPositiveButton("Entfernen") { _, _ -> deleteManualItem(itemId) }
            .setNegativeButton("Abbrechen", null)
            .show()
    }

    /** Entfernt ein manuelles Material ueber die API und laedt neu. */
    private fun deleteManualItem(itemId: String) {
        val eid = eventId ?: return
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.eventsApi.deleteManualItem(eid, itemId)
                if (response.isSuccessful) {
                    Toast.makeText(requireContext(), "Material entfernt", Toast.LENGTH_SHORT).show()
                    load()
                } else {
                    Toast.makeText(requireContext(), "Fehler beim Entfernen (${response.code()})", Toast.LENGTH_SHORT).show()
                }
            } catch (_: Exception) {
                Toast.makeText(requireContext(), "Netzwerkfehler", Toast.LENGTH_SHORT).show()
            }
        }
    }

    // ── Abschnitt (c): benoetigte Materialien (Lager-Abgleich) ─────────────────

    /** Baut die Liste "Benoetigte Materialien" auf (Benoetigt / Lager / Fehlt). */
    private fun renderNeeded(items: List<ShoppingItem>) {
        val b = _binding ?: return
        b.neededContainer.removeAllViews()
        b.neededEmpty.visibility = if (items.isEmpty()) View.VISIBLE else View.GONE
        for (item in items) {
            b.neededContainer.addView(buildNeededRow(item))
        }
    }

    /**
     * Eine Zeile der benoetigten Materialien:
     * Name (oben) + "Benötigt X · Lager Y · Fehlt Z" (unten). Fehlt (to_buy) wird
     * rot hervorgehoben, wenn > 0; sonst gruen (nichts einzukaufen).
     */
    private fun buildNeededRow(item: ShoppingItem): View {
        val column = LinearLayout(requireContext()).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            setPadding(0, dp(6), 0, dp(6))
        }

        val toBuy = item.toBuy ?: 0.0
        val missing = toBuy > 0

        val name = TextView(requireContext()).apply {
            text = item.itemName ?: ""
            textSize = 14f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(ContextCompat.getColor(requireContext(), R.color.text_primary))
        }
        column.addView(name)

        val unit = item.unit ?: ""
        val detail = TextView(requireContext()).apply {
            text = "Benötigt ${formatQty(item.needed)} $unit  ·  Lager ${formatQty(item.inStock)} $unit".trim()
            textSize = 13f
            setTextColor(ContextCompat.getColor(requireContext(), R.color.text_secondary))
        }
        column.addView(detail)

        val missingLine = TextView(requireContext()).apply {
            if (missing) {
                text = "Fehlt: ${formatQty(toBuy)} $unit".trim()
                setTextColor(ContextCompat.getColor(requireContext(), R.color.error))
                setTypeface(typeface, Typeface.BOLD)
            } else {
                text = "Vollständig im Lager"
                setTextColor(ContextCompat.getColor(requireContext(), R.color.status_aktiv))
            }
            textSize = 13f
        }
        column.addView(missingLine)

        return column
    }

    // ── UI-Helfer ──────────────────────────────────────────────────────────────

    /** Horizontale Zeile mit vertikaler Zentrierung fuer Listeneintraege. */
    private fun horizontalRow(): LinearLayout = LinearLayout(requireContext()).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        )
        setPadding(0, dp(6), 0, dp(6))
    }

    /** Tappbarer Text-"Button" (Aktion) fuer Listeneintraege. */
    private fun actionText(text: String, error: Boolean = false, onClick: () -> Unit): TextView =
        TextView(requireContext()).apply {
            this.text = text
            textSize = 13f
            setTextColor(
                ContextCompat.getColor(
                    requireContext(),
                    if (error) R.color.error else R.color.primary
                )
            )
            setPadding(dp(10), dp(4), dp(4), dp(4))
            isClickable = true
            isFocusable = true
            setOnClickListener { onClick() }
        }

    /** Vertikaler Container mit Rand fuer Dialog-Inhalte. */
    private fun dialogContainer(): LinearLayout = LinearLayout(requireContext()).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(20), dp(8), dp(20), dp(0))
    }

    /**
     * Formatiert eine Menge wie die Web-Ansicht: ab 10 auf eine ganze Zahl gerundet,
     * darunter auf eine Nachkommastelle.
     */
    private fun formatQty(value: Double): String =
        if (value >= 10) Math.round(value).toString()
        else String.format(Locale.ROOT, "%.1f", value)

    /** Wandelt dp in px um (fuer programmatisch erzeugte Zeilen). */
    private fun dp(value: Int): Int =
        (value * resources.displayMetrics.density).toInt()

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
