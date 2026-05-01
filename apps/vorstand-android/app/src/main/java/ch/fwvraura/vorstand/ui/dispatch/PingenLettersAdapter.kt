package ch.fwvraura.vorstand.ui.dispatch

import android.graphics.drawable.GradientDrawable
import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.data.model.PingenLetter
import ch.fwvraura.vorstand.databinding.ItemPingenLetterBinding
import ch.fwvraura.vorstand.util.DateUtils

class PingenLettersAdapter(
    private val onCheckStatus: (PingenLetter) -> Unit
) : ListAdapter<PingenLetter, PingenLettersAdapter.ViewHolder>(DiffCallback()) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemPingenLetterBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return ViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    inner class ViewHolder(private val binding: ItemPingenLetterBinding) : RecyclerView.ViewHolder(binding.root) {

        fun bind(letter: PingenLetter) {
            binding.letterRecipient.text = letter.memberName ?: "Unbekannt"
            binding.letterSubject.text = letter.subject ?: ""
            binding.letterEvent.text = letter.eventTitle ?: ""
            binding.letterDate.text = DateUtils.formatDateTime(letter.createdAt)

            // Status Badge
            val statusText = when (letter.status) {
                "sent" -> "Gesendet"
                "pending", "processing" -> "In Bearbeitung"
                "failed" -> "Fehlgeschlagen"
                "delivered" -> "Zugestellt"
                else -> letter.status ?: "Unbekannt"
            }
            binding.letterStatus.text = statusText

            val statusColor = when (letter.status) {
                "sent", "delivered" -> R.color.pingen_sent
                "pending", "processing" -> R.color.pingen_pending
                "failed" -> R.color.pingen_failed
                else -> R.color.text_hint
            }

            val bg = GradientDrawable()
            bg.cornerRadius = 12f * binding.root.context.resources.displayMetrics.density
            bg.setColor(ContextCompat.getColor(binding.root.context, statusColor))
            binding.letterStatus.background = bg

            binding.checkStatusButton.setOnClickListener {
                onCheckStatus(letter)
            }
        }
    }

    class DiffCallback : DiffUtil.ItemCallback<PingenLetter>() {
        override fun areItemsTheSame(oldItem: PingenLetter, newItem: PingenLetter) =
            oldItem.id == newItem.id
        override fun areContentsTheSame(oldItem: PingenLetter, newItem: PingenLetter) =
            oldItem == newItem
    }
}
