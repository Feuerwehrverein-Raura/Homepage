package ch.fwvraura.members.ui.events

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.members.R
import ch.fwvraura.members.data.model.Event
import ch.fwvraura.members.util.DateUtils

class EventsAdapter(
    private val onClick: (Event) -> Unit
) : ListAdapter<Event, EventsAdapter.VH>(DIFF) {

    inner class VH(view: View) : RecyclerView.ViewHolder(view) {
        val title: TextView = view.findViewById(R.id.eventTitle)
        val date: TextView = view.findViewById(R.id.eventDate)
        val location: TextView = view.findViewById(R.id.eventLocation)
        val description: TextView = view.findViewById(R.id.eventDescription)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val v = LayoutInflater.from(parent.context).inflate(R.layout.item_event, parent, false)
        return VH(v)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val e = getItem(position)
        holder.title.text = e.title
        holder.date.text = DateUtils.formatLong(e.startDate).ifBlank { DateUtils.formatDate(e.startDate) }
        holder.location.text = e.location.orEmpty()
        holder.location.visibility = if (e.location.isNullOrBlank()) View.GONE else View.VISIBLE
        holder.description.text = e.description.orEmpty()
        holder.description.visibility = if (e.description.isNullOrBlank()) View.GONE else View.VISIBLE
        holder.itemView.setOnClickListener { onClick(e) }
    }

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<Event>() {
            override fun areItemsTheSame(o: Event, n: Event) = o.id == n.id
            override fun areContentsTheSame(o: Event, n: Event) = o == n
        }
    }
}
