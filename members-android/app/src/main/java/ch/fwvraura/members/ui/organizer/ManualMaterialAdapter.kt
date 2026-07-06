package ch.fwvraura.members.ui.organizer

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.members.data.model.EventMaterialNumbers
import ch.fwvraura.members.data.model.ShoppingItem
import ch.fwvraura.members.databinding.ItemManualMaterialBinding

/**
 * Adapter fuer die manuell erfassten Materialien eines Events (Positionen der
 * Einkaufsliste mit manual_needed > 0). Zeigt Name + benoetigte Menge und einen
 * Entfernen-Knopf (DELETE manual-items/{itemId}).
 */
class ManualMaterialAdapter(
    private val onRemove: (ShoppingItem) -> Unit
) : ListAdapter<ShoppingItem, ManualMaterialAdapter.VH>(DIFF) {

    inner class VH(val binding: ItemManualMaterialBinding) : RecyclerView.ViewHolder(binding.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val binding = ItemManualMaterialBinding.inflate(
            LayoutInflater.from(parent.context), parent, false
        )
        return VH(binding)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val item = getItem(position)
        val b = holder.binding

        b.materialName.text = item.itemName.orEmpty()
        val qty = EventMaterialNumbers.toDouble(item.manualNeeded)
        b.materialQty.text = EventMaterialNumbers.formatQty(qty, item.unit)

        b.materialDeleteBtn.setOnClickListener { onRemove(item) }
    }

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<ShoppingItem>() {
            override fun areItemsTheSame(o: ShoppingItem, n: ShoppingItem) = o.itemId == n.itemId
            override fun areContentsTheSame(o: ShoppingItem, n: ShoppingItem) = o == n
        }
    }
}
