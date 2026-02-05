package ch.fwvraura.vorstand.ui.events

import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.vorstand.R
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
            val context = binding.root.context

            binding.eventDate.text = DateUtils.formatDate(event.startDate)
            binding.eventTitle.text = event.title
            binding.eventLocation.text = event.location ?: ""

            // Status badge
            val status = event.status
            if (!status.isNullOrEmpty()) {
                val (label, colorRes) = when (status) {
                    "planned" -> "Geplant" to R.color.info
                    "confirmed" -> "Bestätigt" to R.color.success
                    "cancelled" -> "Abgesagt" to R.color.error
                    "completed" -> "Abgeschlossen" to R.color.text_secondary
                    else -> status.replaceFirstChar { it.uppercaseChar() } to R.color.text_secondary
                }
                binding.eventStatus.text = label
                binding.eventStatus.setTextColor(Color.WHITE)
                val badgeBackground = GradientDrawable().apply {
                    setColor(ContextCompat.getColor(context, colorRes))
                    cornerRadius = 12f * context.resources.displayMetrics.density
                }
                binding.eventStatus.background = badgeBackground
                binding.eventStatus.visibility = View.VISIBLE
            } else {
                binding.eventStatus.visibility = View.GONE
            }

            // Category
            val category = event.category
            if (!category.isNullOrEmpty()) {
                binding.eventCategory.text = category
                binding.eventCategory.visibility = View.VISIBLE
            } else {
                binding.eventCategory.visibility = View.GONE
            }

            // Shifts and registration info
            val shiftCount = event.shifts?.size ?: 0
            if (shiftCount > 0) {
                val totalRegistered = event.shifts?.sumOf {
                    it.registrations?.approvedCount ?: it.registrations?.approved?.size ?: 0
                } ?: 0
                val totalNeeded = event.shifts?.sumOf { it.needed ?: 0 } ?: 0

                val shiftText = "$shiftCount Schicht${if (shiftCount > 1) "en" else ""}"
                binding.eventShifts.text = if (totalNeeded > 0) {
                    "$totalRegistered/$totalNeeded Anmeldungen | $shiftText"
                } else {
                    shiftText
                }
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
