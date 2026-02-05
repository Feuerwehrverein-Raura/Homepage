package ch.fwvraura.vorstand.ui.events

import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.data.model.Event
import ch.fwvraura.vorstand.databinding.ItemEventBinding
import ch.fwvraura.vorstand.util.DateUtils

/**
 * EventsAdapter – RecyclerView-Adapter fuer die Events-Liste.
 *
 * Erbt von ListAdapter mit DiffUtil fuer effiziente Listenaktualisierungen.
 * Zeigt pro Event: Datum, Titel, Ort, Status-Badge (farbig), Kategorie
 * und Schicht-Informationen (Anzahl Anmeldungen / Benoetigte Personen).
 *
 * @param onClick Callback fuer normalen Klick – navigiert zu den Anmeldungen
 * @param onEdit Callback fuer Long-Press – navigiert zum Bearbeitungsformular
 */
class EventsAdapter(
    private val onClick: (Event) -> Unit,
    private val onEdit: (Event) -> Unit
) : ListAdapter<Event, EventsAdapter.ViewHolder>(DiffCallback()) {

    /**
     * Erstellt einen neuen ViewHolder durch Inflaten des item_event Layouts.
     */
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemEventBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return ViewHolder(binding)
    }

    /**
     * Bindet die Daten eines Events an den ViewHolder an der gegebenen Position.
     */
    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    /**
     * ViewHolder fuer ein einzelnes Event-Item.
     * Enthaelt die Logik zum Binden der Event-Daten an die UI-Elemente.
     */
    inner class ViewHolder(private val binding: ItemEventBinding) : RecyclerView.ViewHolder(binding.root) {

        /**
         * Bindet die Daten eines Event-Objekts an die UI-Elemente.
         * Setzt Datum, Titel, Ort, Status-Badge, Kategorie und Schicht-Info.
         */
        fun bind(event: Event) {
            val context = binding.root.context

            // Grundlegende Event-Informationen setzen: Datum, Titel, Ort
            binding.eventDate.text = DateUtils.formatDate(event.startDate)
            binding.eventTitle.text = event.title
            binding.eventLocation.text = event.location ?: ""

            // ── Status-Badge ─────────────────────────────────────────────────
            // Zeigt den Event-Status als farbiges Badge an.
            // Status-Farben:
            //   planned   = blau  (info)     – Event ist geplant
            //   confirmed = gruen (success)  – Event ist bestaetigt
            //   cancelled = rot   (error)    – Event ist abgesagt
            //   completed = grau  (secondary)– Event ist abgeschlossen
            val status = event.status
            if (!status.isNullOrEmpty()) {
                // Mapping von englischem API-Status auf deutsche Anzeige und Farbressource
                val (label, colorRes) = when (status) {
                    "planned" -> "Geplant" to R.color.info
                    "confirmed" -> "Bestätigt" to R.color.success
                    "cancelled" -> "Abgesagt" to R.color.error
                    "completed" -> "Abgeschlossen" to R.color.text_secondary
                    else -> status.replaceFirstChar { it.uppercaseChar() } to R.color.text_secondary
                }
                binding.eventStatus.text = label
                binding.eventStatus.setTextColor(Color.WHITE)

                // GradientDrawable: Programmatisch erstellter gerundeter Hintergrund
                // fuer das Status-Badge. Setzt die Hintergrundfarbe und berechnet
                // den Eckenradius basierend auf der Bildschirmdichte (12dp).
                val badgeBackground = GradientDrawable().apply {
                    setColor(ContextCompat.getColor(context, colorRes))
                    cornerRadius = 12f * context.resources.displayMetrics.density
                }
                binding.eventStatus.background = badgeBackground
                binding.eventStatus.visibility = View.VISIBLE
            } else {
                // Kein Status vorhanden – Badge ausblenden
                binding.eventStatus.visibility = View.GONE
            }

            // ── Kategorie ────────────────────────────────────────────────────
            // Zeigt die Event-Kategorie an (z.B. "Dorffest", "Ausflug")
            // oder blendet das Feld aus wenn keine Kategorie gesetzt ist
            val category = event.category
            if (!category.isNullOrEmpty()) {
                binding.eventCategory.text = category
                binding.eventCategory.visibility = View.VISIBLE
            } else {
                binding.eventCategory.visibility = View.GONE
            }

            // ── Schicht- und Anmelde-Informationen ───────────────────────────
            // Berechnet und zeigt die Gesamtzahl der Anmeldungen und Schichten an.
            // Format: "X/Y Anmeldungen | Z Schicht(en)"
            // wobei X = genehmigte Anmeldungen, Y = benoetigte Personen, Z = Anzahl Schichten
            val shiftCount = event.shifts?.size ?: 0
            if (shiftCount > 0) {
                // Summe aller genehmigten Anmeldungen ueber alle Schichten
                val totalRegistered = event.shifts?.sumOf {
                    it.registrations?.approvedCount ?: it.registrations?.approved?.size ?: 0
                } ?: 0
                // Summe aller benoetigten Personen ueber alle Schichten
                val totalNeeded = event.shifts?.sumOf { it.needed ?: 0 } ?: 0

                // Plural-Behandlung: "1 Schicht" vs. "2 Schichten"
                val shiftText = "$shiftCount Schicht${if (shiftCount > 1) "en" else ""}"
                binding.eventShifts.text = if (totalNeeded > 0) {
                    "$totalRegistered/$totalNeeded Anmeldungen | $shiftText"
                } else {
                    shiftText
                }
                binding.eventShifts.visibility = View.VISIBLE
            } else {
                // Keine Schichten vorhanden – Schicht-Info ausblenden
                binding.eventShifts.visibility = View.GONE
            }

            // ── Click-Listener ───────────────────────────────────────────────
            // Normaler Klick: Navigiert zur Anmeldungsuebersicht
            binding.root.setOnClickListener { onClick(event) }
            // Long-Press: Navigiert zum Bearbeitungsformular
            binding.root.setOnLongClickListener {
                onEdit(event)
                true
            }
        }
    }

    /**
     * DiffCallback fuer effiziente Listenaktualisierungen.
     * Vergleicht Events anhand ihrer ID (areItemsTheSame) und
     * prueft ob sich der Inhalt geaendert hat (areContentsTheSame).
     */
    class DiffCallback : DiffUtil.ItemCallback<Event>() {
        override fun areItemsTheSame(oldItem: Event, newItem: Event) = oldItem.id == newItem.id
        override fun areContentsTheSame(oldItem: Event, newItem: Event) = oldItem == newItem
    }
}
