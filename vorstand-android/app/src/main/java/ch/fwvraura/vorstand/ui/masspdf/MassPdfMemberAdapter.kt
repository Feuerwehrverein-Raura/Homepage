package ch.fwvraura.vorstand.ui.masspdf

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.vorstand.data.model.PostMember
import ch.fwvraura.vorstand.databinding.ItemMassPdfMemberBinding

/**
 * Adapter fuer die Mitglieder-Auswahl beim Massen-PDF-Versand.
 *
 * Zeigt Mitglieder mit Post-Zustellung und ermoeglicht die Auswahl
 * einzelner Empfaenger per Checkbox.
 */
class MassPdfMemberAdapter(
    private val onMemberToggle: (String) -> Unit
) : ListAdapter<MassPdfMemberAdapter.SelectableMember, MassPdfMemberAdapter.ViewHolder>(DiffCallback) {

    data class SelectableMember(
        val member: PostMember,
        val isSelected: Boolean
    )

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemMassPdfMemberBinding.inflate(
            LayoutInflater.from(parent.context),
            parent,
            false
        )
        return ViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val item = getItem(position)
        holder.bind(item)
    }

    inner class ViewHolder(
        private val binding: ItemMassPdfMemberBinding
    ) : RecyclerView.ViewHolder(binding.root) {

        fun bind(item: SelectableMember) {
            val member = item.member

            binding.nameText.text = member.name

            // Adresse formatieren
            val address = buildString {
                member.strasse?.let { append(it) }
                if (member.plz != null || member.ort != null) {
                    if (isNotEmpty()) append(", ")
                    member.plz?.let { append(it) }
                    member.ort?.let {
                        if (member.plz != null) append(" ")
                        append(it)
                    }
                }
            }
            binding.addressText.text = address.ifEmpty { member.address ?: "Keine Adresse" }

            binding.checkbox.isChecked = item.isSelected

            // Klick auf die ganze Karte schaltet die Checkbox um
            binding.root.setOnClickListener {
                onMemberToggle(member.id)
            }
        }
    }

    object DiffCallback : DiffUtil.ItemCallback<SelectableMember>() {
        override fun areItemsTheSame(oldItem: SelectableMember, newItem: SelectableMember): Boolean {
            return oldItem.member.id == newItem.member.id
        }

        override fun areContentsTheSame(oldItem: SelectableMember, newItem: SelectableMember): Boolean {
            return oldItem == newItem
        }
    }
}
