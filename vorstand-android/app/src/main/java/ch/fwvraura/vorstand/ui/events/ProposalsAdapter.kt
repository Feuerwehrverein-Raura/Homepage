package ch.fwvraura.vorstand.ui.events

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.vorstand.data.model.Event
import ch.fwvraura.vorstand.databinding.ItemEventProposalBinding
import ch.fwvraura.vorstand.util.DateUtils

/**
 * ProposalsAdapter – RecyclerView-Adapter fuer die Event-Vorschlaege.
 *
 * Zeigt die von Mitgliedern eingereichten Vorschlaege (status == "proposed")
 * in der Vorschlags-Sektion oberhalb der Events-Liste an. Pro Vorschlag werden
 * Titel, Datum (mit Uhrzeit), Ort und der Vorschlagende angezeigt sowie drei
 * Aktionen angeboten.
 *
 * Aufbau analog zu [EventsAdapter] (ListAdapter mit DiffUtil), jedoch mit
 * eigenem Item-Layout und drei Aktions-Callbacks statt Klick/Long-Press.
 *
 * @param onApprove Callback fuer "Genehmigen" – setzt den Status auf "planned"
 * @param onEdit Callback fuer "Bearbeiten" – oeffnet das Bearbeitungsformular
 * @param onReject Callback fuer "Ablehnen" – loescht den Vorschlag (nach Rueckfrage)
 */
class ProposalsAdapter(
    private val onApprove: (Event) -> Unit,
    private val onEdit: (Event) -> Unit,
    private val onReject: (Event) -> Unit
) : ListAdapter<Event, ProposalsAdapter.ViewHolder>(DiffCallback()) {

    /**
     * Erstellt einen neuen ViewHolder durch Inflaten des item_event_proposal Layouts.
     */
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemEventProposalBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return ViewHolder(binding)
    }

    /**
     * Bindet die Daten eines Vorschlags an den ViewHolder an der gegebenen Position.
     */
    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    /**
     * ViewHolder fuer einen einzelnen Vorschlag.
     */
    inner class ViewHolder(private val binding: ItemEventProposalBinding) : RecyclerView.ViewHolder(binding.root) {

        /**
         * Bindet die Daten eines Vorschlags an die UI-Elemente und setzt die
         * Listener der drei Aktions-Buttons.
         */
        fun bind(event: Event) {
            // Titel und Datum (mit Uhrzeit, formatDateTime) setzen
            binding.proposalTitle.text = event.title
            binding.proposalDate.text = DateUtils.formatDateTime(event.startDate)

            // Ort nur anzeigen, wenn vorhanden
            val location = event.location
            if (!location.isNullOrBlank()) {
                binding.proposalLocation.text = location
                binding.proposalLocation.visibility = View.VISIBLE
            } else {
                binding.proposalLocation.visibility = View.GONE
            }

            // Vorschlagenden (voreingestellter Organisator) aus Vor-/Nachname bauen.
            // Falls diese leer sind, auf organizer_name bzw. organizer_email
            // zurueckfallen, damit immer eine sinnvolle Angabe erscheint.
            val proposer = listOfNotNull(event.organizerVorname, event.organizerNachname)
                .filter { it.isNotBlank() }
                .joinToString(" ")
                .ifBlank { event.organizerName ?: event.organizerEmail ?: "Unbekannt" }
            binding.proposalProposer.text = "Vorschlag von $proposer"

            // Aktions-Buttons: Genehmigen, Bearbeiten, Ablehnen
            binding.btnApprove.setOnClickListener { onApprove(event) }
            binding.btnEdit.setOnClickListener { onEdit(event) }
            binding.btnReject.setOnClickListener { onReject(event) }
        }
    }

    /**
     * DiffCallback fuer effiziente Listenaktualisierungen.
     * Vergleicht Vorschlaege anhand ihrer ID und prueft den Inhalt auf Gleichheit.
     */
    class DiffCallback : DiffUtil.ItemCallback<Event>() {
        override fun areItemsTheSame(oldItem: Event, newItem: Event) = oldItem.id == newItem.id
        override fun areContentsTheSame(oldItem: Event, newItem: Event) = oldItem == newItem
    }
}
