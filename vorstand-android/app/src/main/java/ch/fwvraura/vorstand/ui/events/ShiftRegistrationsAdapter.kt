package ch.fwvraura.vorstand.ui.events

import android.view.LayoutInflater
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.vorstand.data.model.EventRegistration
import ch.fwvraura.vorstand.databinding.ItemShiftRegistrationBinding

class ShiftRegistrationsAdapter(
    private val registrations: List<EventRegistration>
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
        holder.status.text = reg.status ?: "pending"
    }

    override fun getItemCount() = registrations.size

    class ViewHolder(binding: ItemShiftRegistrationBinding) : RecyclerView.ViewHolder(binding.root) {
        val name: TextView = binding.regName
        val status: TextView = binding.regStatus
    }
}
