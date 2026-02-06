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
 * ViewModel fuer den Massen-PDF-Versand per Post (Pingen).
 *
 * Ermoeglicht das Hochladen eines PDFs und den Versand an alle
 * oder ausgewaehlte Mitglieder mit Post-Zustellung.
 */
class MassPdfViewModel : ViewModel() {

    // Post-Mitglieder (Mitglieder mit Briefzustellung)
    private val _postMembers = MutableStateFlow<List<PostMember>>(emptyList())
    val postMembers: StateFlow<List<PostMember>> = _postMembers

    // Ausgewaehlte Mitglieder-IDs
    private val _selectedMemberIds = MutableStateFlow<Set<String>>(emptySet())
    val selectedMemberIds: StateFlow<Set<String>> = _selectedMemberIds

    // UI State
    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error

    private val _sendResult = MutableStateFlow<SendResult?>(null)
    val sendResult: StateFlow<SendResult?> = _sendResult

    // Staging-Modus (Standard: aktiviert fuer Sicherheit)
    private val _staging = MutableStateFlow(true)
    val staging: StateFlow<Boolean> = _staging

    // Ausgewaehltes PDF
    private val _pdfFileName = MutableStateFlow<String?>(null)
    val pdfFileName: StateFlow<String?> = _pdfFileName

    private var pdfBytes: ByteArray? = null

    fun setStaging(enabled: Boolean) {
        _staging.value = enabled
    }

    fun clearError() {
        _error.value = null
    }

    fun clearSendResult() {
        _sendResult.value = null
    }

    /**
     * Laedt alle Mitglieder mit Post-Zustellung
     */
    fun loadPostMembers() {
        _isLoading.value = true
        _error.value = null

        viewModelScope.launch {
            try {
                val response = ApiModule.dispatchApi.getPostMembers()
                if (response.isSuccessful) {
                    val members = response.body()?.members ?: emptyList()
                    _postMembers.value = members
                    // Standardmaessig alle auswaehlen
                    _selectedMemberIds.value = members.map { it.id }.toSet()
                } else {
                    _error.value = "Fehler beim Laden (${response.code()})"
                }
            } catch (e: Exception) {
                _error.value = "Netzwerkfehler: ${e.message}"
            } finally {
                _isLoading.value = false
            }
        }
    }

    /**
     * Setzt das PDF fuer den Versand
     */
    fun setPdf(bytes: ByteArray, fileName: String) {
        pdfBytes = bytes
        _pdfFileName.value = fileName
    }

    /**
     * Entfernt das ausgewaehlte PDF
     */
    fun clearPdf() {
        pdfBytes = null
        _pdfFileName.value = null
    }

    /**
     * Schaltet die Auswahl eines Mitglieds um
     */
    fun toggleMemberSelection(memberId: String) {
        val current = _selectedMemberIds.value.toMutableSet()
        if (current.contains(memberId)) {
            current.remove(memberId)
        } else {
            current.add(memberId)
        }
        _selectedMemberIds.value = current
    }

    /**
     * Waehlt alle Mitglieder aus
     */
    fun selectAllMembers() {
        _selectedMemberIds.value = _postMembers.value.map { it.id }.toSet()
    }

    /**
     * Waehlt alle Mitglieder ab
     */
    fun deselectAllMembers() {
        _selectedMemberIds.value = emptySet()
    }

    /**
     * Sendet das PDF an alle ausgewaehlten Mitglieder
     */
    fun sendBulkPdf(subject: String?) {
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

        _isLoading.value = true
        _error.value = null

        viewModelScope.launch {
            try {
                val pdfBase64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                val response = ApiModule.dispatchApi.sendPingenBulkPdf(
                    PingenBulkPdfRequest(
                        pdfBase64 = pdfBase64,
                        subject = subject,
                        memberIds = memberIds,
                        staging = _staging.value
                    )
                )
                if (response.isSuccessful) {
                    val result = response.body()
                    _sendResult.value = SendResult(
                        totalRecipients = result?.totalRecipients ?: memberIds.size,
                        successCount = result?.successCount ?: 0,
                        failedCount = result?.failedCount ?: 0,
                        staging = _staging.value
                    )
                    // PDF zuruecksetzen nach erfolgreichem Versand
                    clearPdf()
                } else {
                    _error.value = "Versand fehlgeschlagen (${response.code()})"
                }
            } catch (e: Exception) {
                _error.value = "Fehler: ${e.message}"
            } finally {
                _isLoading.value = false
            }
        }
    }

    data class SendResult(
        val totalRecipients: Int,
        val successCount: Int,
        val failedCount: Int,
        val staging: Boolean
    )
}
