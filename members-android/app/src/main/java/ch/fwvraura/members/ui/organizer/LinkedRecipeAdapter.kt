package ch.fwvraura.members.ui.organizer

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.members.data.model.EventMaterialNumbers
import ch.fwvraura.members.data.model.LinkedRecipe
import ch.fwvraura.members.databinding.ItemLinkedRecipeBinding

/**
 * Adapter fuer die mit einem Event verknuepften Rezepte. Pro Rezept: Name,
 * optionale Kategorie und ein Portionen-Feld mit Speichern-Knopf (PUT) sowie ein
 * Entfernen-Knopf (DELETE). Der Adapter kennt weder API noch Token — Aktionen
 * laufen ueber die Callbacks.
 */
class LinkedRecipeAdapter(
    private val onSaveServings: (LinkedRecipe, String) -> Unit,
    private val onRemove: (LinkedRecipe) -> Unit
) : ListAdapter<LinkedRecipe, LinkedRecipeAdapter.VH>(DIFF) {

    inner class VH(val binding: ItemLinkedRecipeBinding) : RecyclerView.ViewHolder(binding.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val binding = ItemLinkedRecipeBinding.inflate(
            LayoutInflater.from(parent.context), parent, false
        )
        return VH(binding)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val recipe = getItem(position)
        val b = holder.binding

        b.recipeName.text = recipe.name.orEmpty()

        val category = recipe.categoryName?.takeIf { it.isNotBlank() }
        b.recipeCategory.text = category.orEmpty()
        b.recipeCategory.visibility = if (category == null) View.GONE else View.VISIBLE

        // Portionen als ganze Zahl anzeigen (String→tolerant geparst).
        val servings = EventMaterialNumbers.toDouble(recipe.servings)
        b.recipeServings.setText(EventMaterialNumbers.format(servings))

        b.recipeSaveBtn.setOnClickListener {
            onSaveServings(recipe, b.recipeServings.text?.toString().orEmpty())
        }
        b.recipeDeleteBtn.setOnClickListener { onRemove(recipe) }
    }

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<LinkedRecipe>() {
            override fun areItemsTheSame(o: LinkedRecipe, n: LinkedRecipe) =
                o.effectiveRecipeId == n.effectiveRecipeId
            override fun areContentsTheSame(o: LinkedRecipe, n: LinkedRecipe) = o == n
        }
    }
}
