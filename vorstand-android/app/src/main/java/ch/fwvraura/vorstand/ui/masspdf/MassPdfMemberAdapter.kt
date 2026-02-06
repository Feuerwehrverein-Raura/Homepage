package ch.fwvraura.vorstand.ui.masspdf

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.vorstand.data.model.PostMember
import ch.fwvraura.vorstand.databinding.ItemMassPdfMemberBinding

/**
 * MassPdfMemberAdapter — RecyclerView-Adapter fuer die Mitglieder-Auswahl beim Massen-PDF-Versand.
 *
 * Zeigt eine Liste aller Mitglieder mit Post-Zustellung (contact_method='post') an.
 * Jedes Listenelement hat eine Checkbox zur Auswahl/Abwahl fuer den Versand.
 *
 * Design-Entscheidungen:
 * - Verwendet ListAdapter statt RecyclerView.Adapter fuer automatisches DiffUtil-Handling
 * - Klick auf gesamte Zeile (nicht nur Checkbox) togglet die Auswahl (bessere Usability)
 * - Wrapper-Klasse SelectableMember kombiniert Mitglied-Daten mit Auswahl-Status
 *
 * Zusammenspiel mit Fragment/ViewModel:
 * - Das Fragment kombiniert postMembers + selectedMemberIds zu einer Liste von SelectableMember
 * - Bei Klick wird onMemberToggle() aufgerufen -> Fragment -> ViewModel.toggleMemberSelection()
 * - Das ViewModel aktualisiert selectedMemberIds -> Fragment erstellt neue SelectableMember-Liste
 * - ListAdapter/DiffUtil erkennt die Aenderungen und aktualisiert nur geaenderte Items
 *
 * @param onMemberToggle Callback-Funktion die aufgerufen wird wenn ein Mitglied angeklickt wird.
 *                       Erhaelt die Mitglieder-ID als Parameter.
 */
class MassPdfMemberAdapter(
    private val onMemberToggle: (String) -> Unit
) : ListAdapter<MassPdfMemberAdapter.SelectableMember, MassPdfMemberAdapter.ViewHolder>(DiffCallback) {

    /**
     * SelectableMember — Wrapper-Klasse die PostMember mit Auswahl-Status kombiniert.
     *
     * Diese Klasse wird benoetigt, weil der Auswahl-Status nicht im PostMember-Objekt
     * gespeichert ist (der kommt vom Server), sondern separat im ViewModel verwaltet wird.
     * Durch das Kombinieren beider Informationen in einer Klasse kann DiffUtil korrekt
     * erkennen, wenn sich nur der Auswahl-Status geaendert hat.
     *
     * @property member Das Mitglied mit Name und Adresse
     * @property isSelected true wenn das Mitglied fuer den Versand ausgewaehlt ist
     */
    data class SelectableMember(
        val member: PostMember,
        val isSelected: Boolean
    )

    /**
     * onCreateViewHolder — Erstellt einen neuen ViewHolder.
     *
     * Wird von RecyclerView aufgerufen wenn ein neuer ViewHolder benoetigt wird.
     * Das passiert nur so oft wie Items gleichzeitig sichtbar sind (+ Buffer),
     * danach werden ViewHolder recycelt (onBindViewHolder).
     */
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        // View Binding fuer das item_mass_pdf_member.xml Layout erstellen
        val binding = ItemMassPdfMemberBinding.inflate(
            LayoutInflater.from(parent.context),
            parent,
            false  // attachToParent = false, RecyclerView fuegt das View selbst hinzu
        )
        return ViewHolder(binding)
    }

    /**
     * onBindViewHolder — Bindet Daten an einen existierenden ViewHolder.
     *
     * Wird aufgerufen wenn ein ViewHolder (wieder)verwendet wird, um ein Item anzuzeigen.
     * Der ViewHolder kann neu erstellt oder recycelt sein.
     *
     * @param holder Der ViewHolder der die Daten anzeigen soll
     * @param position Die Position des Items in der Liste (0-basiert)
     */
    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val item = getItem(position)  // getItem() kommt von ListAdapter
        holder.bind(item)
    }

    /**
     * ViewHolder — Haelt Referenzen auf die Views eines Listen-Items.
     *
     * Der ViewHolder vermeidet wiederholte findViewById()-Aufrufe durch
     * einmaliges Speichern der View-Referenzen. Er wird recycelt wenn Items
     * aus dem Bildschirm scrollen.
     *
     * inner class: Hat Zugriff auf den umgebenden Adapter (und damit onMemberToggle)
     *
     * @param binding Das View Binding Objekt fuer item_mass_pdf_member.xml
     */
    inner class ViewHolder(
        private val binding: ItemMassPdfMemberBinding
    ) : RecyclerView.ViewHolder(binding.root) {

        /**
         * bind — Bindet die Daten eines SelectableMember an die Views.
         *
         * Setzt:
         * - Name des Mitglieds
         * - Formatierte Adresse (Strasse, PLZ Ort)
         * - Checkbox-Status (ausgewaehlt/nicht ausgewaehlt)
         * - Click-Listener fuer Toggle-Funktion
         *
         * @param item Das SelectableMember mit Mitglied-Daten und Auswahl-Status
         */
        fun bind(item: SelectableMember) {
            val member = item.member

            // Name anzeigen
            binding.nameText.text = member.name

            // Adresse formatieren: "Strasse, PLZ Ort" oder Fallback
            val address = buildString {
                // Strasse hinzufuegen falls vorhanden
                member.strasse?.let { append(it) }
                // PLZ und/oder Ort hinzufuegen
                if (member.plz != null || member.ort != null) {
                    if (isNotEmpty()) append(", ")  // Komma nach Strasse
                    member.plz?.let { append(it) }
                    member.ort?.let {
                        if (member.plz != null) append(" ")  // Leerzeichen zwischen PLZ und Ort
                        append(it)
                    }
                }
            }
            // Formatierte Adresse oder Fallback wenn leer
            binding.addressText.text = address.ifEmpty { member.address ?: "Keine Adresse" }

            // Checkbox-Status setzen (ohne Listener zu triggern)
            binding.checkbox.isChecked = item.isSelected

            // Klick auf die gesamte Karte schaltet die Auswahl um (nicht nur auf Checkbox)
            // Das verbessert die Usability da ein groesserer Klickbereich vorhanden ist
            binding.root.setOnClickListener {
                onMemberToggle(member.id)
            }
        }
    }

    /**
     * DiffCallback — Ermittelt Unterschiede zwischen alter und neuer Liste.
     *
     * DiffUtil verwendet diese Callbacks um effizient zu berechnen, welche Items
     * sich geaendert haben. Das verhindert unnoetige RecyclerView-Updates und
     * ermoeglicht sanfte Animationen.
     *
     * object: Singleton, da keine Instanz-spezifischen Daten benoetigt werden.
     */
    object DiffCallback : DiffUtil.ItemCallback<SelectableMember>() {
        /**
         * Prueft ob zwei Items das GLEICHE Objekt repraesentieren (basierend auf ID).
         * Wenn false: Item wurde hinzugefuegt oder entfernt (Insert/Remove Animation)
         */
        override fun areItemsTheSame(oldItem: SelectableMember, newItem: SelectableMember): Boolean {
            return oldItem.member.id == newItem.member.id
        }

        /**
         * Prueft ob der INHALT zweier Items identisch ist.
         * Wird nur aufgerufen wenn areItemsTheSame() true zurueckgibt.
         * Wenn false: Item wird aktualisiert (Change Animation, onBindViewHolder wird aufgerufen)
         *
         * Data class equals() vergleicht alle Properties, also member und isSelected.
         */
        override fun areContentsTheSame(oldItem: SelectableMember, newItem: SelectableMember): Boolean {
            return oldItem == newItem
        }
    }
}
