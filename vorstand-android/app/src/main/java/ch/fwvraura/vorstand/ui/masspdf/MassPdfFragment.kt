package ch.fwvraura.vorstand.ui.masspdf

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.activity.result.contract.ActivityResultContracts
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.databinding.FragmentMassPdfBinding
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.snackbar.Snackbar
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch

/**
 * MassPdfFragment — Massen-PDF-Versand per Post (Pingen)
 *
 * Dieses Fragment ermoeglicht den Massen-Briefversand an alle Mitglieder mit Post-Zustellung.
 * Es wird hauptsaechlich fuer den Versand von QR-Rechnungen (Mitgliederbeitraege) verwendet.
 *
 * Funktionen:
 * - PDF-Datei vom Geraet auswaehlen (Document Picker)
 * - Empfaenger einzeln oder alle auf einmal auswaehlen/abwaehlen
 * - Staging-Modus (Testversand ohne echte Kosten) vs. Produktionsmodus
 * - Betreff/Referenz fuer die Briefe angeben
 * - Kostenvorschau (ca. CHF 1.50 pro Brief)
 * - Bestaetigung vor dem Versand mit Zusammenfassung
 *
 * Workflow:
 *   1. Benutzer waehlt eine PDF-Datei aus
 *   2. Benutzer waehlt die gewuenschten Empfaenger aus
 *   3. Optional: Betreff eingeben
 *   4. Optional: Staging-Modus aktivieren fuer Testversand
 *   5. "Senden" Button -> Bestaetungsdialog -> Versand via Pingen API
 *
 * Fragment-Lifecycle:
 *   1. onCreateView  -> Layout wird inflated, _binding wird erzeugt
 *   2. onViewCreated -> UI-Setup (RecyclerView, Listener), Daten werden geladen
 *   3. onDestroyView -> _binding wird auf null gesetzt (Memory-Leak-Vermeidung)
 */
class MassPdfFragment : Fragment() {

    /**
     * _binding: Nullable Referenz auf das View-Binding-Objekt.
     *
     * Null-Safety-Pattern fuer View Binding in Fragments:
     * - _binding ist nullable (FragmentMassPdfBinding?) und wird in onDestroyView auf null gesetzt.
     *   Das ist noetig, weil die View eines Fragments zerstoert werden kann, waehrend das Fragment
     *   selbst noch existiert (z.B. bei BackStack-Navigation). Wuerde man die Referenz behalten,
     *   gaebe es einen Memory Leak, weil das Binding-Objekt die gesamte View-Hierarchie referenziert.
     *
     * - binding (ohne Unterstrich) ist ein Non-Null-Getter mit "!!" (forcierter Zugriff).
     *   Er darf NUR zwischen onCreateView und onDestroyView aufgerufen werden.
     *   Ausserhalb dieses Fensters wuerde eine NullPointerException geworfen werden.
     */
    private var _binding: FragmentMassPdfBinding? = null
    private val binding get() = _binding!!

    /**
     * viewModel: Instanz des MassPdfViewModel.
     *
     * "by viewModels()" ist ein Kotlin-Property-Delegate, der das ViewModel automatisch
     * an den Lifecycle des Fragments bindet. Das ViewModel ueberlebt Konfigurationsaenderungen
     * wie z.B. eine Bildschirmdrehung (Screen-Rotation), d.h. die Daten gehen nicht verloren.
     */
    private val viewModel: MassPdfViewModel by viewModels()

    /** RecyclerView-Adapter fuer die Mitglieder-Auswahl. Wird in setupRecyclerView() initialisiert. */
    private lateinit var membersAdapter: MassPdfMemberAdapter

    /**
     * pdfPickerLauncher: Activity Result Launcher fuer den PDF-Picker.
     *
     * Verwendet das moderne Activity Result API (statt onActivityResult), um ein PDF auszuwaehlen.
     * - registerForActivityResult() registriert den Callback beim Fragment-Lifecycle
     * - ActivityResultContracts.StartActivityForResult() ist der Standard-Contract fuer Intents
     * - Der Lambda-Callback wird aufgerufen, wenn der Benutzer eine Datei ausgewaehlt hat
     *
     * Ablauf beim PDF-Auswaehlen:
     *   1. Intent mit ACTION_OPEN_DOCUMENT und type="application/pdf" wird gestartet
     *   2. System zeigt den Document Picker (Dateibrowser)
     *   3. Benutzer waehlt ein PDF -> RESULT_OK
     *   4. Callback liest die Datei via ContentResolver und uebergibt die Bytes ans ViewModel
     */
    private val pdfPickerLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        // Pruefen ob der Benutzer eine Datei ausgewaehlt hat (RESULT_OK)
        if (result.resultCode == Activity.RESULT_OK) {
            // URI der ausgewaehlten Datei extrahieren
            result.data?.data?.let { uri ->
                try {
                    // ContentResolver ermoeglicht Zugriff auf Inhalte anderer Apps
                    val contentResolver = requireContext().contentResolver
                    // PDF als InputStream oeffnen und komplett in ByteArray einlesen
                    val inputStream = contentResolver.openInputStream(uri)
                    val bytes = inputStream?.readBytes()
                    inputStream?.close()

                    if (bytes != null) {
                        // Dateiname aus dem URI-Pfad extrahieren (nach dem letzten "/")
                        // Fallback auf "document.pdf" wenn kein Name ermittelt werden kann
                        val fileName = uri.lastPathSegment?.substringAfterLast('/') ?: "document.pdf"
                        // PDF-Bytes und Name ans ViewModel uebergeben
                        viewModel.setPdf(bytes, fileName)
                    }
                } catch (e: Exception) {
                    // Fehler beim Laden anzeigen (z.B. Berechtigung verweigert, Datei nicht lesbar)
                    Snackbar.make(binding.root, "Fehler beim Laden der PDF", Snackbar.LENGTH_SHORT).show()
                }
            }
        }
    }

    /**
     * onCreateView — Erster Schritt im Fragment-Lifecycle (fuer die View).
     *
     * Hier wird das XML-Layout "fragment_mass_pdf" per View Binding in eine View umgewandelt
     * (inflated). Das Binding-Objekt wird in _binding gespeichert und die Wurzel-View zurueckgegeben.
     */
    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentMassPdfBinding.inflate(inflater, container, false)
        return binding.root
    }

    /**
     * onViewCreated — Zweiter Schritt im Fragment-Lifecycle (fuer die View).
     *
     * Die View ist jetzt vollstaendig erzeugt. Hier werden alle UI-Komponenten eingerichtet:
     * - Toolbar mit Zurueck-Navigation
     * - RecyclerView fuer die Mitglieder-Auswahl
     * - Click-Listener fuer alle interaktiven Elemente
     * - Beobachtung der ViewModel-States (observeViewModel)
     *
     * Zum Schluss werden die Post-Mitglieder vom Server geladen.
     */
    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        setupToolbar()
        setupRecyclerView()
        setupClickListeners()
        observeViewModel()

        // Post-Mitglieder vom Server laden (alle Mitglieder mit contact_method='post')
        viewModel.loadPostMembers()
    }

    /**
     * setupToolbar — Richtet die Toolbar mit Zurueck-Navigation ein.
     *
     * Beim Klick auf den Zurueck-Pfeil (Navigation Icon) wird zum vorherigen
     * Fragment zuruecknavigiert (MoreFragment).
     */
    private fun setupToolbar() {
        binding.toolbar.setNavigationOnClickListener {
            findNavController().navigateUp()
        }
    }

    /**
     * setupRecyclerView — Initialisiert die RecyclerView fuer die Mitglieder-Auswahl.
     *
     * - Erstellt einen MassPdfMemberAdapter mit einem Toggle-Listener. Beim Klick auf ein
     *   Mitglied wird dessen Auswahl umgeschaltet (ausgewaehlt <-> nicht ausgewaehlt).
     * - Setzt einen LinearLayoutManager (vertikale Liste) als Layout-Manager.
     */
    private fun setupRecyclerView() {
        // Adapter erstellen mit Callback fuer Mitglieder-Toggle
        membersAdapter = MassPdfMemberAdapter { memberId ->
            viewModel.toggleMemberSelection(memberId)
        }
        binding.membersRecycler.layoutManager = LinearLayoutManager(requireContext())
        binding.membersRecycler.adapter = membersAdapter
    }

    /**
     * setupClickListeners — Richtet alle Click-Listener fuer interaktive UI-Elemente ein.
     *
     * Konfiguriert:
     * - Staging-Switch: Umschalten zwischen Test- und Produktionsmodus
     * - PDF-Auswaehlen-Button: Startet den Document Picker
     * - Alle-Auswaehlen-Button: Waehlt alle Mitglieder aus oder ab
     * - Senden-Button: Zeigt den Bestaetungsdialog
     * - SwipeRefresh: Laedt die Mitglieder-Liste neu
     */
    private fun setupClickListeners() {
        // === Staging Switch ===
        // Initialisiert den Switch mit dem aktuellen Staging-Status aus dem ViewModel
        // Standard ist "aktiviert" (Staging-Modus) fuer Sicherheit
        binding.stagingSwitch.isChecked = viewModel.staging.value
        binding.stagingSwitch.setOnCheckedChangeListener { _, isChecked ->
            viewModel.setStaging(isChecked)
        }

        // === PDF-Auswaehlen Button ===
        // Startet den System-Document-Picker fuer PDF-Dateien
        binding.selectPdfButton.setOnClickListener {
            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                // CATEGORY_OPENABLE: Nur Dateien die geoeffnet werden koennen
                addCategory(Intent.CATEGORY_OPENABLE)
                // MIME-Type auf PDF beschraenken
                type = "application/pdf"
            }
            pdfPickerLauncher.launch(intent)
        }

        // === Alle Auswaehlen/Abwaehlen Button ===
        // Toggle-Logik: Wenn alle ausgewaehlt sind -> alle abwaehlen, sonst alle auswaehlen
        binding.selectAllButton.setOnClickListener {
            val allSelected = viewModel.selectedMemberIds.value.size == viewModel.postMembers.value.size
            if (allSelected) {
                viewModel.deselectAllMembers()
            } else {
                viewModel.selectAllMembers()
            }
        }

        // === Senden Button ===
        // Oeffnet den Bestaetungsdialog mit Zusammenfassung und Kostenvorschau
        binding.sendButton.setOnClickListener {
            showSendConfirmation()
        }

        // === SwipeRefresh ===
        // Pull-to-Refresh laedt die Post-Mitglieder-Liste neu
        binding.swipeRefresh.setOnRefreshListener {
            viewModel.loadPostMembers()
        }
    }

    /**
     * showSendConfirmation — Zeigt den Bestaetungsdialog vor dem Versand.
     *
     * Der Dialog zeigt eine Zusammenfassung:
     * - Name des ausgewaehlten PDFs
     * - Anzahl der Empfaenger
     * - Modus (Staging vs. Produktion)
     * - Bei Produktion: Geschaetzte Kosten (ca. CHF 1.50 pro Brief)
     *
     * Der Benutzer muss explizit bestaetigen, dass er den Versand starten moechte.
     * Dies ist besonders wichtig im Produktionsmodus, da echte Kosten entstehen.
     */
    private fun showSendConfirmation() {
        val selectedCount = viewModel.selectedMemberIds.value.size
        val staging = viewModel.staging.value
        val pdfName = viewModel.pdfFileName.value ?: "document.pdf"

        // Dialog-Nachricht zusammenbauen mit buildString (Kotlin String Builder)
        val message = buildString {
            append("Soll das PDF \"$pdfName\" an $selectedCount Empfänger gesendet werden?\n\n")
            if (staging) {
                // Staging: Hinweis dass keine echten Briefe versendet werden
                append("STAGING-MODUS: Es werden keine echten Briefe versendet.")
            } else {
                // Produktion: Warnung und Kostenvorschau
                append("PRODUKTION: Echte Briefe werden versendet!\n")
                // Kosten ca. CHF 1.50 pro Brief (Druck + Porto)
                append("Geschätzte Kosten: ca. CHF ${String.format("%.2f", selectedCount * 1.50)}")
            }
        }

        // Material Dialog mit Bestaetigung
        MaterialAlertDialogBuilder(requireContext())
            .setTitle("Massen-PDF versenden")
            .setMessage(message)
            .setPositiveButton("Senden") { _, _ ->
                // Betreff aus dem Eingabefeld holen (oder null wenn leer)
                val subject = binding.subjectInput.text?.toString()?.takeIf { it.isNotBlank() }
                // Versand starten via ViewModel
                viewModel.sendBulkPdf(subject)
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    /**
     * observeViewModel — Beobachtet die reaktiven Datenströme (StateFlows) des ViewModels.
     *
     * Verwendet separate Coroutinen fuer jeden StateFlow, die an den viewLifecycleOwner
     * gebunden sind. Wenn die View zerstoert wird, werden alle Coroutinen automatisch
     * abgebrochen.
     *
     * Beobachtete States:
     * 1. postMembers + selectedMemberIds (kombiniert): Aktualisiert die RecyclerView-Liste
     * 2. selectedMemberIds: Aktualisiert Zaehler, Button-Text und Kosten-Hinweis
     * 3. pdfFileName: Zeigt den Namen des ausgewaehlten PDFs oder Platzhalter
     * 4. isLoading: Steuert die Lade-Indikatoren (SwipeRefresh / Overlay)
     * 5. error: Zeigt Fehlermeldungen als Snackbar
     * 6. sendResult: Zeigt den Ergebnis-Dialog nach dem Versand
     * 7. staging: Synchronisiert den Switch und aktualisiert den Kosten-Hinweis
     */
    private fun observeViewModel() {
        // === Coroutine 1: Mitglieder-Liste mit Auswahl-Status ===
        // Kombiniert zwei Flows zu einer Liste von SelectableMember-Objekten
        viewLifecycleOwner.lifecycleScope.launch {
            // combine() erzeugt einen neuen Wert wenn EINER der Flows einen neuen Wert emittiert
            combine(
                viewModel.postMembers,
                viewModel.selectedMemberIds
            ) { members, selectedIds ->
                // Jeden PostMember zu SelectableMember mappen mit isSelected-Flag
                members.map { member ->
                    MassPdfMemberAdapter.SelectableMember(
                        member = member,
                        isSelected = selectedIds.contains(member.id)
                    )
                }
            }.collectLatest { selectableMembers ->
                // RecyclerView-Adapter aktualisieren (DiffUtil sorgt fuer effiziente Updates)
                membersAdapter.submitList(selectableMembers)
                // RecyclerView/Empty-State Sichtbarkeit umschalten
                binding.membersRecycler.visibility = if (selectableMembers.isEmpty()) View.GONE else View.VISIBLE
                binding.emptyState.visibility = if (selectableMembers.isEmpty()) View.VISIBLE else View.GONE
            }
        }

        // === Coroutine 2: Auswahl-Zaehler und Button-Text ===
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.selectedMemberIds.collectLatest { selectedIds ->
                val count = selectedIds.size
                val total = viewModel.postMembers.value.size
                // Zaehler-Text aktualisieren (z.B. "5 / 12")
                binding.selectedCountText.text = "$count / $total"

                // Button-Text dynamisch anpassen:
                // "Alle abwählen" wenn alle ausgewaehlt, sonst "Alle auswählen"
                val allSelected = count == total && total > 0
                binding.selectAllButton.text = if (allSelected) {
                    getString(R.string.mass_pdf_deselect_all)
                } else {
                    getString(R.string.mass_pdf_select_all)
                }

                // Kosten-Hinweis und Senden-Button aktualisieren
                updateCostHint(count)
                updateSendButtonState()
            }
        }

        // === Coroutine 3: PDF-Dateiname ===
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.pdfFileName.collectLatest { fileName ->
                if (fileName != null) {
                    // PDF ausgewaehlt: Name anzeigen, Icon in Primaerfarbe
                    binding.pdfNameText.text = fileName
                    binding.pdfIcon.setColorFilter(
                        requireContext().getColor(R.color.primary)
                    )
                } else {
                    // Kein PDF: Platzhalter-Text, Icon in Hint-Farbe (ausgegraut)
                    binding.pdfNameText.text = getString(R.string.mass_pdf_no_file)
                    binding.pdfIcon.setColorFilter(
                        requireContext().getColor(R.color.text_hint)
                    )
                }
                // Senden-Button aktivieren/deaktivieren je nachdem ob PDF vorhanden
                updateSendButtonState()
            }
        }

        // === Coroutine 4: Lade-Zustand ===
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.isLoading.collectLatest { loading ->
                // SwipeRefresh-Indikator: Nur beim initialen Laden (noch kein PDF ausgewaehlt)
                binding.swipeRefresh.isRefreshing = loading && viewModel.pdfFileName.value == null
                // Lade-Overlay: Beim Versand (PDF bereits ausgewaehlt)
                // Das Overlay blockiert alle UI-Interaktionen waehrend des Versands
                binding.loadingOverlay.visibility = if (loading && viewModel.pdfFileName.value != null) {
                    View.VISIBLE
                } else {
                    View.GONE
                }
            }
        }

        // === Coroutine 5: Fehlermeldungen ===
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.error.collectLatest { error ->
                if (error != null) {
                    // Fehler als Snackbar anzeigen und im ViewModel zuruecksetzen
                    Snackbar.make(binding.root, error, Snackbar.LENGTH_LONG).show()
                    viewModel.clearError()
                }
            }
        }

        // === Coroutine 6: Versand-Ergebnis ===
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.sendResult.collectLatest { result ->
                if (result != null) {
                    // Ergebnis-Dialog anzeigen und im ViewModel zuruecksetzen
                    showResultDialog(result)
                    viewModel.clearSendResult()
                }
            }
        }

        // === Coroutine 7: Staging-Modus ===
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.staging.collectLatest { staging ->
                // Switch synchronisieren (falls programmatisch geaendert)
                binding.stagingSwitch.isChecked = staging
                // Kosten-Hinweis aktualisieren (im Staging-Modus: "Testmodus")
                updateCostHint(viewModel.selectedMemberIds.value.size)
            }
        }
    }

    /**
     * updateSendButtonState — Aktualisiert den Enabled-Status des Senden-Buttons.
     *
     * Der Button ist nur aktiviert wenn BEIDE Bedingungen erfuellt sind:
     * 1. Ein PDF wurde ausgewaehlt (hasPdf)
     * 2. Mindestens ein Empfaenger ist ausgewaehlt (hasRecipients)
     */
    private fun updateSendButtonState() {
        val hasPdf = viewModel.pdfFileName.value != null
        val hasRecipients = viewModel.selectedMemberIds.value.isNotEmpty()
        binding.sendButton.isEnabled = hasPdf && hasRecipients
    }

    /**
     * updateCostHint — Aktualisiert den Kosten-Hinweis unter dem Senden-Button.
     *
     * Zeigt je nach Modus:
     * - Staging: Hinweis auf Testmodus (keine echten Kosten)
     * - Produktion mit Empfaengern: Geschaetzte Kosten (ca. CHF 1.50 pro Brief)
     * - Produktion ohne Empfaenger: Leer (kein Hinweis)
     *
     * @param count Anzahl der ausgewaehlten Empfaenger
     */
    private fun updateCostHint(count: Int) {
        val staging = viewModel.staging.value
        binding.costHint.text = if (staging) {
            // Staging-Modus: Keine echten Kosten
            getString(R.string.mass_pdf_staging_hint)
        } else if (count > 0) {
            // Produktion mit Empfaengern: Kostenvorschau anzeigen
            // Formatierung: "Ca. CHF X.XX für N Briefe"
            getString(R.string.mass_pdf_cost_hint, count, count * 1.50)
        } else {
            // Keine Empfaenger: Kein Hinweis
            ""
        }
    }

    /**
     * showResultDialog — Zeigt das Ergebnis nach dem Versand in einem Dialog.
     *
     * Der Dialog zeigt:
     * - Modus (Staging oder Produktion)
     * - Anzahl Gesamtempfaenger
     * - Anzahl erfolgreich versendeter Briefe
     * - Anzahl fehlgeschlagener Briefe
     *
     * Der Titel passt sich dem Ergebnis an:
     * - "Versand erfolgreich" wenn alle Briefe erfolgreich
     * - "Versand teilweise erfolgreich" wenn mindestens einer fehlgeschlagen
     *
     * @param result Das SendResult-Objekt vom ViewModel mit den Versand-Statistiken
     */
    private fun showResultDialog(result: MassPdfViewModel.SendResult) {
        // Dialog-Nachricht mit Statistiken zusammenbauen
        val message = buildString {
            if (result.staging) {
                // Staging-Hinweis prominent anzeigen
                append("STAGING-MODUS (keine echten Briefe)\n\n")
            }
            append("Gesamtempfänger: ${result.totalRecipients}\n")
            append("Erfolgreich: ${result.successCount}\n")
            append("Fehlgeschlagen: ${result.failedCount}")
        }

        // Titel je nach Ergebnis
        val title = if (result.failedCount == 0) {
            "Versand erfolgreich"
        } else {
            "Versand teilweise erfolgreich"
        }

        // Material Dialog anzeigen
        MaterialAlertDialogBuilder(requireContext())
            .setTitle(title)
            .setMessage(message)
            .setPositiveButton(R.string.close, null)
            .show()
    }

    /**
     * onDestroyView — Letzter Schritt im Fragment-View-Lifecycle.
     *
     * Die View wird zerstoert (z.B. bei Navigation zu einem anderen Fragment).
     * _binding wird auf null gesetzt, damit das Binding-Objekt (und die gesamte View-Hierarchie)
     * vom Garbage Collector freigegeben werden kann. Ohne diesen Schritt wuerde ein Memory Leak
     * entstehen, da das Fragment (das laenger lebt als seine View) eine Referenz auf die
     * zerstoerte View behalten wuerde.
     */
    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
