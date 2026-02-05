package ch.fwvraura.vorstand.ui.audit

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.vorstand.data.model.AuditEntry
import ch.fwvraura.vorstand.databinding.ItemAuditBinding
import ch.fwvraura.vorstand.util.DateUtils

class AuditAdapter : ListAdapter<AuditEntry, AuditAdapter.ViewHolder>(DiffCallback()) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemAuditBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return ViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    class ViewHolder(private val binding: ItemAuditBinding) : RecyclerView.ViewHolder(binding.root) {
        fun bind(entry: AuditEntry) {
            binding.auditAction.text = entry.action
            binding.auditTime.text = DateUtils.formatDateTime(entry.createdAt)
            binding.auditUser.text = entry.userEmail ?: ""

            val details = entry.details?.toString()
            if (!details.isNullOrBlank() && details != "null") {
                binding.auditDetails.text = details
                binding.auditDetails.visibility = View.VISIBLE
            } else {
                binding.auditDetails.visibility = View.GONE
            }

            binding.root.setOnClickListener {
                binding.auditDetails.visibility =
                    if (binding.auditDetails.visibility == View.VISIBLE) View.GONE else View.VISIBLE
            }
        }
    }

    class DiffCallback : DiffUtil.ItemCallback<AuditEntry>() {
        override fun areItemsTheSame(oldItem: AuditEntry, newItem: AuditEntry) =
            oldItem.id == newItem.id && oldItem.createdAt == newItem.createdAt
        override fun areContentsTheSame(oldItem: AuditEntry, newItem: AuditEntry) =
            oldItem == newItem
    }
}
