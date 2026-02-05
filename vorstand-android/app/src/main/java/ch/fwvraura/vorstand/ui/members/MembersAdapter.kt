package ch.fwvraura.vorstand.ui.members

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.data.model.Member
import ch.fwvraura.vorstand.databinding.ItemMemberBinding
import coil.load
import coil.transform.CircleCropTransformation

class MembersAdapter(
    private val onClick: (Member) -> Unit
) : ListAdapter<Member, MembersAdapter.ViewHolder>(DiffCallback()) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemMemberBinding.inflate(
            LayoutInflater.from(parent.context), parent, false
        )
        return ViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    inner class ViewHolder(
        private val binding: ItemMemberBinding
    ) : RecyclerView.ViewHolder(binding.root) {

        fun bind(member: Member) {
            binding.memberName.text = member.fullName
            binding.memberEmail.text = member.email ?: ""

            // Function
            if (!member.funktion.isNullOrBlank()) {
                binding.memberFunction.text = member.funktion
                binding.memberFunction.visibility = View.VISIBLE
            } else {
                binding.memberFunction.visibility = View.GONE
            }

            // Status chip
            binding.memberStatus.text = member.status ?: "Aktiv"
            val context = binding.root.context
            when (member.status?.lowercase()) {
                "aktiv" -> {
                    binding.memberStatus.setChipBackgroundColorResource(R.color.status_aktiv_bg)
                    binding.memberStatus.setTextColor(context.getColor(R.color.status_aktiv))
                }
                "passiv" -> {
                    binding.memberStatus.setChipBackgroundColorResource(R.color.status_passiv_bg)
                    binding.memberStatus.setTextColor(context.getColor(R.color.status_passiv))
                }
                "ehren", "ehrenmitglied" -> {
                    binding.memberStatus.setChipBackgroundColorResource(R.color.status_ehren_bg)
                    binding.memberStatus.setTextColor(context.getColor(R.color.status_ehren))
                }
            }

            // Avatar
            if (!member.photoUrl.isNullOrEmpty()) {
                binding.memberAvatar.load("https://api.fwv-raura.ch${member.photoUrl}") {
                    transformations(CircleCropTransformation())
                    placeholder(R.drawable.circle_background)
                }
            } else {
                binding.memberAvatar.setImageResource(R.drawable.circle_background)
            }

            binding.root.setOnClickListener { onClick(member) }
        }
    }

    class DiffCallback : DiffUtil.ItemCallback<Member>() {
        override fun areItemsTheSame(oldItem: Member, newItem: Member) = oldItem.id == newItem.id
        override fun areContentsTheSame(oldItem: Member, newItem: Member) = oldItem == newItem
    }
}
