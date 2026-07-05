package ch.fwvraura.vorstand.ui.events

import android.graphics.Color
import android.graphics.Paint
import android.os.Bundle
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.AutoCompleteTextView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.ContextCompat
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
import ch.fwvraura.vorstand.data.model.ShoppingItem
import ch.fwvraura.vorstand.data.model.parseRegNotes
import ch.fwvraura.vorstand.databinding.FragmentEventRegistrationsBinding
import ch.fwvraura.vorstand.util.DateUtils
import ch.fwvraura.vorstand.util.FileOpener
import com.google.android.material.button.MaterialButton
import com.google.android.material.button.MaterialButtonToggleGroup
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.textfield.TextInputEditText
import java.util.Locale
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

    /** Aktuelles Event (fuer direktes Hinzufuegen ohne Schicht) */
    private var currentEvent: Event? = null

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

        // PDF-Exporte: Teilnehmerliste und Aushang (Plakat) herunterladen/oeffnen
        binding.btnTeilnehmerlistePdf.setOnClickListener { downloadTeilnehmerlistePdf() }
        binding.btnAushangPdf.setOnClickListener { downloadAushangPdf() }

        // Alle Angemeldeten ueber eine Aenderung informieren
        binding.btnNotifyRegistrants.setOnClickListener { showNotifyRegistrantsDialog() }

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
                    currentEvent = event
                    binding.toolbar.title = event.title
                    // Schicht-basierte Anmeldungen anzeigen
                    displayShifts(event)
                    // Direkte Anmeldungen (ohne Schicht-Zuordnung) anzeigen
                    displayDirectRegistrations(event)
                    // Read-only Rezeptmodul (nur sichtbar bei verknuepften Rezepten)
                    loadRecipeModule()
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
            // Personen zaehlen statt Zeilen: participants pro Anmeldung
            // aufsummieren, damit Begleitpersonen fuer die Kapazitaet mitzaehlen
            // (konsistent mit der Web-Ansicht). Falls die Einzel-Anmeldungen
            // nicht vorliegen, auf den serverseitigen approvedCount zurueckfallen.
            val approvedRegs = regs?.approved ?: emptyList()
            val registered = if (approvedRegs.isNotEmpty()) {
                approvedRegs.sumOf { parseRegNotes(it.notes).participants }
            } else {
                regs?.approvedCount ?: 0
            }
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
                onEdit = { reg -> showEditRegistrationDialog(reg) },
                onSuggestAlternative = { reg -> showSuggestAlternativeDialog(reg) }
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

        val hasShifts = !event.shifts.isNullOrEmpty()

        // Bei Events ohne Schichten: Header+Button immer anzeigen (auch wenn leer)
        if (allDirect.isEmpty() && hasShifts) {
            binding.directRegistrationsHeaderRow.visibility = View.GONE
            binding.directRegistrationsContainer.visibility = View.GONE
            return
        }

        // Direkten Anmeldungsbereich sichtbar machen
        binding.directRegistrationsHeaderRow.visibility = View.VISIBLE
        binding.directRegistrationsContainer.visibility = if (allDirect.isNotEmpty()) View.VISIBLE else View.GONE
        binding.directRegistrationsContainer.removeAllViews()

        // "Person hinzufügen" Button für direkte Anmeldungen
        binding.btnAddDirectPerson.setOnClickListener { showAddDirectPersonDialog() }

        // Pro direkte Anmeldung ein Item-Layout erstellen
        for (reg in allDirect) {
            val itemView = layoutInflater.inflate(R.layout.item_shift_registration, binding.directRegistrationsContainer, false)
            val name = itemView.findViewById<TextView>(R.id.regName)
            val details = itemView.findViewById<TextView>(R.id.regDetails)
            val status = itemView.findViewById<TextView>(R.id.regStatus)
            val btnEdit = itemView.findViewById<MaterialButton>(R.id.btnEdit)
            val btnApprove = itemView.findViewById<MaterialButton>(R.id.btnApprove)
            val btnReject = itemView.findViewById<MaterialButton>(R.id.btnReject)

            // Name der angemeldeten Person anzeigen
            name.text = reg.displayName

            // Zusatzdaten (Personenzahl, Telefon, Allergien, Menue, E-Mail ...)
            // identisch zur Schicht-Ansicht aufbereiten (gemeinsamer Helfer).
            // Der Alternative-Button (btnAlternative) bleibt hier ausgeblendet,
            // da direkte Anmeldungen keiner Schicht zugeordnet sind.
            val detailText = ShiftRegistrationsAdapter.buildDetails(reg)
            details.text = detailText
            details.visibility = if (detailText.isEmpty()) View.GONE else View.VISIBLE

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
        val editParticipants = dialogView.findViewById<TextInputEditText>(R.id.editParticipants)

        // Bestehende Daten in die Felder laden
        memberDropdown.setText(reg.displayName, false)
        editName.setText(reg.guestName ?: "")
        editEmail.setText(reg.guestEmail ?: "")
        editPhone.setText(reg.phone ?: "")
        // Personenzahl aus dem notes-Feld vorbelegen (mindestens 1)
        editParticipants.setText(parseRegNotes(reg.notes).participants.toString())

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

                // Personenzahl immer mitsenden (mindestens 1), damit eine reine
                // Aenderung der Personenzahl nicht verloren geht
                val participants = editParticipants.text?.toString()?.trim()
                    ?.toIntOrNull()?.takeIf { it >= 1 } ?: 1
                body["participants"] = participants

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
     * Oeffnet den Dialog zum Hinzufuegen einer Person als direkte Anmeldung (ohne Schicht).
     * Wird verwendet bei Events ohne Schichten (z.B. Ausflug mit Anmeldung, GV).
     */
    private fun showAddDirectPersonDialog() {
        val event = currentEvent ?: return
        val dialogView = layoutInflater.inflate(R.layout.dialog_add_person, null)

        val toggleGroup = dialogView.findViewById<MaterialButtonToggleGroup>(R.id.toggleGroup)
        val memberSection = dialogView.findViewById<LinearLayout>(R.id.memberSection)
        val guestSection = dialogView.findViewById<LinearLayout>(R.id.guestSection)
        val memberDropdown = dialogView.findViewById<AutoCompleteTextView>(R.id.memberDropdown)
        val guestName = dialogView.findViewById<TextInputEditText>(R.id.guestName)
        val guestEmail = dialogView.findViewById<TextInputEditText>(R.id.guestEmail)
        val guestPhone = dialogView.findViewById<TextInputEditText>(R.id.guestPhone)

        var members: List<Member> = emptyList()
        var selectedMember: Member? = null

        toggleGroup.check(R.id.btnMitglied)

        toggleGroup.addOnButtonCheckedListener { _, checkedId, isChecked ->
            if (isChecked) {
                when (checkedId) {
                    R.id.btnMitglied -> {
                        memberSection.visibility = View.VISIBLE
                        guestSection.visibility = View.GONE
                    }
                    R.id.btnGast -> {
                        memberSection.visibility = View.GONE
                        guestSection.visibility = View.VISIBLE
                    }
                }
            }
        }

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
                    memberDropdown.setOnItemClickListener { _, _, position, _ ->
                        selectedMember = members[position]
                    }
                }
            } catch (_: Exception) { }
        }

        val dialog = MaterialAlertDialogBuilder(requireContext())
            .setTitle("Person hinzufügen – ${event.title}")
            .setView(dialogView)
            .setPositiveButton("Speichern", null)
            .setNegativeButton("Abbrechen", null)
            .create()

        dialog.setOnShowListener {
            dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val isMember = toggleGroup.checkedButtonId == R.id.btnMitglied

                if (isMember) {
                    if (selectedMember == null) {
                        Toast.makeText(requireContext(), "Bitte ein Mitglied auswählen", Toast.LENGTH_SHORT).show()
                        return@setOnClickListener
                    }
                    val m = selectedMember!!
                    val body = mutableMapOf<String, Any>(
                        "event_id" to event.id,
                        "status" to "approved",
                        "member_id" to m.id,
                        "guest_name" to "${m.vorname} ${m.nachname}"
                    )
                    if (!m.email.isNullOrEmpty()) body["guest_email"] = m.email
                    createRegistration(body, dialog)
                } else {
                    val name = guestName.text?.toString()?.trim() ?: ""
                    if (name.isEmpty()) {
                        Toast.makeText(requireContext(), "Bitte einen Namen eingeben", Toast.LENGTH_SHORT).show()
                        return@setOnClickListener
                    }
                    val body = mutableMapOf<String, Any>(
                        "event_id" to event.id,
                        "status" to "approved",
                        "guest_name" to name
                    )
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
     * Baut ein menschenlesbares Label fuer eine Schicht:
     * "Name – Datum Startzeit-Endzeit" (z.B. "Bar – 14.06.2025 18:00-22:00").
     */
    private fun shiftLabel(shift: Shift): String {
        val time = "${shift.startTime ?: ""}-${shift.endTime ?: ""}"
        return "${shift.name} – ${DateUtils.formatDate(shift.date)} $time".trim()
    }

    /**
     * Zeigt einen Dialog um der angemeldeten Person eine alternative Schicht
     * vorzuschlagen (z.B. bei voller oder abgesagter Schicht).
     *
     * Der Dialog listet alle anderen Schichten des Events (ohne die eigene
     * Schicht der Anmeldung) in einem Dropdown und bietet ein optionales
     * Kommentarfeld. Beim Bestaetigen wird die E-Mail der Person aufgeloest;
     * fehlt sie, wird abgebrochen.
     *
     * @param reg Die betroffene Anmeldung
     */
    private fun showSuggestAlternativeDialog(reg: EventRegistration) {
        val event = currentEvent ?: return

        // Alle Schichten ausser der eigenen Schicht der Anmeldung anbieten
        val otherShifts = (event.shifts ?: emptyList()).filter { it.id != reg.shiftId }
        if (otherShifts.isEmpty()) {
            Toast.makeText(requireContext(), "Keine andere Schicht vorhanden", Toast.LENGTH_SHORT).show()
            return
        }

        val dialogView = layoutInflater.inflate(R.layout.dialog_suggest_alternative, null)
        val shiftDropdown = dialogView.findViewById<AutoCompleteTextView>(R.id.suggestShiftDropdown)
        val commentInput = dialogView.findViewById<TextInputEditText>(R.id.suggestComment)

        // Schicht-Labels fuer das Dropdown aufbauen
        val labels = otherShifts.map { shiftLabel(it) }
        val adapter = ArrayAdapter(
            requireContext(),
            android.R.layout.simple_dropdown_item_1line,
            labels
        )
        shiftDropdown.setAdapter(adapter)

        var selectedIndex = -1
        shiftDropdown.setOnItemClickListener { _, _, position, _ -> selectedIndex = position }

        val dialog = MaterialAlertDialogBuilder(requireContext())
            .setTitle("Alternative vorschlagen")
            .setView(dialogView)
            .setPositiveButton("Vorschlagen", null)
            .setNegativeButton("Abbrechen", null)
            .create()

        // Eigener OnClickListener fuer Vorschlagen um Validierung zu ermoeglichen
        dialog.setOnShowListener {
            dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                // Validierung: eine Ziel-Schicht muss ausgewaehlt sein
                if (selectedIndex < 0) {
                    Toast.makeText(requireContext(), "Bitte eine Schicht auswählen", Toast.LENGTH_SHORT).show()
                    return@setOnClickListener
                }

                // E-Mail aufloesen (Server-Mail = Mitglied oder Gast); ohne Mail kein Vorschlag
                val registrantEmail = (reg.email ?: reg.guestEmail)?.trim().orEmpty()
                if (registrantEmail.isEmpty()) {
                    Toast.makeText(requireContext(), "Keine E-Mail-Adresse hinterlegt", Toast.LENGTH_SHORT).show()
                    return@setOnClickListener
                }

                val target = otherShifts[selectedIndex]
                val comment = commentInput.text?.toString()?.trim() ?: ""
                suggestAlternative(reg.id, target.id, registrantEmail, labels[selectedIndex], comment, dialog)
            }
        }

        dialog.show()
    }

    /**
     * Sendet den Alternativ-Vorschlag ueber die API.
     * Bei Erfolg wird der Dialog geschlossen und eine Bestaetigung angezeigt.
     *
     * @param regId ID der bestehenden Anmeldung
     * @param newShiftId ID der vorgeschlagenen Schicht (Pflicht, nicht leer)
     * @param email E-Mail der angemeldeten Person (Pflicht, nicht leer)
     * @param shiftInfo Menschenlesbares Label der Ziel-Schicht
     * @param comment Optionaler Kommentar
     * @param dialog Der geoeffnete Dialog (wird bei Erfolg geschlossen)
     */
    private fun suggestAlternative(
        regId: String,
        newShiftId: String,
        email: String,
        shiftInfo: String,
        comment: String,
        dialog: androidx.appcompat.app.AlertDialog
    ) {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val body = mapOf<String, Any?>(
                    "newShiftId" to newShiftId,
                    "email" to email,
                    "shiftInfo" to shiftInfo,
                    "comment" to comment
                )
                val response = ApiModule.eventsApi.suggestAlternative(regId, body)
                if (response.isSuccessful) {
                    Toast.makeText(requireContext(), "Alternative vorgeschlagen", Toast.LENGTH_SHORT).show()
                    dialog.dismiss()
                } else {
                    Toast.makeText(requireContext(), "Fehler beim Vorschlagen", Toast.LENGTH_SHORT).show()
                }
            } catch (_: Exception) {
                Toast.makeText(requireContext(), "Fehler beim Vorschlagen", Toast.LENGTH_SHORT).show()
            }
        }
    }

    /**
     * Zeigt einen Dialog um alle Angemeldeten (bestaetigt + wartend) ueber eine
     * Aenderung am Event zu informieren. Der Betreff ist mit dem Event-Titel
     * vorbelegt, die Nachricht ist ein Pflichtfeld.
     */
    private fun showNotifyRegistrantsDialog() {
        val event = currentEvent ?: return
        val dialogView = layoutInflater.inflate(R.layout.dialog_notify_registrants, null)
        val subjectInput = dialogView.findViewById<TextInputEditText>(R.id.notifySubject)
        val messageInput = dialogView.findViewById<TextInputEditText>(R.id.notifyMessage)

        // Betreff mit Event-Titel vorbelegen
        subjectInput.setText("Änderung: ${event.title}")

        val dialog = MaterialAlertDialogBuilder(requireContext())
            .setTitle("Angemeldete informieren")
            .setView(dialogView)
            .setPositiveButton("Senden", null)
            .setNegativeButton("Abbrechen", null)
            .create()

        dialog.setOnShowListener {
            dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val subject = subjectInput.text?.toString()?.trim() ?: ""
                val message = messageInput.text?.toString()?.trim() ?: ""
                // Validierung: Nachricht ist Pflicht
                if (message.isEmpty()) {
                    Toast.makeText(requireContext(), "Bitte eine Nachricht eingeben", Toast.LENGTH_SHORT).show()
                    return@setOnClickListener
                }
                notifyRegistrants(event.id, subject, message, dialog)
            }
        }

        dialog.show()
    }

    /**
     * Sendet die Benachrichtigung ueber die API und zeigt anschliessend eine
     * Zusammenfassung des Ergebnisses (per E-Mail / per Brief / uebersprungen
     * sowie nicht erreichbare Empfaenger).
     *
     * @param eventId Event-ID
     * @param subject Betreff der Nachricht
     * @param message Aenderungstext (nicht leer)
     * @param dialog Der geoeffnete Dialog (wird bei Erfolg geschlossen)
     */
    private fun notifyRegistrants(
        eventId: String,
        subject: String,
        message: String,
        dialog: androidx.appcompat.app.AlertDialog
    ) {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val body = mapOf<String, Any?>("subject" to subject, "message" to message)
                val response = ApiModule.eventsApi.notifyRegistrants(eventId, body)
                if (response.isSuccessful) {
                    dialog.dismiss()
                    val result = response.body()
                    if (result != null) {
                        // Ergebnis-Zusammenfassung aufbauen
                        val summary = StringBuilder()
                            .append("${result.emailed} per E-Mail, ")
                            .append("${result.posted} per Brief, ")
                            .append("${result.skipped} übersprungen")
                        if (result.unreachable.isNotEmpty()) {
                            summary.append("\nNicht erreichbar: ")
                                .append(result.unreachable.joinToString(", "))
                        }
                        MaterialAlertDialogBuilder(requireContext())
                            .setTitle("Benachrichtigung gesendet")
                            .setMessage(summary.toString())
                            .setPositiveButton("OK", null)
                            .show()
                    } else {
                        Toast.makeText(requireContext(), "Benachrichtigung gesendet", Toast.LENGTH_SHORT).show()
                    }
                } else {
                    Toast.makeText(requireContext(), "Fehler beim Senden", Toast.LENGTH_SHORT).show()
                }
            } catch (_: Exception) {
                Toast.makeText(requireContext(), "Fehler beim Senden", Toast.LENGTH_SHORT).show()
            }
        }
    }

    /**
     * Laedt die Teilnehmerliste als PDF und oeffnet sie im System-PDF-Viewer.
     * Waehrend des Ladens wird der Refresh-Indikator angezeigt.
     */
    private fun downloadTeilnehmerlistePdf() {
        val id = eventId ?: return
        viewLifecycleOwner.lifecycleScope.launch {
            binding.swipeRefresh.isRefreshing = true
            try {
                val response = ApiModule.eventsApi.getTeilnehmerlistePdf(id)
                val body = response.body()
                if (response.isSuccessful && body != null) {
                    val ok = FileOpener.openPdf(requireContext(), body.bytes(), "teilnehmerliste.pdf")
                    if (!ok) Toast.makeText(requireContext(), "Keine PDF-App gefunden", Toast.LENGTH_SHORT).show()
                } else {
                    Toast.makeText(requireContext(), "Fehler beim Laden der Teilnehmerliste", Toast.LENGTH_SHORT).show()
                }
            } catch (_: Exception) {
                Toast.makeText(requireContext(), "Fehler beim Laden der Teilnehmerliste", Toast.LENGTH_SHORT).show()
            }
            binding.swipeRefresh.isRefreshing = false
        }
    }

    /**
     * Laedt den PDF-Aushang (Plakat) des Events und oeffnet ihn im
     * System-PDF-Viewer. Ist kein Aushang hinterlegt (404), wird ein Hinweis
     * angezeigt. Waehrend des Ladens wird der Refresh-Indikator angezeigt.
     */
    private fun downloadAushangPdf() {
        val id = eventId ?: return
        viewLifecycleOwner.lifecycleScope.launch {
            binding.swipeRefresh.isRefreshing = true
            try {
                val response = ApiModule.eventsApi.getAushangPdf(id)
                val body = response.body()
                when {
                    response.isSuccessful && body != null -> {
                        val ok = FileOpener.openPdf(requireContext(), body.bytes(), "aushang.pdf")
                        if (!ok) Toast.makeText(requireContext(), "Keine PDF-App gefunden", Toast.LENGTH_SHORT).show()
                    }
                    response.code() == 404 -> {
                        Toast.makeText(requireContext(), "Kein PDF-Aushang hinterlegt", Toast.LENGTH_SHORT).show()
                    }
                    else -> {
                        Toast.makeText(requireContext(), "Fehler beim Laden des Aushangs", Toast.LENGTH_SHORT).show()
                    }
                }
            } catch (_: Exception) {
                Toast.makeText(requireContext(), "Fehler beim Laden des Aushangs", Toast.LENGTH_SHORT).show()
            }
            binding.swipeRefresh.isRefreshing = false
        }
    }

    /**
     * Laedt das read-only Rezeptmodul (mit dem Event verknuepfte Rezepte samt
     * daraus berechneter Einkaufsliste) aus der Inventar-API ueber den
     * Events-Proxy und zeigt es an. Spiegelt das Rezeptmodul der Web-Ansicht.
     *
     * Die meisten Events haben keine verknuepften Rezepte – dann bleibt die
     * Karte ausgeblendet. Auch bei fehlender Berechtigung (403) oder sonstigen
     * Fehlern wird nichts angezeigt (optionales Modul, kein Absturz/Toast).
     */
    private fun loadRecipeModule() {
        val id = eventId ?: return
        viewLifecycleOwner.lifecycleScope.launch {
            // Karte zuruecksetzen: standardmaessig ausgeblendet
            binding.recipesCard.visibility = View.GONE
            try {
                // 1) Verknuepfte Rezepte laden – ohne Rezepte bleibt die Karte weg
                val recipesResponse = ApiModule.eventsApi.getRecipes(id)
                val recipes = recipesResponse.body()
                if (!recipesResponse.isSuccessful || recipes.isNullOrEmpty()) return@launch

                // 2) Einkaufsliste best-effort nachladen (aus den Rezepten berechnet)
                val shopResponse = ApiModule.eventsApi.getShoppingList(id)
                val shopping = if (shopResponse.isSuccessful) shopResponse.body() else null

                // 3) Rezeptnamen als kompakte Chip-Zeile darstellen
                binding.recipesChips.text = recipes.mapNotNull { it.name }.joinToString("  ·  ")

                // 4) Einkaufsliste rendern (Positionen + Zusammenfassung)
                binding.shoppingContainer.removeAllViews()
                if (shopping != null) {
                    for (item in shopping.items) {
                        binding.shoppingContainer.addView(buildShoppingRow(item))
                    }
                    val summary = StringBuilder()
                        .append("${shopping.totalToBuy ?: 0} Positionen zu kaufen")
                        .append(" · Offen: CHF ")
                        .append(String.format(Locale.ROOT, "%.2f", shopping.estimatedOpenCost ?: 0.0))
                    if ((shopping.totalPurchased ?: 0) > 0) {
                        summary.append(" · ${shopping.totalPurchased} erledigt")
                    }
                    binding.shoppingSummary.text = summary.toString()
                    binding.shoppingSummary.visibility = View.VISIBLE
                } else {
                    binding.shoppingSummary.visibility = View.GONE
                }

                // 5) Erst nach erfolgreichem Aufbau die Karte einblenden
                binding.recipesCard.visibility = View.VISIBLE
            } catch (_: Exception) {
                // Optionales Modul: bei Fehlern nichts anzeigen
                binding.recipesCard.visibility = View.GONE
            }
        }
    }

    /**
     * Baut programmatisch eine Zeile der Einkaufsliste:
     * - Haken-Glyph (✅ gekauft / ⬜ offen)
     * - Zutatname (durchgestrichen & grau wenn bereits gekauft)
     * - Menge "{Menge} {Einheit}" (rechts, grau)
     * - optionale Bezugsquelle/Empfehlung (klein, grau) unter dem Namen
     */
    private fun buildShoppingRow(item: ShoppingItem): View {
        val container = LinearLayout(requireContext()).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            setPadding(0, dp(6), 0, dp(6))
        }

        // Obere Zeile: Glyph + Zutatname + Menge
        val topRow = LinearLayout(requireContext()).apply {
            orientation = LinearLayout.HORIZONTAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            gravity = Gravity.TOP
        }

        val purchased = item.purchased

        // Haken-Glyph (gekauft / offen)
        val glyph = TextView(requireContext()).apply {
            text = if (purchased) "✅" else "⬜"
            textSize = 14f
            setPadding(0, 0, dp(6), 0)
        }

        // Zutatname – nimmt den verfuegbaren Platz ein
        val name = TextView(requireContext()).apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            text = item.itemName ?: ""
            textSize = 14f
            if (purchased) {
                setTextColor(ContextCompat.getColor(requireContext(), R.color.text_hint))
                paintFlags = paintFlags or Paint.STRIKE_THRU_TEXT_FLAG
            } else {
                setTextColor(ContextCompat.getColor(requireContext(), R.color.text_primary))
            }
        }

        // Menge "{Menge} {Einheit}"
        val amount = TextView(requireContext()).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).also { it.leftMargin = dp(8) }
            text = "${formatQty(item.toBuy)} ${item.unit ?: ""}".trim()
            textSize = 14f
            setTextColor(ContextCompat.getColor(requireContext(), R.color.text_secondary))
        }

        topRow.addView(glyph)
        topRow.addView(name)
        topRow.addView(amount)
        container.addView(topRow)

        // Optionale Bezugsquelle/Empfehlung (klein, grau) unter dem Namen
        val recommendation = item.recommendation
        if (!recommendation.isNullOrBlank()) {
            val recView = TextView(requireContext()).apply {
                text = recommendation
                textSize = 12f
                setTextColor(ContextCompat.getColor(requireContext(), R.color.text_secondary))
                setPadding(dp(22), dp(2), 0, 0)
            }
            container.addView(recView)
        }

        return container
    }

    /**
     * Formatiert eine Einkaufsmenge wie die Web-Ansicht: ab 10 auf eine ganze
     * Zahl gerundet, darunter auf eine Nachkommastelle.
     */
    private fun formatQty(value: Double?): String {
        val v = value ?: 0.0
        return if (v >= 10) Math.round(v).toString()
        else String.format(Locale.ROOT, "%.1f", v)
    }

    /** Wandelt dp in px um (fuer programmatisch erzeugte Einkaufslisten-Zeilen). */
    private fun dp(value: Int): Int =
        (value * resources.displayMetrics.density).toInt()

    /**
     * Raeumt das Binding auf wenn die View zerstoert wird.
     */
    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
