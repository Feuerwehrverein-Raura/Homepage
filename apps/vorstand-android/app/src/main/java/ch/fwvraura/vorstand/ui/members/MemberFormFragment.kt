package ch.fwvraura.vorstand.ui.members

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.data.api.ApiModule
import ch.fwvraura.vorstand.data.model.MemberCreate
import ch.fwvraura.vorstand.databinding.FragmentMemberFormBinding
import ch.fwvraura.vorstand.util.DateUtils
import com.google.android.material.snackbar.Snackbar
import kotlinx.coroutines.launch

/**
 * MemberFormFragment — Formular zum Erstellen und Bearbeiten eines Mitglieds.
 *
 * Dieses Fragment wird fuer zwei Zwecke verwendet:
 * 1. Neues Mitglied erstellen: memberId ist null, isEdit ist false → POST-Request an die API
 * 2. Bestehendes Mitglied bearbeiten: memberId ist gesetzt, isEdit ist true → PUT-Request an die API
 *
 * Das Formular enthaelt Felder fuer: Anrede, Vorname (Pflichtfeld), Nachname (Pflichtfeld),
 * E-Mail, Telefon, Mobile, Strasse, PLZ, Ort, Geburtstag, Status, Funktion, Eintrittsdatum.
 */
class MemberFormFragment : Fragment() {

    /**
     * View-Binding: Siehe MembersListFragment fuer eine ausfuehrliche Erklaerung
     * des _binding / binding Null-Safety-Patterns.
     */
    private var _binding: FragmentMemberFormBinding? = null
    private val binding get() = _binding!!

    /** Die ID des zu bearbeitenden Mitglieds, oder null wenn ein neues Mitglied erstellt wird. */
    private var memberId: String? = null

    /**
     * isEdit — Computed Property, das prueft ob ein bestehendes Mitglied bearbeitet wird.
     *
     * true = Bearbeiten-Modus (memberId vorhanden) → PUT-Request
     * false = Erstellen-Modus (keine memberId) → POST-Request
     *
     * Wird verwendet um:
     * - Den Toolbar-Titel zu setzen ("Mitglied bearbeiten" vs. "Neues Mitglied")
     * - Zu entscheiden ob bestehende Daten geladen werden
     * - Den richtigen API-Endpunkt aufzurufen (updateMember vs. createMember)
     */
    private val isEdit get() = memberId != null

    /**
     * onCreateView — Inflated das Formular-Layout und erzeugt das Binding-Objekt.
     */
    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentMemberFormBinding.inflate(inflater, container, false)
        return binding.root
    }

    /**
     * onViewCreated — Richtet das Formular ein.
     *
     * Ablauf:
     * 1. Liest die memberId aus den Fragment-Arguments (null bei Neu-Erstellung).
     * 2. Setzt den Toolbar-Titel je nach Modus (Neu/Bearbeiten).
     * 3. Richtet die Zurueck-Navigation ein.
     * 4. Erstellt einen ArrayAdapter fuer das Status-Dropdown (Aktiv, Passiv, Ehrenmitglied).
     *    ArrayAdapter verbindet eine einfache String-Liste mit einem AutoCompleteTextView,
     *    das als Dropdown-Menue funktioniert.
     * 5. Falls Bearbeiten-Modus: Laedt die bestehenden Mitglieder-Daten.
     * 6. Setzt den Click-Listener fuer den Speichern-Button.
     */
    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        memberId = arguments?.getString("memberId")

        // Toolbar-Titel je nach Modus setzen
        binding.toolbar.title = if (isEdit) getString(R.string.member_edit) else getString(R.string.member_new)
        // Zurueck-Navigation
        binding.toolbar.setNavigationOnClickListener { findNavController().navigateUp() }

        // Status-Dropdown: AutoCompleteTextView mit den drei moeglichen Status-Werten
        val statusAdapter = ArrayAdapter(requireContext(), android.R.layout.simple_dropdown_item_1line,
            listOf("Aktiv", "Passiv", "Ehrenmitglied"))
        binding.inputStatus.setAdapter(statusAdapter)

        // Im Bearbeiten-Modus: Bestehende Daten laden und Formular befuellen
        if (isEdit) loadMember()

        // Speichern-Button
        binding.btnSave.setOnClickListener { saveMember() }
    }

    /**
     * loadMember — Laedt die bestehenden Mitglieder-Daten und befuellt die Formularfelder.
     *
     * Wird nur im Bearbeiten-Modus aufgerufen (isEdit == true).
     * Laedt das Mitglied per API-Aufruf und setzt jeden Wert in das entsprechende Eingabefeld.
     *
     * Besonderheiten:
     * - Nullable Felder (z.B. email, telefon) verwenden den Elvis-Operator (?:) mit leerem
     *   String als Fallback, damit das Textfeld nicht "null" anzeigt.
     * - Datumsfelder (Geburtstag, Eintrittsdatum) werden mit DateUtils.formatDate()
     *   in das Schweizer Format (dd.MM.yyyy) umgewandelt.
     * - Status-Dropdown: setText(..., false) — der zweite Parameter (false) verhindert,
     *   dass die Dropdown-Liste beim programmatischen Setzen geoeffnet wird.
     */
    private fun loadMember() {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.membersApi.getMember(memberId!!)
                if (response.isSuccessful) {
                    val m = response.body() ?: return@launch
                    // Formularfelder mit den bestehenden Daten befuellen
                    binding.inputAnrede.setText(m.anrede ?: "")
                    binding.inputVorname.setText(m.vorname)
                    binding.inputNachname.setText(m.nachname)
                    binding.inputEmail.setText(m.email ?: "")
                    binding.inputTelefon.setText(m.telefon ?: "")
                    binding.inputMobile.setText(m.mobile ?: "")
                    binding.inputStrasse.setText(m.strasse ?: "")
                    binding.inputPlz.setText(m.plz ?: "")
                    binding.inputOrt.setText(m.ort ?: "")
                    binding.inputGeburtstag.setText(DateUtils.formatDate(m.geburtstag))
                    // false = Dropdown-Liste nicht automatisch oeffnen
                    binding.inputStatus.setText(m.status ?: "Aktiv", false)
                    binding.inputFunktion.setText(m.funktion ?: "")
                    binding.inputEintrittsdatum.setText(DateUtils.formatDate(m.eintrittsdatum))
                }
            } catch (_: Exception) { }
        }
    }

    /**
     * saveMember — Validiert die Eingaben und speichert das Mitglied ueber die API.
     *
     * Ablauf:
     * 1. Validierung der Pflichtfelder: Vorname und Nachname muessen ausgefuellt sein.
     *    Bei fehlenden Pflichtfeldern wird eine Snackbar-Meldung angezeigt und die Methode
     *    wird mit return abgebrochen.
     *
     * 2. Aufbau des MemberCreate-Objekts:
     *    - Alle Textfelder werden ausgelesen und getrimmt (Leerzeichen entfernt).
     *    - Leere optionale Felder werden auf null gesetzt (ifBlank { null }),
     *      damit sie nicht als leere Strings an die API gesendet werden.
     *    - Datumsfelder werden mit DateUtils.toIsoDate() vom Schweizer Format (dd.MM.yyyy)
     *      in das ISO-Format (yyyy-MM-dd) konvertiert, das die API erwartet.
     *    - Status: Fallback auf "Aktiv" wenn kein Status gewaehlt wurde.
     *
     * 3. API-Aufruf:
     *    - Der Speichern-Button wird deaktiviert, um Doppelklicks zu verhindern.
     *    - Je nach Modus wird entweder updateMember (PUT) oder createMember (POST) aufgerufen.
     *    - Bei Erfolg: Snackbar-Meldung und Zurueck-Navigation.
     *    - Bei Fehler: Snackbar-Fehlermeldung und Button wieder aktivieren.
     */
    private fun saveMember() {
        // Pflichtfelder auslesen und trimmen
        val vorname = binding.inputVorname.text.toString().trim()
        val nachname = binding.inputNachname.text.toString().trim()

        // Validierung: Vorname und Nachname sind Pflichtfelder
        if (vorname.isBlank() || nachname.isBlank()) {
            Snackbar.make(binding.root, "Vorname und Nachname sind Pflichtfelder", Snackbar.LENGTH_SHORT).show()
            return
        }

        // MemberCreate-Objekt zusammenbauen.
        // ifBlank { null }: Gibt null zurueck wenn der String leer oder nur Leerzeichen ist.
        // Das verhindert, dass leere Strings an die API gesendet werden.
        val member = MemberCreate(
            anrede = binding.inputAnrede.text.toString().trim().ifBlank { null },
            vorname = vorname,
            nachname = nachname,
            email = binding.inputEmail.text.toString().trim().ifBlank { null },
            telefon = binding.inputTelefon.text.toString().trim().ifBlank { null },
            mobile = binding.inputMobile.text.toString().trim().ifBlank { null },
            strasse = binding.inputStrasse.text.toString().trim().ifBlank { null },
            plz = binding.inputPlz.text.toString().trim().ifBlank { null },
            ort = binding.inputOrt.text.toString().trim().ifBlank { null },
            // DateUtils.toIsoDate: Konvertiert Schweizer Datum (dd.MM.yyyy) in ISO-Format (yyyy-MM-dd)
            geburtstag = DateUtils.toIsoDate(binding.inputGeburtstag.text.toString().trim()),
            status = binding.inputStatus.text.toString().ifBlank { "Aktiv" },
            funktion = binding.inputFunktion.text.toString().trim().ifBlank { null },
            eintrittsdatum = DateUtils.toIsoDate(binding.inputEintrittsdatum.text.toString().trim())
        )

        // Speichern-Button deaktivieren, um Doppelklicks zu verhindern
        binding.btnSave.isEnabled = false
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                // Je nach Modus: PUT (update) oder POST (create)
                val response = if (isEdit) {
                    ApiModule.membersApi.updateMember(memberId!!, member)
                } else {
                    ApiModule.membersApi.createMember(member)
                }

                if (response.isSuccessful) {
                    // Erfolg: Meldung anzeigen und zurueck zur vorherigen Ansicht navigieren
                    Snackbar.make(binding.root, R.string.member_saved, Snackbar.LENGTH_SHORT).show()
                    findNavController().navigateUp()
                } else {
                    // HTTP-Fehler: Fehlermeldung anzeigen und Button wieder aktivieren
                    Snackbar.make(binding.root, "Fehler beim Speichern (${response.code()})", Snackbar.LENGTH_LONG).show()
                    binding.btnSave.isEnabled = true
                }
            } catch (e: Exception) {
                // Netzwerkfehler: Fehlermeldung anzeigen und Button wieder aktivieren
                Snackbar.make(binding.root, "Netzwerkfehler: ${e.message}", Snackbar.LENGTH_LONG).show()
                binding.btnSave.isEnabled = true
            }
        }
    }

    /**
     * onDestroyView — Raeumt die Binding-Referenz auf.
     *
     * _binding wird auf null gesetzt, damit die View-Hierarchie vom Garbage Collector
     * freigegeben werden kann. Siehe MembersListFragment fuer eine ausfuehrliche Erklaerung.
     */
    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
