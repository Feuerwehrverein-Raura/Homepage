package ch.fwvraura.members.ui.organizer

import android.graphics.Color
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.members.R
import ch.fwvraura.members.data.model.EventRegistration
import com.google.android.material.button.MaterialButton

class RegistrationsAdapter(
    private val onApprove: (EventRegistration) -> Unit,
    private val onReject: (EventRegistration) -> Unit
) : ListAdapter<EventRegistration, RegistrationsAdapter.VH>(DIFF) {

    inner class VH(view: View) : RecyclerView.ViewHolder(view) {
        val name: TextView = view.findViewById(R.id.regName)
        val status: TextView = view.findViewById(R.id.regStatus)
        val meta: TextView = view.findViewById(R.id.regMeta)
        val actions: LinearLayout = view.findViewById(R.id.regActions)
        val btnApprove: MaterialButton = view.findViewById(R.id.btnApprove)
        val btnReject: MaterialButton = view.findViewById(R.id.btnReject)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val v = LayoutInflater.from(parent.context).inflate(R.layout.item_registration, parent, false)
        return VH(v)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val r = getItem(position)
        val displayName = listOfNotNull(r.memberVorname, r.memberNachname)
            .joinToString(" ")
            .ifBlank { r.guestName ?: "(unbekannt)" }
        holder.name.text = displayName

        val statusLabel = when (r.status) {
            "approved" -> "Genehmigt"
            "rejected" -> "Abgelehnt"
            "pending" -> "Offen"
            else -> r.status ?: ""
        }
        holder.status.text = statusLabel
        holder.status.setTextColor(when (r.status) {
            "approved" -> Color.parseColor("#0F7A2D")
            "rejected" -> Color.parseColor("#B91C1C")
            "pending" -> Color.parseColor("#A05A00")
            else -> Color.parseColor("#4B5563")
        })

        val metaParts = mutableListOf<String>()
        r.guestEmail?.let { metaParts.add(it) }
        r.parsedNotes?.phone?.let { metaParts.add(it) }
        r.parsedNotes?.participants?.let { metaParts.add("Personen: $it") }
        r.parsedNotes?.allergies?.takeIf { it.isNotBlank() }?.let { metaParts.add("Allergien: $it") }
        r.parsedNotes?.notes?.takeIf { it.isNotBlank() }?.let { metaParts.add(it) }
        holder.meta.text = metaParts.joinToString("\n")
        holder.meta.visibility = if (metaParts.isEmpty()) View.GONE else View.VISIBLE

        if (r.status == "pending") {
            holder.actions.visibility = View.VISIBLE
            holder.btnApprove.setOnClickListener { onApprove(r) }
            holder.btnReject.setOnClickListener { onReject(r) }
        } else {
            holder.actions.visibility = View.GONE
        }
    }

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<EventRegistration>() {
            override fun areItemsTheSame(o: EventRegistration, n: EventRegistration) = o.id == n.id
            override fun areContentsTheSame(o: EventRegistration, n: EventRegistration) = o == n
        }
    }
}
