package ch.fwvraura.vorstand.ui.mailcow

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import ch.fwvraura.vorstand.data.api.ApiModule
import ch.fwvraura.vorstand.data.model.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class MailcowViewModel : ViewModel() {

    // ============================================
    // STATE FLOWS (Daten)
    // ============================================

    private val _mailboxes = MutableStateFlow<List<Mailbox>>(emptyList())
    val mailboxes: StateFlow<List<Mailbox>> = _mailboxes

    private val _aliases = MutableStateFlow<List<MailAlias>>(emptyList())
    val aliases: StateFlow<List<MailAlias>> = _aliases

    private val _quotaList = MutableStateFlow<List<QuotaInfo>>(emptyList())
    val quotaList: StateFlow<List<QuotaInfo>> = _quotaList

    private val _zustellung = MutableStateFlow<ZustellungResponse?>(null)
    val zustellung: StateFlow<ZustellungResponse?> = _zustellung

    // ============================================
    // STATE FLOWS (UI)
    // ============================================

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error

    private val _actionResult = MutableStateFlow<String?>(null)
    val actionResult: StateFlow<String?> = _actionResult

    fun clearError() { _error.value = null }
    fun clearActionResult() { _actionResult.value = null }

    // ============================================
    // MAILBOXEN
    // ============================================

    fun loadMailboxes() {
        _isLoading.value = true
        _error.value = null
        viewModelScope.launch {
            try {
                val response = ApiModule.mailcowApi.getMailboxes()
                if (response.isSuccessful) {
                    _mailboxes.value = response.body() ?: emptyList()
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

    fun createMailbox(localPart: String, name: String, password: String, quota: Int, active: Boolean) {
        _isLoading.value = true
        viewModelScope.launch {
            try {
                val request = MailboxCreateRequest(
                    localPart = localPart,
                    name = name,
                    password = password,
                    quota = quota,
                    active = if (active) 1 else 0
                )
                val response = ApiModule.mailcowApi.createMailbox(request)
                if (response.isSuccessful) {
                    _actionResult.value = "Mailbox erstellt"
                    loadMailboxes()
                } else {
                    _error.value = "Fehler beim Erstellen (${response.code()})"
                }
            } catch (e: Exception) {
                _error.value = "Fehler: ${e.message}"
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun updateMailbox(email: String, name: String?, quota: Int?, active: Boolean?, password: String?) {
        _isLoading.value = true
        viewModelScope.launch {
            try {
                val request = MailboxUpdateRequest(
                    name = name,
                    quota = quota,
                    active = active?.let { if (it) 1 else 0 },
                    password = password?.takeIf { it.isNotBlank() }
                )
                val response = ApiModule.mailcowApi.updateMailbox(email, request)
                if (response.isSuccessful) {
                    _actionResult.value = "Mailbox aktualisiert"
                    loadMailboxes()
                } else {
                    _error.value = "Fehler beim Aktualisieren (${response.code()})"
                }
            } catch (e: Exception) {
                _error.value = "Fehler: ${e.message}"
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun deleteMailbox(email: String) {
        _isLoading.value = true
        viewModelScope.launch {
            try {
                val response = ApiModule.mailcowApi.deleteMailbox(email)
                if (response.isSuccessful) {
                    _actionResult.value = "Mailbox geloescht"
                    loadMailboxes()
                } else {
                    _error.value = "Fehler beim Loeschen (${response.code()})"
                }
            } catch (e: Exception) {
                _error.value = "Fehler: ${e.message}"
            } finally {
                _isLoading.value = false
            }
        }
    }

    // ============================================
    // ALIASE
    // ============================================

    fun loadAliases() {
        _isLoading.value = true
        _error.value = null
        viewModelScope.launch {
            try {
                val response = ApiModule.mailcowApi.getAliases()
                if (response.isSuccessful) {
                    _aliases.value = response.body() ?: emptyList()
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

    fun createAlias(address: String, goto: String, active: Boolean) {
        _isLoading.value = true
        viewModelScope.launch {
            try {
                val request = AliasCreateRequest(
                    address = address,
                    goto = goto,
                    active = if (active) 1 else 0
                )
                val response = ApiModule.mailcowApi.createAlias(request)
                if (response.isSuccessful) {
                    _actionResult.value = "Alias erstellt"
                    loadAliases()
                } else {
                    _error.value = "Fehler beim Erstellen (${response.code()})"
                }
            } catch (e: Exception) {
                _error.value = "Fehler: ${e.message}"
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun updateAlias(id: Int, goto: String?, active: Boolean?) {
        _isLoading.value = true
        viewModelScope.launch {
            try {
                val request = AliasUpdateRequest(
                    goto = goto,
                    active = active?.let { if (it) 1 else 0 }
                )
                val response = ApiModule.mailcowApi.updateAlias(id, request)
                if (response.isSuccessful) {
                    _actionResult.value = "Alias aktualisiert"
                    loadAliases()
                } else {
                    _error.value = "Fehler beim Aktualisieren (${response.code()})"
                }
            } catch (e: Exception) {
                _error.value = "Fehler: ${e.message}"
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun deleteAlias(id: Int) {
        _isLoading.value = true
        viewModelScope.launch {
            try {
                val response = ApiModule.mailcowApi.deleteAlias(id)
                if (response.isSuccessful) {
                    _actionResult.value = "Alias geloescht"
                    loadAliases()
                } else {
                    _error.value = "Fehler beim Loeschen (${response.code()})"
                }
            } catch (e: Exception) {
                _error.value = "Fehler: ${e.message}"
            } finally {
                _isLoading.value = false
            }
        }
    }

    // ============================================
    // QUOTA
    // ============================================

    fun loadQuota() {
        _isLoading.value = true
        _error.value = null
        viewModelScope.launch {
            try {
                val response = ApiModule.mailcowApi.getQuota()
                if (response.isSuccessful) {
                    _quotaList.value = response.body() ?: emptyList()
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
    // ZUSTELLLISTE
    // ============================================

    fun loadZustellliste() {
        _isLoading.value = true
        _error.value = null
        viewModelScope.launch {
            try {
                val response = ApiModule.mailcowApi.getZustellliste()
                if (response.isSuccessful) {
                    _zustellung.value = response.body()
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

    fun syncAlias() {
        _isLoading.value = true
        viewModelScope.launch {
            try {
                val response = ApiModule.mailcowApi.syncAlias()
                if (response.isSuccessful) {
                    val body = response.body()
                    val count = body?.recipients ?: 0
                    _actionResult.value = "Alias synchronisiert: $count Empfaenger"
                    loadZustellliste()
                } else {
                    _error.value = "Fehler beim Synchronisieren (${response.code()})"
                }
            } catch (e: Exception) {
                _error.value = "Fehler: ${e.message}"
            } finally {
                _isLoading.value = false
            }
        }
    }
}
