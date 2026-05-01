package ch.fwvraura.vorstand.ui.dispatch

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.vorstand.databinding.ItemPingenStatBinding

class PingenStatsAdapter(
    private val items: List<Pair<String, String>>
) : RecyclerView.Adapter<PingenStatsAdapter.ViewHolder>() {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemPingenStatBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return ViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val (value, label) = items[position]
        holder.binding.statValue.text = value
        holder.binding.statLabel.text = label
    }

    override fun getItemCount() = items.size

    class ViewHolder(val binding: ItemPingenStatBinding) : RecyclerView.ViewHolder(binding.root)
}
