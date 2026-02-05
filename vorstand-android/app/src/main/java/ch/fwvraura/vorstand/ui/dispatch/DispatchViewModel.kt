package ch.fwvraura.vorstand.ui.dispatch

import android.util.Base64
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import ch.fwvraura.vorstand.data.api.ApiModule
import ch.fwvraura.vorstand.data.model.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class DispatchViewModel : ViewModel() {

    // E-Mail Templates
    private val _templates = MutableStateFlow<List<EmailTemplate>>(emptyList())
    val templates: StateFlow<List<EmailTemplate>> = _templates

    // Pingen
    private val _pingenAccount = MutableStateFlow<PingenAccount?>(null)
    val pingenAccount: StateFlow<PingenAccount?> = _pingenAccount

    private val _pingenStats = MutableStateFlow<PingenStats?>(null)
    val pingenStats: StateFlow<PingenStats?> = _pingenStats

    private val _pingenLetters = MutableStateFlow<List<PingenLetter>>(emptyList())
    val pingenLetters: StateFlow<List<PingenLetter>> = _pingenLetters

    // Post-Mitglieder (Mitglieder mit Briefzustellung)
    private val _postMembers = MutableStateFlow<List<PostMember>>(emptyList())
    val postMembers: StateFlow<List<PostMember>> = _postMembers

    // Alle Mitglieder (fuer Empfaenger-Auswahl)
    private val _members = MutableStateFlow<List<Member>>(emptyList())
    val members: StateFlow<List<Member>> = _members

    // Versand-Protokoll
    private val _dispatchLog = MutableStateFlow<List<DispatchLogEntry>>(emptyList())
    val dispatchLog: StateFlow<List<DispatchLogEntry>> = _dispatchLog

    // UI State
    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error

    private val _sendResult = MutableStateFlow<String?>(null)
    val sendResult: StateFlow<String?> = _sendResult

    // Staging-Modus (Standard: aktiviert fuer Sicherheit)
    var staging = true
        private set

    // Aktueller Log-Filter
    var logTypeFilter: String? = null
        private set

    fun setStaging(enabled: Boolean) {
        staging = enabled
        loadPingenDashboard()
    }

    fun clearSendResult() {
        _sendResult.value = null
    }

    fun clearError() {
        _error.value = null
    }

    // ============================================
    // TEMPLATES
    // ============================================

    fun loadTemplates() {
        viewModelScope.launch {
            try {
                val response = ApiModule.dispatchApi.getTemplates()
                if (response.isSuccessful) {
                    _templates.value = response.body() ?: emptyList()
                }
            } catch (_: Exception) { }
        }
    }

    // ============================================
    // PINGEN DASHBOARD
    // ============================================

    fun loadPingenDashboard() {
        _isLoading.value = true
        _error.value = null

        viewModelScope.launch {
            try {
                // Account, Stats und Letters parallel laden
                val accountJob = launch {
                    try {
                        val response = ApiModule.dispatchApi.getPingenAccount(staging)
                        if (response.isSuccessful) {
                            _pingenAccount.value = response.body()
                        }
                    } catch (_: Exception) { }
                }

                val statsJob = launch {
                    try {
                        val response = ApiModule.dispatchApi.getPingenStats()
                        if (response.isSuccessful) {
                            _pingenStats.value = response.body()
                        }
                    } catch (_: Exception) { }
                }

                val lettersJob = launch {
                    try {
                        val response = ApiModule.dispatchApi.getPingenLetters()
                        if (response.isSuccessful) {
                            _pingenLetters.value = response.body() ?: emptyList()
                        }
                    } catch (_: Exception) { }
                }

                accountJob.join()
                statsJob.join()
                lettersJob.join()
            } catch (e: Exception) {
                _error.value = "Fehler beim Laden: ${e.message}"
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun checkLetterStatus(externalId: String) {
        viewModelScope.launch {
            try {
                val response = ApiModule.dispatchApi.getPingenLetterStatus(externalId, staging)
                if (response.isSuccessful) {
                    // Brief-Liste neu laden um aktualisierten Status anzuzeigen
                    val lettersResponse = ApiModule.dispatchApi.getPingenLetters()
                    if (lettersResponse.isSuccessful) {
                        _pingenLetters.value = lettersResponse.body() ?: emptyList()
                    }
                }
            } catch (_: Exception) { }
        }
    }

    // ============================================
    // POST-MITGLIEDER
    // ============================================

    fun loadPostMembers() {
        viewModelScope.launch {
            try {
                val response = ApiModule.dispatchApi.getPostMembers()
                if (response.isSuccessful) {
                    _postMembers.value = response.body()?.members ?: emptyList()
                }
            } catch (_: Exception) { }
        }
    }

    // ============================================
    // MITGLIEDER (FUER EMPFAENGER-AUSWAHL)
    // ============================================

    fun loadMembers() {
        viewModelScope.launch {
            try {
                val response = ApiModule.membersApi.getMembers()
                if (response.isSuccessful) {
                    _members.value = response.body() ?: emptyList()
                }
            } catch (_: Exception) { }
        }
    }

    // ============================================
    // VERSAND-PROTOKOLL
    // ============================================

    fun loadDispatchLog(type: String? = logTypeFilter) {
        logTypeFilter = type
        _isLoading.value = true

        viewModelScope.launch {
            try {
                val response = ApiModule.dispatchApi.getDispatchLog(
                    type = type,
                    limit = 100
                )
                if (response.isSuccessful) {
                    _dispatchLog.value = response.body() ?: emptyList()
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

    // ============================================
    // E-MAIL SENDEN
    // ============================================

    fun sendBulkEmail(memberIds: List<String>, templateId: String?, subject: String?, body: String?) {
        _isLoading.value = true
        _sendResult.value = null

        viewModelScope.launch {
            try {
                val response = ApiModule.dispatchApi.sendBulkEmail(
                    BulkEmailRequest(
                        memberIds = memberIds,
                        templateId = templateId,
                        subject = subject,
                        body = body
                    )
                )
                if (response.isSuccessful) {
                    val result = response.body()
                    _sendResult.value = "E-Mail gesendet: ${result?.sent ?: 0} erfolgreich, ${result?.failed ?: 0} fehlgeschlagen"
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

    fun smartDispatch(memberIds: List<String>, templateGroup: String) {
        _isLoading.value = true
        _sendResult.value = null

        viewModelScope.launch {
            try {
                val response = ApiModule.dispatchApi.smartDispatch(
                    SmartDispatchRequest(
                        templateGroup = templateGroup,
                        memberIds = memberIds,
                        staging = staging
                    )
                )
                if (response.isSuccessful) {
                    val summary = response.body()?.summary
                    _sendResult.value = buildString {
                        append("Versand abgeschlossen: ")
                        if ((summary?.email ?: 0) > 0) append("${summary?.email} E-Mail, ")
                        if ((summary?.briefCh ?: 0) > 0) append("${summary?.briefCh} Brief CH, ")
                        if ((summary?.briefDe ?: 0) > 0) append("${summary?.briefDe} Brief DE, ")
                        if ((summary?.skipped ?: 0) > 0) append("${summary?.skipped} uebersprungen")
                    }.trimEnd(' ', ',')
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

    // ============================================
    // PINGEN BRIEF SENDEN
    // ============================================

    fun sendPingenLetter(memberId: String, subject: String, body: String) {
        _isLoading.value = true
        _sendResult.value = null

        viewModelScope.launch {
            try {
                val response = ApiModule.dispatchApi.sendPingenLetter(
                    PingenSendManualRequest(
                        memberId = memberId,
                        subject = subject,
                        body = body,
                        staging = staging
                    )
                )
                if (response.isSuccessful) {
                    _sendResult.value = "Brief wird versendet"
                    loadPingenDashboard()
                } else {
                    _error.value = "Briefversand fehlgeschlagen (${response.code()})"
                }
            } catch (e: Exception) {
                _error.value = "Fehler: ${e.message}"
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun sendPingenPdf(pdfBytes: ByteArray, memberId: String? = null, eventId: String? = null) {
        _isLoading.value = true
        _sendResult.value = null

        viewModelScope.launch {
            try {
                val pdfBase64 = Base64.encodeToString(pdfBytes, Base64.NO_WRAP)
                val response = ApiModule.dispatchApi.sendPingenPdf(
                    PingenSendPdfRequest(
                        memberId = memberId,
                        eventId = eventId,
                        pdfBase64 = pdfBase64,
                        staging = staging
                    )
                )
                if (response.isSuccessful) {
                    _sendResult.value = "PDF-Brief wird versendet"
                    loadPingenDashboard()
                } else {
                    _error.value = "PDF-Versand fehlgeschlagen (${response.code()})"
                }
            } catch (e: Exception) {
                _error.value = "Fehler: ${e.message}"
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun sendPingenBulkPdf(pdfBytes: ByteArray, subject: String?, memberIds: List<String>?) {
        _isLoading.value = true
        _sendResult.value = null

        viewModelScope.launch {
            try {
                val pdfBase64 = Base64.encodeToString(pdfBytes, Base64.NO_WRAP)
                val response = ApiModule.dispatchApi.sendPingenBulkPdf(
                    PingenBulkPdfRequest(
                        pdfBase64 = pdfBase64,
                        subject = subject,
                        memberIds = memberIds,
                        staging = staging
                    )
                )
                if (response.isSuccessful) {
                    val result = response.body()
                    _sendResult.value = "Massen-PDF: ${result?.successCount ?: 0} erfolgreich, ${result?.failedCount ?: 0} fehlgeschlagen"
                    loadPingenDashboard()
                } else {
                    _error.value = "Massen-PDF-Versand fehlgeschlagen (${response.code()})"
                }
            } catch (e: Exception) {
                _error.value = "Fehler: ${e.message}"
            } finally {
                _isLoading.value = false
            }
        }
    }
}
