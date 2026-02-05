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
import ch.fwvraura.vorstand.data.model.MailAlias
import ch.fwvraura.vorstand.databinding.ItemAliasBinding

class AliasesAdapter(
    private val onEdit: (MailAlias) -> Unit,
    private val onDelete: (MailAlias) -> Unit
) : ListAdapter<MailAlias, AliasesAdapter.ViewHolder>(DiffCallback()) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemAliasBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return ViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    inner class ViewHolder(private val binding: ItemAliasBinding) : RecyclerView.ViewHolder(binding.root) {

        fun bind(alias: MailAlias) {
            val ctx = binding.root.context
            binding.address.text = alias.address
            binding.gotoAddresses.text = alias.goto.replace(",", ", ")

            val isActive = alias.active == 1
            binding.statusBadge.text = if (isActive) ctx.getString(R.string.mailcow_active) else ctx.getString(R.string.mailcow_inactive)
            val badgeColor = if (isActive) R.color.status_aktiv else R.color.on_surface_variant
            val badgeBg = if (isActive) R.color.status_aktiv_bg else R.color.surface_variant
            binding.statusBadge.setTextColor(ContextCompat.getColor(ctx, badgeColor))
            val bg = GradientDrawable().apply {
                setColor(ContextCompat.getColor(ctx, badgeBg))
                cornerRadius = 12f * ctx.resources.displayMetrics.density
            }
            binding.statusBadge.background = bg

            binding.root.setOnClickListener { onEdit(alias) }
            binding.btnMenu.setOnClickListener { view ->
                PopupMenu(ctx, view).apply {
                    menu.add(ctx.getString(R.string.mailcow_edit_alias))
                    menu.add(ctx.getString(R.string.mailcow_delete_alias))
                    setOnMenuItemClickListener { item ->
                        when (item.title) {
                            ctx.getString(R.string.mailcow_edit_alias) -> onEdit(alias)
                            ctx.getString(R.string.mailcow_delete_alias) -> onDelete(alias)
                        }
                        true
                    }
                    show()
                }
            }
        }
    }

    class DiffCallback : DiffUtil.ItemCallback<MailAlias>() {
        override fun areItemsTheSame(oldItem: MailAlias, newItem: MailAlias) =
            oldItem.id == newItem.id
        override fun areContentsTheSame(oldItem: MailAlias, newItem: MailAlias) =
            oldItem == newItem
    }
}
