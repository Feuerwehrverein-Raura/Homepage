package ch.fwvraura.vorstand.ui.mailcow

import android.graphics.drawable.GradientDrawable
import android.view.LayoutInflater
import android.view.ViewGroup
import android.widget.PopupMenu
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.data.model.Mailbox
import ch.fwvraura.vorstand.databinding.ItemMailboxBinding

class MailboxesAdapter(
    private val onEdit: (Mailbox) -> Unit,
    private val onDelete: (Mailbox) -> Unit
) : ListAdapter<Mailbox, MailboxesAdapter.ViewHolder>(DiffCallback()) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemMailboxBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return ViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    inner class ViewHolder(private val binding: ItemMailboxBinding) : RecyclerView.ViewHolder(binding.root) {

        fun bind(mailbox: Mailbox) {
            val ctx = binding.root.context
            binding.username.text = mailbox.username
            binding.displayName.text = mailbox.name ?: ""

            // Status badge
            val isActive = mailbox.active == 1
            binding.statusBadge.text = if (isActive) ctx.getString(R.string.mailcow_active) else ctx.getString(R.string.mailcow_inactive)
            val badgeColor = if (isActive) R.color.status_aktiv else R.color.on_surface_variant
            val badgeBg = if (isActive) R.color.status_aktiv_bg else R.color.surface_variant
            binding.statusBadge.setTextColor(ContextCompat.getColor(ctx, badgeColor))
            val bg = GradientDrawable().apply {
                setColor(ContextCompat.getColor(ctx, badgeBg))
                cornerRadius = 12f * ctx.resources.displayMetrics.density
            }
            binding.statusBadge.background = bg

            // Quota bar
            val totalMb = mailbox.quota / (1024 * 1024)
            val usedMb = mailbox.quotaUsed / (1024 * 1024)
            val percent = if (totalMb > 0) ((usedMb * 100) / totalMb).toInt().coerceIn(0, 100) else 0
            binding.quotaBar.progress = percent
            binding.quotaText.text = "${usedMb} MB / ${totalMb} MB"

            val quotaColor = when {
                percent > 90 -> ContextCompat.getColor(ctx, R.color.error)
                percent > 70 -> ContextCompat.getColor(ctx, R.color.warning)
                else -> ContextCompat.getColor(ctx, R.color.success)
            }
            binding.quotaBar.setIndicatorColor(quotaColor)

            // Click handlers
            binding.root.setOnClickListener { onEdit(mailbox) }
            binding.btnMenu.setOnClickListener { view ->
                PopupMenu(ctx, view).apply {
                    menu.add(ctx.getString(R.string.mailcow_edit_mailbox))
                    menu.add(ctx.getString(R.string.mailcow_delete_mailbox))
                    setOnMenuItemClickListener { item ->
                        when (item.title) {
                            ctx.getString(R.string.mailcow_edit_mailbox) -> onEdit(mailbox)
                            ctx.getString(R.string.mailcow_delete_mailbox) -> onDelete(mailbox)
                        }
                        true
                    }
                    show()
                }
            }
        }
    }

    class DiffCallback : DiffUtil.ItemCallback<Mailbox>() {
        override fun areItemsTheSame(oldItem: Mailbox, newItem: Mailbox) =
            oldItem.username == newItem.username
        override fun areContentsTheSame(oldItem: Mailbox, newItem: Mailbox) =
            oldItem == newItem
    }
}
