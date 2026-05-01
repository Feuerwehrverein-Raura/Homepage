package ch.fwvraura.members.ui.events

import android.graphics.Color
import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.members.data.model.CalendarItem
import ch.fwvraura.members.databinding.ItemCalendarEntryBinding

class CalendarItemsAdapter(
    private val onClick: (CalendarItem) -> Unit
) : ListAdapter<CalendarItem, CalendarItemsAdapter.VH>(DIFF) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val b = ItemCalendarEntryBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return VH(b)
    }

    override fun onBindViewHolder(holder: VH, position: Int) = holder.bind(getItem(position))

    inner class VH(private val b: ItemCalendarEntryBinding) : RecyclerView.ViewHolder(b.root) {
        fun bind(item: CalendarItem) {
            b.itemTitle.text = item.title
            if (item.subtitle.isNullOrBlank()) {
                b.itemSubtitle.visibility = android.view.View.GONE
            } else {
                b.itemSubtitle.text = item.subtitle
                b.itemSubtitle.visibility = android.view.View.VISIBLE
            }
            val (color, label) = colorAndLabel(item.type)
            b.itemTypeBar.setBackgroundColor(color)
            b.itemTypeBadge.text = label
            b.itemTypeBadge.setTextColor(color)
            b.root.setOnClickListener { onClick(item) }
        }
    }

    private fun colorAndLabel(type: String): Pair<Int, String> = when (type) {
        "event"         -> Color.parseColor("#C8102E") to "Anlass"
        "board_meeting" -> Color.parseColor("#7C3AED") to "Vorstand"
        "fee_due"       -> Color.parseColor("#F59E0B") to "Beitrag"
        "fee_paid"      -> Color.parseColor("#16A34A") to "Bezahlt"
        "letter"        -> Color.parseColor("#64748B") to "Brief"
        "email"         -> Color.parseColor("#0284C7") to "E-Mail"
        else            -> Color.parseColor("#6B7280") to type
    }

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<CalendarItem>() {
            override fun areItemsTheSame(old: CalendarItem, new: CalendarItem) = old.id == new.id
            override fun areContentsTheSame(old: CalendarItem, new: CalendarItem) = old == new
        }
    }
}
