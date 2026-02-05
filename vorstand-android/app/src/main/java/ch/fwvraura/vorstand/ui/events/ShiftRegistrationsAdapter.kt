package ch.fwvraura.vorstand.ui.events

import android.graphics.Color
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.vorstand.data.model.EventRegistration
import ch.fwvraura.vorstand.databinding.ItemShiftRegistrationBinding

class ShiftRegistrationsAdapter(
    private val registrations: List<EventRegistration>,
    private val onApprove: (EventRegistration) -> Unit = {},
    private val onReject: (EventRegistration) -> Unit = {}
) : RecyclerView.Adapter<ShiftRegistrationsAdapter.ViewHolder>() {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemShiftRegistrationBinding.inflate(
            LayoutInflater.from(parent.context), parent, false
        )
        return ViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val reg = registrations[position]
        holder.name.text = reg.displayName

        val isPending = reg.status == "pending"
        val isApproved = reg.status == "approved"

        holder.status.text = when (reg.status) {
            "approved" -> "Genehmigt"
            "pending" -> "Ausstehend"
            else -> reg.status ?: "Ausstehend"
        }

        holder.status.setTextColor(
            when {
                isApproved -> Color.parseColor("#10B981")
                isPending -> Color.parseColor("#F59E0B")
                else -> Color.parseColor("#6B7280")
            }
        )

        holder.btnApprove.visibility = if (isPending) View.VISIBLE else View.GONE
        holder.btnReject.visibility = if (isPending) View.VISIBLE else View.GONE

        holder.btnApprove.setOnClickListener { onApprove(reg) }
        holder.btnReject.setOnClickListener { onReject(reg) }
    }

    override fun getItemCount() = registrations.size

    class ViewHolder(binding: ItemShiftRegistrationBinding) : RecyclerView.ViewHolder(binding.root) {
        val name: TextView = binding.regName
        val status: TextView = binding.regStatus
        val btnApprove: View = binding.btnApprove
        val btnReject: View = binding.btnReject
    }
}
