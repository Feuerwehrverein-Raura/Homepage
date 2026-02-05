package ch.fwvraura.vorstand.ui.events

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.vorstand.data.model.Event
import ch.fwvraura.vorstand.databinding.ItemEventBinding
import ch.fwvraura.vorstand.util.DateUtils

class EventsAdapter(
    private val onClick: (Event) -> Unit,
    private val onEdit: (Event) -> Unit
) : ListAdapter<Event, EventsAdapter.ViewHolder>(DiffCallback()) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemEventBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return ViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    inner class ViewHolder(private val binding: ItemEventBinding) : RecyclerView.ViewHolder(binding.root) {
        fun bind(event: Event) {
            binding.eventDate.text = DateUtils.formatDate(event.startDate)
            binding.eventTitle.text = event.title
            binding.eventLocation.text = event.location ?: ""

            val shiftCount = event.shifts?.size ?: 0
            if (shiftCount > 0) {
                binding.eventShifts.text = "$shiftCount Schicht${if (shiftCount > 1) "en" else ""}"
                binding.eventShifts.visibility = View.VISIBLE
            } else {
                binding.eventShifts.visibility = View.GONE
            }

            binding.root.setOnClickListener { onClick(event) }
            binding.root.setOnLongClickListener {
                onEdit(event)
                true
            }
        }
    }

    class DiffCallback : DiffUtil.ItemCallback<Event>() {
        override fun areItemsTheSame(oldItem: Event, newItem: Event) = oldItem.id == newItem.id
        override fun areContentsTheSame(oldItem: Event, newItem: Event) = oldItem == newItem
    }
}
