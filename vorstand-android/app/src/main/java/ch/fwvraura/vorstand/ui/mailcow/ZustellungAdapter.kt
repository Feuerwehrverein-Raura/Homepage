package ch.fwvraura.vorstand.ui.mailcow

import android.graphics.drawable.GradientDrawable
import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.data.model.ZustellungMember
import ch.fwvraura.vorstand.databinding.ItemZustellungMemberBinding

class ZustellungAdapter : ListAdapter<ZustellungMember, ZustellungAdapter.ViewHolder>(DiffCallback()) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemZustellungMemberBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return ViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    inner class ViewHolder(private val binding: ItemZustellungMemberBinding) : RecyclerView.ViewHolder(binding.root) {

        fun bind(member: ZustellungMember) {
            val ctx = binding.root.context
            binding.memberName.text = member.fullName
            binding.memberEmail.text = member.email ?: ""

            val status = member.status ?: ""
            binding.statusChip.text = status

            val (textColor, bgColor) = when (status.lowercase()) {
                "aktiv" -> R.color.status_aktiv to R.color.status_aktiv_bg
                "passiv" -> R.color.status_passiv to R.color.status_passiv_bg
                "ehren", "ehrenmitglied" -> R.color.status_ehren to R.color.status_ehren_bg
                else -> R.color.on_surface_variant to R.color.surface_variant
            }
            binding.statusChip.setTextColor(ContextCompat.getColor(ctx, textColor))
            val bg = GradientDrawable().apply {
                setColor(ContextCompat.getColor(ctx, bgColor))
                cornerRadius = 12f * ctx.resources.displayMetrics.density
            }
            binding.statusChip.background = bg
        }
    }

    class DiffCallback : DiffUtil.ItemCallback<ZustellungMember>() {
        override fun areItemsTheSame(oldItem: ZustellungMember, newItem: ZustellungMember) =
            oldItem.id == newItem.id
        override fun areContentsTheSame(oldItem: ZustellungMember, newItem: ZustellungMember) =
            oldItem == newItem
    }
}
