package ch.fwvraura.vorstand.ui.whitelist

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.data.model.WhitelistEntry
import ch.fwvraura.vorstand.databinding.ItemWhitelistEntryBinding
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

/**
 * Adapter für die Whitelist-Einträge RecyclerView.
 */
class WhitelistAdapter(
    private val onDeleteClick: (WhitelistEntry) -> Unit
) : ListAdapter<WhitelistEntry, WhitelistAdapter.ViewHolder>(DiffCallback) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemWhitelistEntryBinding.inflate(
            LayoutInflater.from(parent.context), parent, false
        )
        return ViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    inner class ViewHolder(
        private val binding: ItemWhitelistEntryBinding
    ) : RecyclerView.ViewHolder(binding.root) {

        fun bind(entry: WhitelistEntry) {
            val context = binding.root.context

            binding.ipAddress.text = entry.ipAddress
            binding.deviceName.text = entry.deviceName ?: "Unbekanntes Gerät"

            // Status Icon und Ablaufzeit
            if (entry.isPermanent || entry.expiresAt == null) {
                binding.statusIcon.setImageResource(R.drawable.ic_check_circle)
                binding.statusIcon.setColorFilter(ContextCompat.getColor(context, R.color.success))
                binding.expiresText.text = context.getString(R.string.whitelist_permanent)
            } else {
                // Prüfe ob abgelaufen
                val expiresAt = try {
                    ZonedDateTime.parse(entry.expiresAt)
                } catch (e: Exception) {
                    null
                }

                if (expiresAt != null && expiresAt.isBefore(ZonedDateTime.now())) {
                    // Abgelaufen
                    binding.statusIcon.setImageResource(R.drawable.ic_block)
                    binding.statusIcon.setColorFilter(ContextCompat.getColor(context, R.color.error))
                    binding.expiresText.text = "Abgelaufen"
                } else {
                    // Noch gültig
                    binding.statusIcon.setImageResource(R.drawable.ic_check_circle)
                    binding.statusIcon.setColorFilter(ContextCompat.getColor(context, R.color.warning))

                    val formatted = expiresAt?.let {
                        val formatter = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm")
                        context.getString(R.string.whitelist_expires, it.format(formatter))
                    } ?: context.getString(R.string.whitelist_temporary)

                    binding.expiresText.text = formatted
                }
            }

            binding.btnDelete.setOnClickListener {
                onDeleteClick(entry)
            }
        }
    }

    companion object DiffCallback : DiffUtil.ItemCallback<WhitelistEntry>() {
        override fun areItemsTheSame(oldItem: WhitelistEntry, newItem: WhitelistEntry): Boolean {
            return oldItem.id == newItem.id
        }

        override fun areContentsTheSame(oldItem: WhitelistEntry, newItem: WhitelistEntry): Boolean {
            return oldItem == newItem
        }
    }
}
