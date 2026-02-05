package ch.fwvraura.vorstand.ui.registrations

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.vorstand.data.model.MemberRegistration
import ch.fwvraura.vorstand.databinding.ItemRegistrationBinding
import ch.fwvraura.vorstand.util.DateUtils

class RegistrationsAdapter(
    private val onApprove: (MemberRegistration) -> Unit,
    private val onReject: (MemberRegistration) -> Unit
) : ListAdapter<MemberRegistration, RegistrationsAdapter.ViewHolder>(DiffCallback()) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemRegistrationBinding.inflate(
            LayoutInflater.from(parent.context), parent, false
        )
        return ViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    inner class ViewHolder(
        private val binding: ItemRegistrationBinding
    ) : RecyclerView.ViewHolder(binding.root) {

        fun bind(reg: MemberRegistration) {
            binding.regName.text = reg.fullName
            binding.regEmail.text = reg.email ?: ""
            binding.regDate.text = DateUtils.formatDateTime(reg.createdAt)

            binding.btnApprove.setOnClickListener { onApprove(reg) }
            binding.btnReject.setOnClickListener { onReject(reg) }
        }
    }

    class DiffCallback : DiffUtil.ItemCallback<MemberRegistration>() {
        override fun areItemsTheSame(oldItem: MemberRegistration, newItem: MemberRegistration) =
            oldItem.id == newItem.id
        override fun areContentsTheSame(oldItem: MemberRegistration, newItem: MemberRegistration) =
            oldItem == newItem
    }
}
