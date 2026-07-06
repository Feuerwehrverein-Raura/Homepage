package ch.fwvraura.members.ui.organizer

import android.graphics.Color
import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.members.R
import ch.fwvraura.members.data.model.EventMaterialNumbers
import ch.fwvraura.members.data.model.ShoppingItem
import ch.fwvraura.members.databinding.ItemShoppingItemBinding

/**
 * Adapter fuer die benoetigten Materialien (Abgleich mit dem Lager). Pro Zeile:
 * Name(+Einheit), Benoetigt, Am Lager und Fehlt = to_buy. Fehlende Positionen
 * (to_buy > 0) werden hervorgehoben.
 */
class ShoppingItemAdapter : ListAdapter<ShoppingItem, ShoppingItemAdapter.VH>(DIFF) {

    inner class VH(val binding: ItemShoppingItemBinding) : RecyclerView.ViewHolder(binding.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val binding = ItemShoppingItemBinding.inflate(
            LayoutInflater.from(parent.context), parent, false
        )
        return VH(binding)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val item = getItem(position)
        val b = holder.binding
        val ctx = b.root.context

        val name = item.itemName.orEmpty()
        val unit = item.unit?.takeIf { it.isNotBlank() }
        b.shoppingName.text = if (unit != null) "$name ($unit)" else name

        b.shoppingNeeded.text = EventMaterialNumbers.format(EventMaterialNumbers.toDouble(item.needed))
        b.shoppingStock.text = EventMaterialNumbers.format(EventMaterialNumbers.toDouble(item.inStock))

        val toBuy = item.toBuy ?: 0.0
        val missing = toBuy > 0
        b.shoppingMissing.text = if (missing) EventMaterialNumbers.format(toBuy) else "–"
        b.shoppingMissing.setTextColor(
            if (missing) ContextCompat.getColor(ctx, R.color.error)
            else ContextCompat.getColor(ctx, R.color.text_secondary)
        )

        // Fehlende Positionen dezent rot hinterlegen.
        b.shoppingRow.setBackgroundColor(
            if (missing) Color.parseColor("#FDECEC") else Color.TRANSPARENT
        )
    }

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<ShoppingItem>() {
            override fun areItemsTheSame(o: ShoppingItem, n: ShoppingItem) = o.itemId == n.itemId
            override fun areContentsTheSame(o: ShoppingItem, n: ShoppingItem) = o == n
        }
    }
}
