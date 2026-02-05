package ch.fwvraura.vorstand.ui.registrations

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.vorstand.data.model.MemberRegistration
import ch.fwvraura.vorstand.databinding.ItemRegistrationBinding
import ch.fwvraura.vorstand.util.DateUtils

/**
 * RegistrationsAdapter - RecyclerView-Adapter fuer die Darstellung von Mitgliedschaftsantraegen.
 *
 * Erbt von ListAdapter, der intern DiffUtil verwendet, um nur geaenderte Eintraege
 * in der RecyclerView zu aktualisieren (effizientes UI-Update).
 * Jeder Eintrag zeigt den vollstaendigen Namen, die E-Mail-Adresse und das Antragsdatum an.
 * Zusaetzlich werden Approve- und Reject-Buttons pro Eintrag angezeigt.
 *
 * @param onApprove Callback-Funktion, die aufgerufen wird, wenn der "Genehmigen"-Button gedrueckt wird.
 * @param onReject Callback-Funktion, die aufgerufen wird, wenn der "Ablehnen"-Button gedrueckt wird.
 */
class RegistrationsAdapter(
    private val onApprove: (MemberRegistration) -> Unit,
    private val onReject: (MemberRegistration) -> Unit
) : ListAdapter<MemberRegistration, RegistrationsAdapter.ViewHolder>(DiffCallback()) {

    /**
     * Erstellt einen neuen ViewHolder fuer einen Mitgliedschaftsantrag.
     * Inflated das Item-Layout (ItemRegistrationBinding) und gibt einen ViewHolder zurueck.
     */
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemRegistrationBinding.inflate(
            LayoutInflater.from(parent.context), parent, false
        )
        return ViewHolder(binding)
    }

    /**
     * Bindet die Daten eines Mitgliedschaftsantrags an den ViewHolder an der gegebenen Position.
     * Delegiert die eigentliche Datenbindung an die bind()-Methode des ViewHolders.
     */
    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    /**
     * ViewHolder fuer einen einzelnen Mitgliedschaftsantrag.
     *
     * Ist eine "inner class", damit er Zugriff auf die onApprove- und onReject-Callbacks
     * der aeusseren Adapter-Klasse hat.
     */
    inner class ViewHolder(
        private val binding: ItemRegistrationBinding
    ) : RecyclerView.ViewHolder(binding.root) {

        /**
         * Bindet eine MemberRegistration an die UI-Elemente.
         *
         * - Setzt den vollstaendigen Namen des Antragstellers.
         * - Zeigt die E-Mail-Adresse an (leer, falls nicht vorhanden).
         * - Formatiert und zeigt das Antragsdatum an (ueber DateUtils-Hilfsfunktion).
         * - Verbindet den "Genehmigen"-Button mit dem onApprove-Callback.
         * - Verbindet den "Ablehnen"-Button mit dem onReject-Callback.
         *
         * @param reg Der anzuzeigende Mitgliedschaftsantrag.
         */
        fun bind(reg: MemberRegistration) {
            // Name des Antragstellers anzeigen
            binding.regName.text = reg.fullName

            // E-Mail-Adresse anzeigen (leer, falls null)
            binding.regEmail.text = reg.email ?: ""

            // Antragsdatum formatiert anzeigen
            binding.regDate.text = DateUtils.formatDateTime(reg.createdAt)

            // "Genehmigen"-Button: ruft den onApprove-Callback mit dem Antrag auf
            binding.btnApprove.setOnClickListener { onApprove(reg) }

            // "Ablehnen"-Button: ruft den onReject-Callback mit dem Antrag auf
            binding.btnReject.setOnClickListener { onReject(reg) }
        }
    }

    /**
     * DiffCallback - Vergleicht zwei MemberRegistration-Objekte fuer effiziente RecyclerView-Updates.
     *
     * areItemsTheSame: Prueft ob es sich um denselben Antrag handelt (gleiche ID).
     * areContentsTheSame: Prueft ob der Inhalt identisch ist (Data-Class equals-Vergleich).
     * Wird von ListAdapter verwendet, um nur tatsaechlich geaenderte Eintraege neu zu rendern.
     */
    class DiffCallback : DiffUtil.ItemCallback<MemberRegistration>() {
        override fun areItemsTheSame(oldItem: MemberRegistration, newItem: MemberRegistration) =
            oldItem.id == newItem.id
        override fun areContentsTheSame(oldItem: MemberRegistration, newItem: MemberRegistration) =
            oldItem == newItem
    }
}
