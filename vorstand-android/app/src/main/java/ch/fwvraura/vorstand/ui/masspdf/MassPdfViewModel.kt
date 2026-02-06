package ch.fwvraura.vorstand.ui.masspdf

import android.util.Base64
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import ch.fwvraura.vorstand.data.api.ApiModule
import ch.fwvraura.vorstand.data.model.PingenBulkPdfRequest
import ch.fwvraura.vorstand.data.model.PostMember
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/**
 * MassPdfViewModel — Geschaeftslogik fuer den Massen-PDF-Versand per Post (Pingen).
 *
 * Dieses ViewModel verwaltet den gesamten Zustand und die Logik fuer den Massen-Briefversand:
 * - Laden der Post-Mitglieder (alle Mitglieder mit contact_method='post')
 * - Verwaltung der Empfaenger-Auswahl (einzeln, alle, keine)
 * - Speicherung des ausgewaehlten PDFs (in-memory als ByteArray)
 * - Umschaltung Staging/Produktion
 * - Ausfuehrung des Bulk-Versands via Pingen API
 *
 * StateFlow-Pattern:
 * - Private MutableStateFlow (_xxx) fuer interne Aenderungen
 * - Oeffentliche StateFlow (xxx) als Read-Only Exposition fuer das Fragment
 * - Das Fragment beobachtet die oeffentlichen StateFlows und reagiert auf Aenderungen
 *
 * Pingen-Integration:
 * Pingen ist ein Schweizer Dienst fuer den digitalen Briefversand. Das PDF wird als
 * Base64-String an die API gesendet, Pingen druckt und versendet dann physische Briefe
 * an alle angegebenen Adressen. Kosten: ca. CHF 1.50 pro Brief (Druck + Porto).
 */
class MassPdfViewModel : ViewModel() {

    // =====================================================================
    // STATE FLOWS - Reaktive Datenströme fuer UI-Binding
    // =====================================================================

    /**
     * Liste aller Mitglieder mit Post-Zustellung (contact_method='post').
     * Diese Mitglieder haben keine E-Mail-Adresse oder bevorzugen Briefpost.
     */
    private val _postMembers = MutableStateFlow<List<PostMember>>(emptyList())
    val postMembers: StateFlow<List<PostMember>> = _postMembers

    /**
     * Set der ausgewaehlten Mitglieder-IDs fuer den Versand.
     * Verwendet ein Set fuer O(1) contains-Pruefung.
     * Standard: Alle Mitglieder sind vorausgewaehlt nach dem Laden.
     */
    private val _selectedMemberIds = MutableStateFlow<Set<String>>(emptySet())
    val selectedMemberIds: StateFlow<Set<String>> = _selectedMemberIds

    /**
     * Lade-Zustand: true waehrend API-Calls (Laden oder Versand).
     * Das Fragment zeigt entsprechend SwipeRefresh oder Lade-Overlay.
     */
    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading

    /**
     * Fehlermeldung bei API-Fehlern.
     * Wird als Snackbar im Fragment angezeigt und dann per clearError() zurueckgesetzt.
     */
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error

    /**
     * Ergebnis nach dem Versand (Erfolg/Teil-Erfolg).
     * Wird als Dialog im Fragment angezeigt und dann per clearSendResult() zurueckgesetzt.
     */
    private val _sendResult = MutableStateFlow<SendResult?>(null)
    val sendResult: StateFlow<SendResult?> = _sendResult

    /**
     * Staging-Modus aktiviert/deaktiviert.
     *
     * SICHERHEITSMECHANISMUS: Standard ist TRUE (Staging aktiviert).
     * Im Staging-Modus werden keine echten Briefe versendet und keine Kosten verursacht.
     * Der Benutzer muss explizit auf Produktion umschalten fuer echten Versand.
     */
    private val _staging = MutableStateFlow(true)
    val staging: StateFlow<Boolean> = _staging

    /**
     * Name des ausgewaehlten PDFs (fuer Anzeige im UI).
     * Null wenn noch kein PDF ausgewaehlt wurde.
     */
    private val _pdfFileName = MutableStateFlow<String?>(null)
    val pdfFileName: StateFlow<String?> = _pdfFileName

    // =====================================================================
    // PRIVATE STATE - Nicht-reaktive Daten
    // =====================================================================

    /**
     * PDF-Inhalt als ByteArray (in-memory).
     *
     * Wird NICHT als StateFlow exponiert, da die UI nur den Namen braucht.
     * Die Bytes werden direkt beim Versand zu Base64 konvertiert.
     * Hinweis: Bei sehr grossen PDFs koennte dies zu OutOfMemory fuehren,
     * aber fuer typische Rechnungs-PDFs (< 1 MB) ist das kein Problem.
     */
    private var pdfBytes: ByteArray? = null

    // =====================================================================
    // EINFACHE SETTER/CLEAR METHODEN
    // =====================================================================

    /**
     * Setzt den Staging-Modus.
     *
     * @param enabled true = Staging (keine echten Briefe), false = Produktion (echte Briefe)
     */
    fun setStaging(enabled: Boolean) {
        _staging.value = enabled
    }

    /**
     * Setzt die Fehlermeldung zurueck.
     * Wird vom Fragment aufgerufen nachdem der Fehler angezeigt wurde.
     */
    fun clearError() {
        _error.value = null
    }

    /**
     * Setzt das Versand-Ergebnis zurueck.
     * Wird vom Fragment aufgerufen nachdem der Ergebnis-Dialog geschlossen wurde.
     */
    fun clearSendResult() {
        _sendResult.value = null
    }

    // =====================================================================
    // DATEN-LADEN
    // =====================================================================

    /**
     * Laedt alle Mitglieder mit Post-Zustellung vom Server.
     *
     * Ruft den Endpoint GET /pingen/post-members auf, der alle Mitglieder
     * mit contact_method='post' zurueckgibt. Diese Mitglieder haben entweder
     * keine E-Mail-Adresse oder haben explizit Briefzustellung gewaehlt.
     *
     * Nach erfolgreichem Laden werden standardmaessig ALLE Mitglieder ausgewaehlt,
     * da der typische Use-Case der Massenversand an alle ist (z.B. Jahresrechnung).
     */
    fun loadPostMembers() {
        _isLoading.value = true
        _error.value = null

        // Coroutine im ViewModel-Scope starten (wird bei ViewModel-Clear automatisch abgebrochen)
        viewModelScope.launch {
            try {
                val response = ApiModule.dispatchApi.getPostMembers()
                if (response.isSuccessful) {
                    val members = response.body()?.members ?: emptyList()
                    _postMembers.value = members
                    // Standardmaessig alle Mitglieder vorauswaehlen fuer Massenversand
                    _selectedMemberIds.value = members.map { it.id }.toSet()
                } else {
                    // HTTP-Fehler (z.B. 401 Unauthorized, 500 Internal Server Error)
                    _error.value = "Fehler beim Laden (${response.code()})"
                }
            } catch (e: Exception) {
                // Netzwerkfehler (z.B. keine Internetverbindung, Timeout)
                _error.value = "Netzwerkfehler: ${e.message}"
            } finally {
                // Loading-Status immer zuruecksetzen, auch bei Fehler
                _isLoading.value = false
            }
        }
    }

    // =====================================================================
    // PDF-VERWALTUNG
    // =====================================================================

    /**
     * Speichert das ausgewaehlte PDF im ViewModel.
     *
     * Das PDF wird als ByteArray im Speicher gehalten bis zum Versand.
     * Der Dateiname wird separat fuer die UI-Anzeige gespeichert.
     *
     * @param bytes Die PDF-Datei als ByteArray
     * @param fileName Der Dateiname fuer die Anzeige (z.B. "Rechnung_2024.pdf")
     */
    fun setPdf(bytes: ByteArray, fileName: String) {
        pdfBytes = bytes
        _pdfFileName.value = fileName
    }

    /**
     * Entfernt das ausgewaehlte PDF.
     *
     * Setzt sowohl die Bytes als auch den Dateinamen zurueck.
     * Wird automatisch nach erfolgreichem Versand aufgerufen,
     * um versehentlichen Doppelversand zu vermeiden.
     */
    fun clearPdf() {
        pdfBytes = null
        _pdfFileName.value = null
    }

    // =====================================================================
    // MITGLIEDER-AUSWAHL
    // =====================================================================

    /**
     * Schaltet die Auswahl eines einzelnen Mitglieds um (Toggle).
     *
     * Wenn das Mitglied ausgewaehlt ist -> abwaehlen
     * Wenn das Mitglied nicht ausgewaehlt ist -> auswaehlen
     *
     * @param memberId Die ID des Mitglieds dessen Auswahl umgeschaltet werden soll
     */
    fun toggleMemberSelection(memberId: String) {
        // Immutable Set zu MutableSet kopieren fuer Aenderung
        val current = _selectedMemberIds.value.toMutableSet()
        if (current.contains(memberId)) {
            current.remove(memberId)
        } else {
            current.add(memberId)
        }
        // Neues Set zuweisen (loest StateFlow-Update aus)
        _selectedMemberIds.value = current
    }

    /**
     * Waehlt alle verfuegbaren Mitglieder aus.
     * Erstellt ein neues Set mit allen Mitglieder-IDs aus postMembers.
     */
    fun selectAllMembers() {
        _selectedMemberIds.value = _postMembers.value.map { it.id }.toSet()
    }

    /**
     * Waehlt alle Mitglieder ab (leert die Auswahl).
     */
    fun deselectAllMembers() {
        _selectedMemberIds.value = emptySet()
    }

    // =====================================================================
    // VERSAND
    // =====================================================================

    /**
     * Sendet das PDF an alle ausgewaehlten Mitglieder via Pingen.
     *
     * Ablauf:
     * 1. Validierung: Prueft ob PDF und Empfaenger vorhanden
     * 2. Base64-Kodierung: Konvertiert PDF-Bytes zu Base64-String
     * 3. API-Call: Sendet Request an POST /pingen/send-bulk-pdf
     * 4. Ergebnis: Speichert SendResult fuer Anzeige im Fragment
     * 5. Cleanup: Loescht PDF nach erfolgreichem Versand
     *
     * Sicherheit:
     * - Im Staging-Modus werden keine echten Briefe versendet
     * - Nach erfolgreichem Versand wird das PDF geloescht, um Doppelversand zu vermeiden
     *
     * @param subject Optionaler Betreff/Referenz fuer die Briefe (wird im Pingen-Dashboard angezeigt)
     */
    fun sendBulkPdf(subject: String?) {
        // === Validierung ===
        val bytes = pdfBytes
        if (bytes == null) {
            _error.value = "Kein PDF ausgewählt"
            return
        }

        val memberIds = _selectedMemberIds.value.toList()
        if (memberIds.isEmpty()) {
            _error.value = "Keine Empfänger ausgewählt"
            return
        }

        // === Versand starten ===
        _isLoading.value = true
        _error.value = null

        viewModelScope.launch {
            try {
                // PDF zu Base64 konvertieren fuer JSON-Transport
                // NO_WRAP: Keine Zeilenumbrueche im Base64-String (wichtig fuer JSON)
                val pdfBase64 = Base64.encodeToString(bytes, Base64.NO_WRAP)

                // API-Request erstellen und senden
                val response = ApiModule.dispatchApi.sendPingenBulkPdf(
                    PingenBulkPdfRequest(
                        pdfBase64 = pdfBase64,       // PDF als Base64
                        subject = subject,            // Optionaler Betreff
                        memberIds = memberIds,        // Liste der Empfaenger-IDs
                        staging = _staging.value      // true = Test, false = Produktion
                    )
                )

                if (response.isSuccessful) {
                    // Erfolg: Ergebnis speichern fuer Dialog-Anzeige
                    val result = response.body()
                    _sendResult.value = SendResult(
                        totalRecipients = result?.totalRecipients ?: memberIds.size,
                        successCount = result?.successCount ?: 0,
                        failedCount = result?.failedCount ?: 0,
                        staging = _staging.value
                    )
                    // PDF zuruecksetzen um versehentlichen Doppelversand zu vermeiden
                    clearPdf()
                } else {
                    // HTTP-Fehler (z.B. 400 Bad Request, 500 Internal Server Error)
                    _error.value = "Versand fehlgeschlagen (${response.code()})"
                }
            } catch (e: Exception) {
                // Netzwerkfehler oder andere Exceptions
                _error.value = "Fehler: ${e.message}"
            } finally {
                // Loading-Status immer zuruecksetzen
                _isLoading.value = false
            }
        }
    }

    // =====================================================================
    // DATENKLASSEN
    // =====================================================================

    /**
     * SendResult — Ergebnis eines Massen-PDF-Versands.
     *
     * Wird nach dem Versand erstellt und im Fragment als Dialog angezeigt.
     * Enthaelt alle relevanten Informationen fuer die Benutzer-Rueckmeldung.
     *
     * @property totalRecipients Gesamtanzahl der adressierten Empfaenger
     * @property successCount Anzahl erfolgreich versendeter Briefe
     * @property failedCount Anzahl fehlgeschlagener Briefe (z.B. ungueltige Adresse)
     * @property staging true wenn im Staging-Modus versendet (keine echten Briefe)
     */
    data class SendResult(
        val totalRecipients: Int,
        val successCount: Int,
        val failedCount: Int,
        val staging: Boolean
    )
}
