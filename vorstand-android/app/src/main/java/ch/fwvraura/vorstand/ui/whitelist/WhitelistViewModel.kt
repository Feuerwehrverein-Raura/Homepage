package ch.fwvraura.vorstand.ui.whitelist

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import ch.fwvraura.vorstand.VorstandApp
import ch.fwvraura.vorstand.data.api.ApiModule
import ch.fwvraura.vorstand.data.model.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/**
 * ViewModel für die IP-Whitelist-Verwaltung des Kassensystems.
 *
 * Features:
 * - Whitelist aktivieren/deaktivieren
 * - Alle Einträge anzeigen (mit Ablaufzeit)
 * - IPs hinzufügen (permanent)
 * - IPs entfernen
 * - Eigene IP anzeigen und hinzufügen
 */
class WhitelistViewModel(application: Application) : AndroidViewModel(application) {

    private val tokenManager = VorstandApp.instance.tokenManager

    // ============================================
    // STATE FLOWS (Daten)
    // ============================================

    private val _entries = MutableStateFlow<List<WhitelistEntry>>(emptyList())
    val entries: StateFlow<List<WhitelistEntry>> = _entries

    private val _isEnabled = MutableStateFlow(false)
    val isEnabled: StateFlow<Boolean> = _isEnabled

    private val _myIp = MutableStateFlow<String?>(null)
    val myIp: StateFlow<String?> = _myIp

    private val _myIpStatus = MutableStateFlow<WhitelistCheckResponse?>(null)
    val myIpStatus: StateFlow<WhitelistCheckResponse?> = _myIpStatus

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

    private fun bearerToken(): String = "Bearer ${tokenManager.token}"

    // ============================================
    // DATEN LADEN
    // ============================================

    /**
     * Lädt alle Whitelist-Daten: Status, Einträge, eigene IP.
     */
    fun loadAll() {
        loadWhitelistStatus()
        loadEntries()
        loadMyIp()
    }

    /**
     * Whitelist-Status (aktiviert/deaktiviert) abrufen.
     */
    fun loadWhitelistStatus() {
        viewModelScope.launch {
            try {
                val response = ApiModule.whitelistApi.getWhitelistEnabled(bearerToken())
                if (response.isSuccessful) {
                    _isEnabled.value = response.body()?.enabled ?: false
                }
            } catch (e: Exception) {
                // Fehler ignorieren, Status bleibt false
            }
        }
    }

    /**
     * Alle Whitelist-Einträge abrufen.
     */
    fun loadEntries() {
        _isLoading.value = true
        _error.value = null
        viewModelScope.launch {
            try {
                val response = ApiModule.whitelistApi.getWhitelist(bearerToken())
                if (response.isSuccessful) {
                    _entries.value = response.body() ?: emptyList()
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
     * Eigene öffentliche IP-Adresse abrufen.
     */
    fun loadMyIp() {
        viewModelScope.launch {
            try {
                val ipResponse = ApiModule.whitelistApi.getMyIp()
                if (ipResponse.isSuccessful) {
                    _myIp.value = ipResponse.body()?.ip
                }
                val checkResponse = ApiModule.whitelistApi.checkWhitelist()
                if (checkResponse.isSuccessful) {
                    _myIpStatus.value = checkResponse.body()
                }
            } catch (e: Exception) {
                // Eigene IP konnte nicht abgerufen werden
            }
        }
    }

    // ============================================
    // WHITELIST VERWALTEN
    // ============================================

    /**
     * Whitelist aktivieren/deaktivieren.
     */
    fun setEnabled(enabled: Boolean) {
        _isLoading.value = true
        viewModelScope.launch {
            try {
                val request = WhitelistEnabledRequest(enabled)
                val response = ApiModule.whitelistApi.setWhitelistEnabled(bearerToken(), request)
                if (response.isSuccessful) {
                    _isEnabled.value = enabled
                    _actionResult.value = if (enabled) "Whitelist aktiviert" else "Whitelist deaktiviert"
                } else {
                    _error.value = "Fehler (${response.code()})"
                }
            } catch (e: Exception) {
                _error.value = "Fehler: ${e.message}"
            } finally {
                _isLoading.value = false
            }
        }
    }

    /**
     * IP zur Whitelist hinzufügen (permanent).
     */
    fun addIp(ipAddress: String, deviceName: String?) {
        _isLoading.value = true
        viewModelScope.launch {
            try {
                val request = WhitelistAddRequest(ipAddress, deviceName)
                val response = ApiModule.whitelistApi.addToWhitelist(bearerToken(), request)
                if (response.isSuccessful) {
                    _actionResult.value = "IP hinzugefügt"
                    loadEntries()
                    loadMyIp() // Status aktualisieren
                } else {
                    _error.value = "Fehler beim Hinzufügen (${response.code()})"
                }
            } catch (e: Exception) {
                _error.value = "Fehler: ${e.message}"
            } finally {
                _isLoading.value = false
            }
        }
    }

    /**
     * Eigene IP zur Whitelist hinzufügen.
     */
    fun addMyIp(deviceName: String?) {
        val ip = _myIp.value
        if (ip != null) {
            addIp(ip, deviceName ?: "Vorstand App")
        } else {
            _error.value = "Eigene IP konnte nicht ermittelt werden"
        }
    }

    /**
     * IP aus der Whitelist entfernen.
     */
    fun removeIp(id: Int) {
        _isLoading.value = true
        viewModelScope.launch {
            try {
                val response = ApiModule.whitelistApi.removeFromWhitelist(bearerToken(), id)
                if (response.isSuccessful) {
                    _actionResult.value = "IP entfernt"
                    loadEntries()
                    loadMyIp() // Status aktualisieren
                } else {
                    _error.value = "Fehler beim Entfernen (${response.code()})"
                }
            } catch (e: Exception) {
                _error.value = "Fehler: ${e.message}"
            } finally {
                _isLoading.value = false
            }
        }
    }
}
