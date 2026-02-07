package ch.fwvraura.vorstand.ui.members

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.data.model.Member
import ch.fwvraura.vorstand.databinding.ItemMemberBinding
import coil.dispose
import coil.load
import coil.transform.CircleCropTransformation

/**
 * MembersAdapter — RecyclerView.Adapter fuer die Mitglieder-Liste.
 *
 * Erbt von ListAdapter (statt direkt RecyclerView.Adapter). ListAdapter nutzt intern
 * DiffUtil, um effiziente Updates zu berechnen: Statt die gesamte Liste neu zu zeichnen,
 * werden nur die tatsaechlich geaenderten Eintraege aktualisiert. Das fuehrt zu besserer
 * Performance und fluessigen Animationen (Einfuegen, Entfernen, Verschieben).
 *
 * @param onClick Callback-Funktion, die aufgerufen wird wenn ein Mitglied angeklickt wird.
 *                Erhaelt das angeklickte Member-Objekt als Parameter.
 */
class MembersAdapter(
    private val onClick: (Member) -> Unit
) : ListAdapter<Member, MembersAdapter.ViewHolder>(DiffCallback()) {

    /**
     * onCreateViewHolder — Erstellt einen neuen ViewHolder.
     *
     * Wird von der RecyclerView aufgerufen wenn ein neuer ViewHolder benoetigt wird
     * (d.h. wenn ein neues Listenelement auf dem Bildschirm erscheint und kein
     * recycleter ViewHolder verfuegbar ist).
     *
     * Inflated das XML-Layout "item_member" per View Binding und erzeugt einen ViewHolder daraus.
     */
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemMemberBinding.inflate(
            LayoutInflater.from(parent.context), parent, false
        )
        return ViewHolder(binding)
    }

    /**
     * onBindViewHolder — Bindet Daten an einen vorhandenen ViewHolder.
     *
     * Wird aufgerufen wenn die RecyclerView ein Element an einer bestimmten Position
     * anzeigen muss. Der ViewHolder kann neu erstellt oder recyclet (wiederverwendet) sein.
     * getItem(position) gibt das Member-Objekt aus der aktuellen Liste zurueck.
     */
    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    /**
     * ViewHolder — Haelt die Referenzen auf die UI-Elemente eines einzelnen Listeneintrags.
     *
     * "inner class" bedeutet: Hat Zugriff auf die aeussere Klasse (MembersAdapter),
     * insbesondere auf den onClick-Callback.
     *
     * Die RecyclerView recyclet ViewHolder: Wenn ein Element aus dem sichtbaren Bereich
     * scrollt, wird sein ViewHolder fuer ein neues Element wiederverwendet.
     * Dadurch muessen nicht fuer jedes Element neue Views erzeugt werden — das spart Speicher.
     */
    inner class ViewHolder(
        private val binding: ItemMemberBinding
    ) : RecyclerView.ViewHolder(binding.root) {

        /**
         * bind — Bindet ein Member-Objekt an die UI-Elemente dieses ViewHolders.
         *
         * Setzt alle sichtbaren Informationen eines Mitglieds:
         * - Name (fullName)
         * - E-Mail (oder leerer String als Fallback)
         * - Funktion (z.B. "Praesident") — nur sichtbar wenn vorhanden
         * - Status-Chip mit farblicher Kennzeichnung je nach Status
         * - Avatar-Bild (Foto des Mitglieds oder Platzhalter)
         * - Click-Listener fuer die gesamte Zeile
         *
         * @param member Das anzuzeigende Mitglied
         */
        fun bind(member: Member) {
            // Name und E-Mail setzen
            binding.memberName.text = member.fullName
            binding.memberEmail.text = member.email ?: ""

            // Funktion (z.B. "Praesident", "Kassier") — nur anzeigen wenn vorhanden
            if (!member.funktion.isNullOrBlank()) {
                binding.memberFunction.text = member.funktion
                binding.memberFunction.visibility = View.VISIBLE
            } else {
                binding.memberFunction.visibility = View.GONE
            }

            // Status-Chip: Zeigt den Mitgliedschafts-Status farbig an.
            // Je nach Status werden unterschiedliche Hintergrund- und Textfarben gesetzt.
            // Fallback: "Aktiv" wenn kein Status vorhanden ist.
            binding.memberStatus.text = member.status ?: "Aktiv"
            val context = binding.root.context
            when (member.status?.lowercase()) {
                "aktiv" -> {
                    binding.memberStatus.setChipBackgroundColorResource(R.color.status_aktiv_bg)
                    binding.memberStatus.setTextColor(context.getColor(R.color.status_aktiv))
                }
                "passiv" -> {
                    binding.memberStatus.setChipBackgroundColorResource(R.color.status_passiv_bg)
                    binding.memberStatus.setTextColor(context.getColor(R.color.status_passiv))
                }
                "ehren", "ehrenmitglied" -> {
                    binding.memberStatus.setChipBackgroundColorResource(R.color.status_ehren_bg)
                    binding.memberStatus.setTextColor(context.getColor(R.color.status_ehren))
                }
            }

            // Avatar-Bild: Laedt das Mitglieder-Foto per Coil (asynchroner Bildlader).
            // Coil ist eine Kotlin-native Bildladebibliothek fuer Android.
            // - CircleCropTransformation: Schneidet das Bild kreisrund zu.
            // - placeholder: Zeigt einen Platzhalter waehrend das Bild geladen wird.
            // Falls kein Foto vorhanden ist, wird nur der Platzhalter (circle_background) angezeigt.
            if (!member.foto.isNullOrEmpty()) {
                binding.memberAvatar.load("https://api.fwv-raura.ch${member.foto}") {
                    transformations(CircleCropTransformation())
                    placeholder(R.drawable.circle_background)
                }
            } else {
                // Kein Foto vorhanden: Initialen-Avatar vom Backend laden.
                // Der Endpoint /avatar/:name generiert ein SVG mit farbigem Kreis
                // und weissen Initialen (z.B. "SM" fuer Stefan Mueller).
                // dispose() bricht laufende Coil-Requests fuer dieses ImageView ab,
                // damit ein recycelter ViewHolder kein altes Bild anzeigt.
                binding.memberAvatar.dispose()
                val avatarName = java.net.URLEncoder.encode(
                    "${member.vorname} ${member.nachname}", "UTF-8"
                )
                binding.memberAvatar.load("https://api.fwv-raura.ch/avatar/$avatarName") {
                    transformations(CircleCropTransformation())
                    placeholder(R.drawable.circle_background)
                }
            }

            // Click-Listener: Beim Klick auf die gesamte Zeile wird der onClick-Callback
            // aufgerufen, der im Fragment definiert ist (Navigation zur Detail-Ansicht).
            binding.root.setOnClickListener { onClick(member) }
        }
    }

    /**
     * DiffCallback — Vergleichs-Logik fuer DiffUtil.
     *
     * DiffUtil verwendet diese Callbacks um effizient zu berechnen, welche Elemente sich
     * in der Liste geaendert haben. Das ermoeglicht gezielte RecyclerView-Updates
     * statt die gesamte Liste neu zu zeichnen.
     *
     * areItemsTheSame: Prueft ob zwei Eintraege dasselbe Mitglied repraesentieren (anhand der ID).
     *   Wenn die IDs unterschiedlich sind, ist es ein anderes Mitglied → Einfuegen/Entfernen.
     *
     * areContentsTheSame: Prueft ob sich der Inhalt eines Mitglieds geaendert hat (Daten-Vergleich).
     *   Wenn die IDs gleich sind aber der Inhalt unterschiedlich → Element wird aktualisiert.
     *   Nutzt den automatisch generierten equals()-Vergleich der data class Member.
     */
    class DiffCallback : DiffUtil.ItemCallback<Member>() {
        override fun areItemsTheSame(oldItem: Member, newItem: Member) = oldItem.id == newItem.id
        override fun areContentsTheSame(oldItem: Member, newItem: Member) = oldItem == newItem
    }
}
