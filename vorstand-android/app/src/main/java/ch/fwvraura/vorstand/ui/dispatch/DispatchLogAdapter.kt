package ch.fwvraura.vorstand.ui.dispatch

import android.graphics.drawable.GradientDrawable
import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.data.model.DispatchLogEntry
import ch.fwvraura.vorstand.databinding.ItemDispatchLogBinding
import ch.fwvraura.vorstand.util.DateUtils

class DispatchLogAdapter : ListAdapter<DispatchLogEntry, DispatchLogAdapter.ViewHolder>(DiffCallback()) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemDispatchLogBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return ViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    class ViewHolder(private val binding: ItemDispatchLogBinding) : RecyclerView.ViewHolder(binding.root) {

        fun bind(entry: DispatchLogEntry) {
            binding.logRecipient.text = entry.memberName ?: "Unbekannt"
            binding.logSubject.text = entry.subject ?: ""
            binding.logDate.text = DateUtils.formatDateTime(entry.createdAt)

            // Type Icon
            val iconRes = when (entry.type) {
                "email" -> android.R.drawable.ic_dialog_email
                "letter", "pingen" -> android.R.drawable.ic_menu_send
                else -> android.R.drawable.ic_dialog_info
            }
            binding.logTypeIcon.setImageResource(iconRes)

            // Status Badge
            val statusText = when (entry.status) {
                "sent" -> "Gesendet"
                "failed" -> "Fehlgeschlagen"
                "pending" -> "Ausstehend"
                "delivered" -> "Zugestellt"
                else -> entry.status ?: ""
            }
            binding.logStatus.text = statusText

            val statusColor = when (entry.status) {
                "sent", "delivered" -> R.color.pingen_sent
                "failed" -> R.color.pingen_failed
                "pending" -> R.color.pingen_pending
                else -> R.color.text_hint
            }

            val bg = GradientDrawable()
            bg.cornerRadius = 12f * binding.root.context.resources.displayMetrics.density
            bg.setColor(ContextCompat.getColor(binding.root.context, statusColor))
            binding.logStatus.background = bg
        }
    }

    class DiffCallback : DiffUtil.ItemCallback<DispatchLogEntry>() {
        override fun areItemsTheSame(oldItem: DispatchLogEntry, newItem: DispatchLogEntry) =
            oldItem.id == newItem.id
        override fun areContentsTheSame(oldItem: DispatchLogEntry, newItem: DispatchLogEntry) =
            oldItem == newItem
    }
}
