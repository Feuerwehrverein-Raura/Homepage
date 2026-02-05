package ch.fwvraura.vorstand.ui.events

import android.graphics.Color
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.vorstand.data.model.EventRegistration
import ch.fwvraura.vorstand.databinding.ItemShiftRegistrationBinding
import com.google.android.material.button.MaterialButton

/**
 * ShiftRegistrationsAdapter – RecyclerView-Adapter fuer die Anmeldungen einer Schicht.
 *
 * Zeigt pro Anmeldung den Namen der Person, den Status (farbig) und
 * Aktions-Buttons (Bearbeiten, Genehmigen, Ablehnen/Entfernen) an.
 *
 * Status-Farben:
 * - Genehmigt (approved): Gruen (#10B981)
 * - Ausstehend (pending): Gelb/Orange (#F59E0B)
 * - Sonstige: Grau (#6B7280)
 *
 * @param registrations Liste der Anmeldungen die angezeigt werden sollen
 * @param onApprove Callback wenn der Genehmigen-Button geklickt wird
 * @param onReject Callback wenn der Ablehnen/Entfernen-Button geklickt wird
 * @param onEdit Callback wenn der Bearbeiten-Button geklickt wird
 */
class ShiftRegistrationsAdapter(
    private val registrations: List<EventRegistration>,
    private val onApprove: (EventRegistration) -> Unit = {},
    private val onReject: (EventRegistration) -> Unit = {},
    private val onEdit: (EventRegistration) -> Unit = {}
) : RecyclerView.Adapter<ShiftRegistrationsAdapter.ViewHolder>() {

    /**
     * Erstellt einen neuen ViewHolder durch Inflaten des item_shift_registration Layouts.
     */
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemShiftRegistrationBinding.inflate(
            LayoutInflater.from(parent.context), parent, false
        )
        return ViewHolder(binding)
    }

    /**
     * Bindet die Daten einer Anmeldung an den ViewHolder.
     * Setzt Name, Status (Text + Farbe) und die Sichtbarkeit/Funktionalitaet
     * der Aktions-Buttons basierend auf dem Anmelde-Status.
     */
    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val reg = registrations[position]

        // Name der angemeldeten Person anzeigen
        holder.name.text = reg.displayName

        val isPending = reg.status == "pending"
        val isApproved = reg.status == "approved"

        // Status-Text auf Deutsch setzen
        holder.status.text = when (reg.status) {
            "approved" -> "Genehmigt"
            "pending" -> "Ausstehend"
            else -> reg.status ?: "Ausstehend"
        }

        // Status-Textfarbe: Gruen fuer genehmigt, Gelb fuer ausstehend, Grau fuer sonstige
        holder.status.setTextColor(
            when {
                isApproved -> Color.parseColor("#10B981")
                isPending -> Color.parseColor("#F59E0B")
                else -> Color.parseColor("#6B7280")
            }
        )

        // ── Bearbeiten-Button ────────────────────────────────────────────
        // Immer sichtbar fuer alle Anmeldungen
        holder.btnEdit.visibility = View.VISIBLE
        holder.btnEdit.setOnClickListener { onEdit(reg) }

        // ── Genehmigen-Button ────────────────────────────────────────────
        // Nur sichtbar fuer ausstehende Anmeldungen (Status "pending")
        holder.btnApprove.visibility = if (isPending) View.VISIBLE else View.GONE
        holder.btnApprove.setOnClickListener { onApprove(reg) }

        // ── Ablehnen/Entfernen-Button ────────────────────────────────────
        // Sichtbar fuer ausstehende UND genehmigte Anmeldungen
        // Zeigt ein X-Symbol (Unicode ✗) als Button-Text
        // Bei genehmigten Anmeldungen fungiert der Button als "Entfernen"
        // Bei ausstehenden Anmeldungen als "Ablehnen"
        holder.btnReject.visibility = if (isPending || isApproved) View.VISIBLE else View.GONE
        if (isApproved) {
            // Fuer genehmigte Anmeldungen: X-Symbol zum Entfernen
            holder.btnReject.text = "\u2717"
        } else {
            // Fuer ausstehende Anmeldungen: X-Symbol zum Ablehnen
            holder.btnReject.text = "\u2717"
        }
        holder.btnReject.setOnClickListener { onReject(reg) }
    }

    /**
     * Gibt die Gesamtanzahl der Anmeldungen zurueck.
     */
    override fun getItemCount() = registrations.size

    /**
     * ViewHolder der die Referenzen auf die UI-Elemente einer einzelnen
     * Anmeldungszeile haelt: Name, Status und die drei Aktions-Buttons.
     */
    class ViewHolder(binding: ItemShiftRegistrationBinding) : RecyclerView.ViewHolder(binding.root) {
        /** TextView fuer den Namen der angemeldeten Person */
        val name: TextView = binding.regName
        /** TextView fuer den Anmeldestatus (Genehmigt/Ausstehend) */
        val status: TextView = binding.regStatus
        /** Button zum Bearbeiten der Anmeldung */
        val btnEdit: MaterialButton = binding.btnEdit
        /** Button zum Genehmigen einer ausstehenden Anmeldung */
        val btnApprove: MaterialButton = binding.btnApprove
        /** Button zum Ablehnen/Entfernen einer Anmeldung */
        val btnReject: MaterialButton = binding.btnReject
    }
}
