package ch.fwvraura.vorstand.ui.vault

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.data.model.DecryptedVaultItem
import ch.fwvraura.vorstand.databinding.ItemVaultBinding

class VaultAdapter(
    private val onCopy: (DecryptedVaultItem) -> Unit,
    private val onItemClick: (DecryptedVaultItem) -> Unit
) : ListAdapter<DecryptedVaultItem, VaultAdapter.ViewHolder>(DIFF) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemVaultBinding.inflate(
            LayoutInflater.from(parent.context), parent, false
        )
        return ViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    inner class ViewHolder(
        private val binding: ItemVaultBinding
    ) : RecyclerView.ViewHolder(binding.root) {

        fun bind(item: DecryptedVaultItem) {
            binding.itemName.text = item.name

            if (!item.subtitle.isNullOrBlank()) {
                binding.itemSubtitle.text = item.subtitle
                binding.itemSubtitle.visibility = View.VISIBLE
            } else {
                binding.itemSubtitle.visibility = View.GONE
            }

            if (!item.details.isNullOrBlank()) {
                binding.itemDetails.text = item.details
                binding.itemDetails.visibility = View.VISIBLE
            } else {
                binding.itemDetails.visibility = View.GONE
            }

            val ctx = binding.root.context
            val (iconRes, tintColor) = when (item.type) {
                DecryptedVaultItem.TYPE_LOGIN -> R.drawable.ic_lock to R.color.primary
                DecryptedVaultItem.TYPE_SECURE_NOTE -> R.drawable.ic_note to R.color.text_secondary
                DecryptedVaultItem.TYPE_CARD -> R.drawable.ic_credit_card to R.color.warning
                DecryptedVaultItem.TYPE_IDENTITY -> R.drawable.ic_person to R.color.success
                else -> R.drawable.ic_lock to R.color.primary
            }
            binding.typeIcon.setImageResource(iconRes)
            binding.typeIcon.setColorFilter(ContextCompat.getColor(ctx, tintColor))

            val hasCopyFields = item.copyFields.isNotEmpty()
            binding.btnCopy.visibility = if (hasCopyFields) View.VISIBLE else View.GONE
            binding.btnCopy.setOnClickListener { onCopy(item) }

            binding.root.setOnClickListener { onItemClick(item) }
        }
    }

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<DecryptedVaultItem>() {
            override fun areItemsTheSame(a: DecryptedVaultItem, b: DecryptedVaultItem) = a.id == b.id
            override fun areContentsTheSame(a: DecryptedVaultItem, b: DecryptedVaultItem) = a == b
        }
    }
}
