package ch.fwvraura.vorstand.ui.dispatch

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.vorstand.data.model.EmailTemplate
import ch.fwvraura.vorstand.databinding.ItemTemplateBinding

class TemplatesAdapter(
    private val onClick: (EmailTemplate) -> Unit
) : ListAdapter<EmailTemplate, TemplatesAdapter.ViewHolder>(DiffCallback()) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemTemplateBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return ViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    inner class ViewHolder(private val binding: ItemTemplateBinding) : RecyclerView.ViewHolder(binding.root) {

        fun bind(template: EmailTemplate) {
            binding.templateName.text = template.name
            binding.templateType.text = template.type ?: "E-Mail"
            binding.templateSubject.text = template.subject ?: ""

            binding.root.setOnClickListener { onClick(template) }
        }
    }

    class DiffCallback : DiffUtil.ItemCallback<EmailTemplate>() {
        override fun areItemsTheSame(oldItem: EmailTemplate, newItem: EmailTemplate) =
            oldItem.id == newItem.id
        override fun areContentsTheSame(oldItem: EmailTemplate, newItem: EmailTemplate) =
            oldItem == newItem
    }
}
