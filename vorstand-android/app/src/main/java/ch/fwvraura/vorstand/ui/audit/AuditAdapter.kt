package ch.fwvraura.vorstand.ui.audit

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.vorstand.data.model.AuditEntry
import ch.fwvraura.vorstand.databinding.ItemAuditBinding
import ch.fwvraura.vorstand.util.DateUtils

/**
 * AuditAdapter - RecyclerView-Adapter fuer die Darstellung von Audit-Log-Eintraegen.
 *
 * Erbt von ListAdapter, der intern DiffUtil verwendet, um nur geaenderte Eintraege
 * in der RecyclerView zu aktualisieren (effizientes UI-Update).
 * Jeder Eintrag zeigt Aktion, Zeitstempel und Benutzer an.
 * Die Details (newValues) koennen durch Antippen auf-/zugeklappt werden.
 */
class AuditAdapter : ListAdapter<AuditEntry, AuditAdapter.ViewHolder>(DiffCallback()) {

    /**
     * Erstellt einen neuen ViewHolder fuer einen Audit-Eintrag.
     * Inflated das Item-Layout (ItemAuditBinding) und gibt einen ViewHolder zurueck.
     */
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemAuditBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return ViewHolder(binding)
    }

    /**
     * Bindet die Daten eines Audit-Eintrags an den ViewHolder an der gegebenen Position.
     * Delegiert die eigentliche Datenbindung an die bind()-Methode des ViewHolders.
     */
    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    /**
     * ViewHolder fuer einen einzelnen Audit-Log-Eintrag.
     * Haelt die Referenz auf das ItemAuditBinding und steuert die Darstellung der Daten.
     */
    class ViewHolder(private val binding: ItemAuditBinding) : RecyclerView.ViewHolder(binding.root) {

        /**
         * Bindet einen AuditEntry an die UI-Elemente.
         *
         * - Setzt den Aktionsnamen (z.B. "user.login", "member.approve") in das Aktions-Textfeld.
         * - Formatiert und zeigt den Zeitstempel des Eintrags an.
         * - Zeigt die E-Mail des ausfuehrenden Benutzers an (leer, falls nicht vorhanden).
         * - Prueft, ob Detail-Informationen (newValues) vorhanden und nicht leer sind:
         *   - Falls ja: zeigt den Detail-Text an.
         *   - Falls nein: blendet den Detail-Bereich aus.
         * - Registriert einen Klick-Listener auf dem gesamten Eintrag, um die Details
         *   bei Antippen ein- oder auszublenden (Toggle-Verhalten).
         */
        fun bind(entry: AuditEntry) {
            // Aktionsname anzeigen (z.B. "member.approve", "user.login")
            binding.auditAction.text = entry.action

            // Zeitstempel formatiert anzeigen (ueber DateUtils-Hilfsfunktion)
            binding.auditTime.text = DateUtils.formatDateTime(entry.createdAt)

            // E-Mail des Benutzers anzeigen, der die Aktion ausgefuehrt hat
            binding.auditUser.text = entry.email ?: ""

            // Detail-Informationen (neue Werte) pruefen und ggf. anzeigen
            val details = entry.newValues?.toString()
            if (!details.isNullOrBlank() && details != "null") {
                binding.auditDetails.text = details
                binding.auditDetails.visibility = View.VISIBLE
            } else {
                // Keine Details vorhanden - Bereich ausblenden
                binding.auditDetails.visibility = View.GONE
            }

            // Klick auf den gesamten Eintrag: Details ein-/ausblenden (Toggle)
            binding.root.setOnClickListener {
                binding.auditDetails.visibility =
                    if (binding.auditDetails.visibility == View.VISIBLE) View.GONE else View.VISIBLE
            }
        }
    }

    /**
     * DiffCallback - Vergleicht zwei AuditEntry-Objekte fuer effiziente RecyclerView-Updates.
     *
     * areItemsTheSame: Prueft ob es sich um denselben Eintrag handelt (gleiche ID und Zeitstempel).
     * areContentsTheSame: Prueft ob der Inhalt identisch ist (Data-Class equals-Vergleich).
     * Wird von ListAdapter verwendet, um nur tatsaechlich geaenderte Eintraege neu zu rendern.
     */
    class DiffCallback : DiffUtil.ItemCallback<AuditEntry>() {
        override fun areItemsTheSame(oldItem: AuditEntry, newItem: AuditEntry) =
            oldItem.id == newItem.id && oldItem.createdAt == newItem.createdAt
        override fun areContentsTheSame(oldItem: AuditEntry, newItem: AuditEntry) =
            oldItem == newItem
    }
}
