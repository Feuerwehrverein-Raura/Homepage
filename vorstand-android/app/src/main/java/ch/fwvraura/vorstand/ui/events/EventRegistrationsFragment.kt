package ch.fwvraura.vorstand.ui.events

import android.graphics.Color
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.AutoCompleteTextView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.data.api.ApiModule
import ch.fwvraura.vorstand.data.model.Event
import ch.fwvraura.vorstand.data.model.EventRegistration
import ch.fwvraura.vorstand.data.model.Member
import ch.fwvraura.vorstand.data.model.Shift
import ch.fwvraura.vorstand.databinding.FragmentEventRegistrationsBinding
import ch.fwvraura.vorstand.util.DateUtils
import com.google.android.material.button.MaterialButton
import com.google.android.material.button.MaterialButtonToggleGroup
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.textfield.TextInputEditText
import kotlinx.coroutines.launch

/**
 * EventRegistrationsFragment – Anmeldungsverwaltung fuer ein Event.
 *
 * Zeigt alle Schichten eines Events mit deren Anmeldungen an, sowie
 * direkte Anmeldungen (ohne Schicht-Zuordnung). Pro Anmeldung stehen
 * folgende Aktionen zur Verfuegung:
 * - Genehmigen (Approve): Setzt den Status auf "approved"
 * - Ablehnen/Entfernen (Reject): Setzt den Status auf "rejected"
 * - Bearbeiten (Edit): Oeffnet einen Dialog zum Aendern der Anmeldedaten
 * - Neue Person hinzufuegen: Mitglied oder Gast zu einer Schicht hinzufuegen
 */
class EventRegistrationsFragment : Fragment() {

    /** View-Binding-Referenz, wird in onDestroyView auf null gesetzt */
    private var _binding: FragmentEventRegistrationsBinding? = null

    /** Sicherer Zugriff auf das Binding */
    private val binding get() = _binding!!

    /** ID des Events dessen Anmeldungen angezeigt werden */
    private var eventId: String? = null

    /**
     * Erstellt die View-Hierarchie des Fragments.
     */
    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentEventRegistrationsBinding.inflate(inflater, container, false)
        return binding.root
    }

    /**
     * Initialisiert das Fragment nach dem Erstellen der View.
     * Setzt den Zurueck-Button in der Toolbar, konfiguriert Pull-to-Refresh
     * und startet das initiale Laden des Events.
     */
    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        eventId = arguments?.getString("eventId")

        // Toolbar-Navigation: Zurueck zur Events-Liste
        binding.toolbar.setNavigationOnClickListener { findNavController().navigateUp() }

        // Pull-to-Refresh: Laedt das Event und alle Anmeldungen neu
        binding.swipeRefresh.setOnRefreshListener { loadEvent() }

        // Initiales Laden des Events
        loadEvent()
    }

    /**
     * Laedt das Event mit allen Schichten und Anmeldungen vom Server.
     * Aktualisiert die Toolbar mit dem Event-Titel und baut die
     * Schicht- und Direkt-Anmeldungs-Ansichten auf.
     */
    private fun loadEvent() {
        viewLifecycleOwner.lifecycleScope.launch {
            binding.swipeRefresh.isRefreshing = true
            try {
                val response = ApiModule.eventsApi.getEvent(eventId!!)
                if (response.isSuccessful) {
                    val event = response.body() ?: return@launch
                    binding.toolbar.title = event.title
                    // Schicht-basierte Anmeldungen anzeigen
                    displayShifts(event)
                    // Direkte Anmeldungen (ohne Schicht-Zuordnung) anzeigen
                    displayDirectRegistrations(event)
                }
            } catch (_: Exception) { }
            binding.swipeRefresh.isRefreshing = false
        }
    }

    /**
     * Zeigt alle Schichten des Events mit deren jeweiligen Anmeldungen an.
     *
     * Pro Schicht wird ein Layout (item_shift_registrations) erstellt mit:
     * - Schichtname als Titel
     * - Info-Zeile: "angemeldet / benoetigt | Datum Startzeit-Endzeit"
     * - RecyclerView mit allen Anmeldungen (genehmigte + ausstehende)
     * - Button zum Hinzufuegen einer neuen Person
     *
     * @param event Das Event-Objekt mit allen Schichten und Anmeldungen
     */
    private fun displayShifts(event: Event) {
        binding.shiftsContainer.removeAllViews()
        val shifts = event.shifts ?: return

        for (shift in shifts) {
            // Layout fuer eine einzelne Schicht inflaten
            val shiftView = layoutInflater.inflate(R.layout.item_shift_registrations, binding.shiftsContainer, false)
            val title = shiftView.findViewById<TextView>(R.id.shiftTitle)
            val info = shiftView.findViewById<TextView>(R.id.shiftInfo)
            val recycler = shiftView.findViewById<RecyclerView>(R.id.registrationsRecycler)
            val btnAddPerson = shiftView.findViewById<MaterialButton>(R.id.btnAddPerson)

            // Schichtname als Titel setzen
            title.text = shift.name

            // Info-Zeile: Anmeldezahlen und Zeitraum zusammenbauen
            val regs = shift.registrations
            val registered = regs?.approvedCount ?: regs?.approved?.size ?: 0
            val needed = shift.needed ?: 0
            info.text = "$registered / $needed | ${DateUtils.formatDate(shift.date)} ${shift.startTime ?: ""}-${shift.endTime ?: ""}"

            // Alle Anmeldungen (genehmigte + ausstehende) zusammenfuehren
            // und sicherstellen dass der Status korrekt gesetzt ist
            val allRegistrations =
                (regs?.approved ?: emptyList()).map { it.copy(status = it.status ?: "approved") } +
                (regs?.pending ?: emptyList()).map { it.copy(status = it.status ?: "pending") }

            // RecyclerView mit ShiftRegistrationsAdapter fuer die Anmeldungen
            recycler.layoutManager = LinearLayoutManager(requireContext())
            recycler.adapter = ShiftRegistrationsAdapter(
                registrations = allRegistrations,
                onApprove = { reg -> approveRegistration(reg.id) },
                onReject = { reg -> confirmRemoveOrReject(reg) },
                onEdit = { reg -> showEditRegistrationDialog(reg) }
            )

            // Button zum Hinzufuegen einer Person zu dieser Schicht
            btnAddPerson.setOnClickListener { showAddPersonDialog(shift) }

            binding.shiftsContainer.addView(shiftView)
        }
    }

    /**
     * Zeigt direkte Anmeldungen an, die keiner Schicht zugeordnet sind.
     *
     * Direkte Anmeldungen werden unterhalb der Schicht-Anmeldungen angezeigt.
     * Falls keine direkten Anmeldungen vorhanden sind, werden Header und
     * Container ausgeblendet.
     *
     * Pro Anmeldung werden Name, Status (farbig), sowie Bearbeiten-,
     * Genehmigen- und Ablehnen-Buttons angezeigt.
     *
     * @param event Das Event-Objekt mit den direkten Anmeldungen
     */
    private fun displayDirectRegistrations(event: Event) {
        val direct = event.directRegistrations

        // Alle direkten Anmeldungen (genehmigte + ausstehende) zusammenfuehren
        val allDirect =
            (direct?.approved ?: emptyList()).map { it.copy(status = it.status ?: "approved") } +
            (direct?.pending ?: emptyList()).map { it.copy(status = it.status ?: "pending") }

        // Falls keine direkten Anmeldungen vorhanden: Bereich ausblenden
        if (allDirect.isEmpty()) {
            binding.directRegistrationsHeader.visibility = View.GONE
            binding.directRegistrationsContainer.visibility = View.GONE
            return
        }

        // Direkten Anmeldungsbereich sichtbar machen
        binding.directRegistrationsHeader.visibility = View.VISIBLE
        binding.directRegistrationsContainer.visibility = View.VISIBLE
        binding.directRegistrationsContainer.removeAllViews()

        // Pro direkte Anmeldung ein Item-Layout erstellen
        for (reg in allDirect) {
            val itemView = layoutInflater.inflate(R.layout.item_shift_registration, binding.directRegistrationsContainer, false)
            val name = itemView.findViewById<TextView>(R.id.regName)
            val status = itemView.findViewById<TextView>(R.id.regStatus)
            val btnEdit = itemView.findViewById<MaterialButton>(R.id.btnEdit)
            val btnApprove = itemView.findViewById<MaterialButton>(R.id.btnApprove)
            val btnReject = itemView.findViewById<MaterialButton>(R.id.btnReject)

            // Name der angemeldeten Person anzeigen
            name.text = reg.displayName

            val isPending = reg.status == "pending"
            val isApproved = reg.status == "approved"

            // Status-Text auf Deutsch setzen
            status.text = when (reg.status) {
                "approved" -> "Genehmigt"
                "pending" -> "Ausstehend"
                else -> reg.status ?: "Ausstehend"
            }

            // Status-Farbe: Gruen fuer genehmigt, Gelb fuer ausstehend, Grau fuer sonstige
            status.setTextColor(
                when {
                    isApproved -> Color.parseColor("#10B981")
                    isPending -> Color.parseColor("#F59E0B")
                    else -> Color.parseColor("#6B7280")
                }
            )

            // Bearbeiten-Button: Immer sichtbar, oeffnet den Bearbeitungsdialog
            btnEdit.visibility = View.VISIBLE
            btnEdit.setOnClickListener { showEditRegistrationDialog(reg) }

            // Genehmigen-Button: Nur sichtbar fuer ausstehende Anmeldungen
            btnApprove.visibility = if (isPending) View.VISIBLE else View.GONE
            btnApprove.setOnClickListener { approveRegistration(reg.id) }

            // Ablehnen/Entfernen-Button: Sichtbar fuer ausstehende und genehmigte Anmeldungen
            btnReject.visibility = if (isPending || isApproved) View.VISIBLE else View.GONE
            btnReject.setOnClickListener { confirmRemoveOrReject(reg) }

            binding.directRegistrationsContainer.addView(itemView)
        }
    }

    /**
     * Zeigt einen Bestaetigungsdialog bevor eine Anmeldung abgelehnt oder entfernt wird.
     *
     * Unterscheidet zwischen:
     * - Genehmigte Anmeldung: "Person entfernen" (bereits genehmigt, wird zurueckgezogen)
     * - Ausstehende Anmeldung: "Anmeldung ablehnen" (wird abgelehnt)
     *
     * @param reg Die betroffene Anmeldung
     */
    private fun confirmRemoveOrReject(reg: EventRegistration) {
        val isApproved = reg.status == "approved"
        val title = if (isApproved) "Person entfernen" else "Anmeldung ablehnen"
        val message = if (isApproved)
            "Möchtest du \"${reg.displayName}\" wirklich entfernen?"
        else
            "Möchtest du die Anmeldung von \"${reg.displayName}\" wirklich ablehnen?"

        MaterialAlertDialogBuilder(requireContext())
            .setTitle(title)
            .setMessage(message)
            .setPositiveButton("Ja") { _, _ -> rejectRegistration(reg.id, isApproved) }
            .setNegativeButton("Abbrechen", null)
            .show()
    }

    /**
     * Genehmigt eine Anmeldung ueber die API.
     * Setzt den Status der Anmeldung auf "approved".
     * Bei Erfolg wird das Event neu geladen um die Aenderung anzuzeigen.
     *
     * @param registrationId Die ID der zu genehmigenden Anmeldung
     */
    private fun approveRegistration(registrationId: String) {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.eventsApi.approveRegistration(registrationId)
                if (response.isSuccessful) {
                    Toast.makeText(requireContext(), "Anmeldung genehmigt", Toast.LENGTH_SHORT).show()
                    loadEvent()
                } else {
                    Toast.makeText(requireContext(), "Fehler beim Genehmigen", Toast.LENGTH_SHORT).show()
                }
            } catch (_: Exception) {
                Toast.makeText(requireContext(), "Fehler beim Genehmigen", Toast.LENGTH_SHORT).show()
            }
        }
    }

    /**
     * Lehnt eine Anmeldung ab oder entfernt eine genehmigte Person ueber die API.
     * Bei Erfolg wird das Event neu geladen und eine passende Meldung angezeigt.
     *
     * @param registrationId Die ID der abzulehnenden/zu entfernenden Anmeldung
     * @param wasApproved true wenn die Anmeldung vorher genehmigt war (zur korrekten Meldung)
     */
    private fun rejectRegistration(registrationId: String, wasApproved: Boolean = false) {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.eventsApi.rejectRegistration(registrationId)
                if (response.isSuccessful) {
                    val msg = if (wasApproved) "Person entfernt" else "Anmeldung abgelehnt"
                    Toast.makeText(requireContext(), msg, Toast.LENGTH_SHORT).show()
                    loadEvent()
                } else {
                    Toast.makeText(requireContext(), "Fehler", Toast.LENGTH_SHORT).show()
                }
            } catch (_: Exception) {
                Toast.makeText(requireContext(), "Fehler", Toast.LENGTH_SHORT).show()
            }
        }
    }

    /**
     * Zeigt einen Dialog zum Bearbeiten einer bestehenden Anmeldung.
     *
     * Der Dialog enthaelt:
     * - Mitglied-Dropdown: Laedt alle Mitglieder vom Server und ermoeglicht
     *   die Auswahl eines bestehenden Mitglieds
     * - Name, E-Mail und Telefon Eingabefelder (vorausgefuellt mit bestehenden Daten)
     *
     * Bei Auswahl eines Mitglieds aus dem Dropdown werden Name und E-Mail
     * automatisch aus den Mitgliederdaten uebernommen.
     *
     * @param reg Die zu bearbeitende Anmeldung
     */
    private fun showEditRegistrationDialog(reg: EventRegistration) {
        val dialogView = layoutInflater.inflate(R.layout.dialog_edit_registration, null)
        val memberDropdown = dialogView.findViewById<AutoCompleteTextView>(R.id.editMemberDropdown)
        val editName = dialogView.findViewById<TextInputEditText>(R.id.editName)
        val editEmail = dialogView.findViewById<TextInputEditText>(R.id.editEmail)
        val editPhone = dialogView.findViewById<TextInputEditText>(R.id.editPhone)

        // Bestehende Daten in die Felder laden
        memberDropdown.setText(reg.displayName, false)
        editName.setText(reg.guestName ?: "")
        editEmail.setText(reg.guestEmail ?: "")
        editPhone.setText(reg.phone ?: "")

        var members: List<Member> = emptyList()
        var selectedMember: Member? = null

        // Mitgliederliste asynchron vom Server laden und in den Dropdown einfuegen
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.membersApi.getMembers()
                if (response.isSuccessful) {
                    members = response.body() ?: emptyList()
                    val memberNames = members.map { "${it.vorname} ${it.nachname}" }
                    val adapter = ArrayAdapter(
                        requireContext(),
                        android.R.layout.simple_dropdown_item_1line,
                        memberNames
                    )
                    memberDropdown.setAdapter(adapter)
                    // Bei Auswahl eines Mitglieds: Name und E-Mail automatisch uebernehmen
                    memberDropdown.setOnItemClickListener { _, _, position, _ ->
                        selectedMember = members[position]
                        val m = members[position]
                        editName.setText("${m.vorname} ${m.nachname}")
                        if (!m.email.isNullOrEmpty()) editEmail.setText(m.email)
                    }
                }
            } catch (_: Exception) { }
        }

        // Dialog erstellen mit Speichern- und Abbrechen-Buttons
        val dialog = MaterialAlertDialogBuilder(requireContext())
            .setTitle("Anmeldung bearbeiten")
            .setView(dialogView)
            .setPositiveButton("Speichern", null)
            .setNegativeButton("Abbrechen", null)
            .create()

        // Eigener OnClickListener fuer den Speichern-Button um zu verhindern
        // dass der Dialog bei Validierungsfehlern automatisch geschlossen wird
        dialog.setOnShowListener {
            dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val body = mutableMapOf<String, Any>()

                if (selectedMember != null) {
                    // Mitglied ausgewaehlt: member_id und Daten aus dem Mitglied uebernehmen
                    val m = selectedMember!!
                    body["member_id"] = m.id
                    body["guest_name"] = "${m.vorname} ${m.nachname}"
                    if (!m.email.isNullOrEmpty()) body["guest_email"] = m.email
                } else {
                    // Kein Mitglied ausgewaehlt: Manuell eingegebenen Namen verwenden
                    val name = editName.text?.toString()?.trim() ?: ""
                    if (name.isNotEmpty()) body["guest_name"] = name
                }

                // E-Mail und Telefon nur setzen wenn nicht leer
                val email = editEmail.text?.toString()?.trim() ?: ""
                if (email.isNotEmpty()) body["guest_email"] = email
                val phone = editPhone.text?.toString()?.trim() ?: ""
                if (phone.isNotEmpty()) body["phone"] = phone

                // Validierung: Mindestens eine Aenderung muss vorhanden sein
                if (body.isEmpty()) {
                    Toast.makeText(requireContext(), "Keine Änderungen", Toast.LENGTH_SHORT).show()
                    return@setOnClickListener
                }

                // Anmeldung ueber die API aktualisieren
                updateRegistration(reg.id, body, dialog)
            }
        }

        dialog.show()
    }

    /**
     * Aktualisiert eine Anmeldung ueber die API mit den geaenderten Daten.
     * Bei Erfolg wird der Dialog geschlossen und das Event neu geladen.
     *
     * @param id Die ID der Anmeldung
     * @param body Map mit den zu aktualisierenden Feldern
     * @param dialog Der geoeffnete Dialog (wird bei Erfolg geschlossen)
     */
    private fun updateRegistration(id: String, body: Map<String, Any>, dialog: androidx.appcompat.app.AlertDialog) {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.eventsApi.updateRegistration(id, body)
                if (response.isSuccessful) {
                    Toast.makeText(requireContext(), "Anmeldung aktualisiert", Toast.LENGTH_SHORT).show()
                    dialog.dismiss()
                    loadEvent()
                } else {
                    Toast.makeText(requireContext(), "Fehler beim Aktualisieren", Toast.LENGTH_SHORT).show()
                }
            } catch (_: Exception) {
                Toast.makeText(requireContext(), "Fehler beim Aktualisieren", Toast.LENGTH_SHORT).show()
            }
        }
    }

    /**
     * Zeigt einen Dialog zum Hinzufuegen einer Person zu einer Schicht.
     *
     * Der Dialog bietet zwei Modi (Toggle-Buttons):
     * 1. Mitglied: Auswahl eines bestehenden Vereinsmitglieds aus einem Dropdown
     * 2. Gast: Manuelle Eingabe von Name, E-Mail und Telefon
     *
     * Die Anmeldung wird direkt mit Status "approved" erstellt.
     *
     * @param shift Die Schicht zu der die Person hinzugefuegt werden soll
     */
    private fun showAddPersonDialog(shift: Shift) {
        val dialogView = layoutInflater.inflate(R.layout.dialog_add_person, null)

        // UI-Elemente des Dialogs: Toggle-Buttons und Eingabe-Sektionen
        val toggleGroup = dialogView.findViewById<MaterialButtonToggleGroup>(R.id.toggleGroup)
        val memberSection = dialogView.findViewById<LinearLayout>(R.id.memberSection)
        val guestSection = dialogView.findViewById<LinearLayout>(R.id.guestSection)
        val memberDropdown = dialogView.findViewById<AutoCompleteTextView>(R.id.memberDropdown)
        val guestName = dialogView.findViewById<TextInputEditText>(R.id.guestName)
        val guestEmail = dialogView.findViewById<TextInputEditText>(R.id.guestEmail)
        val guestPhone = dialogView.findViewById<TextInputEditText>(R.id.guestPhone)

        var members: List<Member> = emptyList()
        var selectedMember: Member? = null

        // Standard: Mitglied-Modus ist aktiv
        toggleGroup.check(R.id.btnMitglied)

        // Toggle-Listener: Wechselt zwischen Mitglied- und Gast-Eingabebereich
        toggleGroup.addOnButtonCheckedListener { _, checkedId, isChecked ->
            if (isChecked) {
                when (checkedId) {
                    R.id.btnMitglied -> {
                        // Mitglied-Modus: Dropdown sichtbar, Gast-Felder ausgeblendet
                        memberSection.visibility = View.VISIBLE
                        guestSection.visibility = View.GONE
                    }
                    R.id.btnGast -> {
                        // Gast-Modus: Gast-Felder sichtbar, Dropdown ausgeblendet
                        memberSection.visibility = View.GONE
                        guestSection.visibility = View.VISIBLE
                    }
                }
            }
        }

        // Mitgliederliste asynchron vom Server laden fuer den Dropdown
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.membersApi.getMembers()
                if (response.isSuccessful) {
                    members = response.body() ?: emptyList()
                    val memberNames = members.map { "${it.vorname} ${it.nachname}" }
                    val adapter = ArrayAdapter(
                        requireContext(),
                        android.R.layout.simple_dropdown_item_1line,
                        memberNames
                    )
                    memberDropdown.setAdapter(adapter)
                    // Bei Auswahl: Ausgewaehltes Mitglied merken
                    memberDropdown.setOnItemClickListener { _, _, position, _ ->
                        selectedMember = members[position]
                    }
                }
            } catch (_: Exception) { }
        }

        // Dialog mit dem Schichtnamen im Titel erstellen
        val dialog = MaterialAlertDialogBuilder(requireContext())
            .setTitle("Person hinzufügen – ${shift.name}")
            .setView(dialogView)
            .setPositiveButton("Speichern", null)
            .setNegativeButton("Abbrechen", null)
            .create()

        // Eigener OnClickListener fuer Speichern um Validierung zu ermoeglichen
        dialog.setOnShowListener {
            dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val isMember = toggleGroup.checkedButtonId == R.id.btnMitglied

                if (isMember) {
                    // ── Mitglied hinzufuegen ─────────────────────────────────
                    // Validierung: Ein Mitglied muss ausgewaehlt sein
                    if (selectedMember == null) {
                        Toast.makeText(requireContext(), "Bitte ein Mitglied auswählen", Toast.LENGTH_SHORT).show()
                        return@setOnClickListener
                    }
                    val m = selectedMember!!
                    // Request-Body mit Mitglied-ID, Schicht-ID und Status "approved"
                    val body = mutableMapOf<String, Any>(
                        "event_id" to shift.eventId,
                        "shift_ids" to listOf(shift.id),
                        "status" to "approved",
                        "member_id" to m.id,
                        "guest_name" to "${m.vorname} ${m.nachname}"
                    )
                    if (!m.email.isNullOrEmpty()) body["guest_email"] = m.email
                    createRegistration(body, dialog)
                } else {
                    // ── Gast hinzufuegen ─────────────────────────────────────
                    // Validierung: Name ist ein Pflichtfeld
                    val name = guestName.text?.toString()?.trim() ?: ""
                    if (name.isEmpty()) {
                        Toast.makeText(requireContext(), "Bitte einen Namen eingeben", Toast.LENGTH_SHORT).show()
                        return@setOnClickListener
                    }
                    // Request-Body mit Gastdaten, Schicht-ID und Status "approved"
                    val body = mutableMapOf<String, Any>(
                        "event_id" to shift.eventId,
                        "shift_ids" to listOf(shift.id),
                        "status" to "approved",
                        "guest_name" to name
                    )
                    // Optionale Felder nur setzen wenn nicht leer
                    val email = guestEmail.text?.toString()?.trim() ?: ""
                    if (email.isNotEmpty()) body["guest_email"] = email
                    val phone = guestPhone.text?.toString()?.trim() ?: ""
                    if (phone.isNotEmpty()) body["phone"] = phone
                    createRegistration(body, dialog)
                }
            }
        }

        dialog.show()
    }

    /**
     * Erstellt eine neue Anmeldung ueber die API.
     * Bei Erfolg wird der Dialog geschlossen und das Event neu geladen.
     *
     * @param body Map mit den Anmeldedaten (event_id, shift_ids, status, Name, etc.)
     * @param dialog Der geoeffnete Dialog (wird bei Erfolg geschlossen)
     */
    private fun createRegistration(body: Map<String, Any>, dialog: androidx.appcompat.app.AlertDialog) {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.eventsApi.createRegistration(body)
                if (response.isSuccessful) {
                    Toast.makeText(requireContext(), "Person hinzugefügt", Toast.LENGTH_SHORT).show()
                    dialog.dismiss()
                    loadEvent()
                } else {
                    Toast.makeText(requireContext(), "Fehler beim Hinzufügen", Toast.LENGTH_SHORT).show()
                }
            } catch (_: Exception) {
                Toast.makeText(requireContext(), "Fehler beim Hinzufügen", Toast.LENGTH_SHORT).show()
            }
        }
    }

    /**
     * Raeumt das Binding auf wenn die View zerstoert wird.
     */
    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
