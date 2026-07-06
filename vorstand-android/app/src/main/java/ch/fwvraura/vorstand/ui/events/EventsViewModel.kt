package ch.fwvraura.vorstand.ui.events

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import ch.fwvraura.vorstand.data.api.ApiModule
import ch.fwvraura.vorstand.data.model.Event
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/**
 * EventsViewModel – ViewModel fuer die Events-Listenuebersicht.
 *
 * Verwaltet den Zustand der Events-Liste mit drei StateFlows:
 * - events: Die aktuelle Liste aller Events
 * - isLoading: Ob gerade geladen wird (fuer Ladeindikator/SwipeRefresh)
 * - error: Optionale Fehlermeldung bei Netzwerk- oder API-Fehlern
 *
 * Gleiche Struktur wie MembersViewModel: Laden, Loeschen, Fehlerbehandlung.
 */
class EventsViewModel : ViewModel() {

    /** Interne mutable Liste der Events (privat, nur vom ViewModel aenderbar) */
    private val _events = MutableStateFlow<List<Event>>(emptyList())

    /** Oeffentlicher, nur-lesbarer StateFlow der Events-Liste fuer die UI */
    val events: StateFlow<List<Event>> = _events

    /** Interner Ladezustand – true waehrend eines API-Aufrufs */
    private val _isLoading = MutableStateFlow(false)

    /** Oeffentlicher, nur-lesbarer Ladezustand fuer die UI */
    val isLoading: StateFlow<Boolean> = _isLoading

    /** Interner Fehlerzustand – enthaelt die Fehlermeldung oder null */
    private val _error = MutableStateFlow<String?>(null)

    /** Oeffentlicher, nur-lesbarer Fehlerzustand fuer die UI */
    val error: StateFlow<String?> = _error

    /** Interne Liste der Event-Vorschlaege (status == "proposed", von Mitgliedern eingereicht) */
    private val _proposals = MutableStateFlow<List<Event>>(emptyList())

    /** Oeffentlicher, nur-lesbarer StateFlow der Vorschlaege fuer die UI */
    val proposals: StateFlow<List<Event>> = _proposals

    /**
     * Laedt alle Events vom Server ueber die Events-API.
     *
     * Setzt den Ladezustand auf true und den Fehler auf null zurueck.
     * Bei Erfolg wird die Events-Liste aktualisiert.
     * Bei einem HTTP-Fehler oder einer Netzwerk-Exception wird eine
     * Fehlermeldung im _error-Flow gesetzt.
     * Der Ladezustand wird im finally-Block immer zurueckgesetzt.
     */
    fun loadEvents() {
        _isLoading.value = true
        _error.value = null

        viewModelScope.launch {
            try {
                val response = ApiModule.eventsApi.getEvents()
                if (response.isSuccessful) {
                    _events.value = response.body() ?: emptyList()
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
     * Loescht ein Event anhand seiner ID ueber die API.
     *
     * Bei Erfolg wird die Events-Liste neu geladen und der onSuccess-Callback
     * ausgefuehrt. Bei einem Fehler passiert nichts (stille Fehlerbehandlung).
     *
     * @param id Die eindeutige ID des zu loeschenden Events
     * @param onSuccess Callback der nach erfolgreichem Loeschen aufgerufen wird
     */
    fun deleteEvent(id: String, onSuccess: () -> Unit) {
        viewModelScope.launch {
            try {
                val response = ApiModule.eventsApi.deleteEvent(id)
                if (response.isSuccessful) {
                    loadEvents()
                    onSuccess()
                }
            } catch (_: Exception) { }
        }
    }

    /**
     * Laedt die von Mitgliedern eingereichten Event-Vorschlaege vom Server.
     *
     * Vorschlaege sind sekundaer zur eigentlichen Events-Liste, deshalb wird
     * hier bewusst kein separater Lade- oder Fehlerzustand angezeigt: bei einem
     * Fehler bleibt die zuletzt bekannte Vorschlagsliste erhalten (stille
     * Fehlerbehandlung, analog zu deleteEvent).
     */
    fun loadProposals() {
        viewModelScope.launch {
            try {
                val response = ApiModule.eventsApi.getProposals()
                if (response.isSuccessful) {
                    _proposals.value = response.body() ?: emptyList()
                }
            } catch (_: Exception) { }
        }
    }

    /**
     * Genehmigt einen Event-Vorschlag: setzt den Status von "proposed" auf
     * "planned" ueber PUT /events/{id}. Bei Erfolg (2xx) werden Vorschlaege
     * und Events neu geladen, damit der genehmigte Vorschlag aus der
     * Vorschlags-Sektion verschwindet und in der Events-Liste erscheint.
     *
     * @param id Die eindeutige ID des Vorschlags
     * @param onResult Callback mit true bei Erfolg, false bei Fehler (fuer den Toast)
     */
    fun approveProposal(id: String, onResult: (Boolean) -> Unit) {
        viewModelScope.launch {
            try {
                val response = ApiModule.eventsApi.updateEventStatus(id, mapOf<String, Any?>("status" to "planned"))
                if (response.isSuccessful) {
                    loadProposals()
                    loadEvents()
                    onResult(true)
                } else {
                    onResult(false)
                }
            } catch (_: Exception) {
                onResult(false)
            }
        }
    }

    /**
     * Lehnt einen Event-Vorschlag ab: loescht das Event ueber DELETE /events/{id}.
     * Bei Erfolg werden Vorschlaege und Events neu geladen.
     *
     * @param id Die eindeutige ID des Vorschlags
     * @param onResult Callback mit true bei Erfolg, false bei Fehler (fuer den Toast)
     */
    fun rejectProposal(id: String, onResult: (Boolean) -> Unit) {
        viewModelScope.launch {
            try {
                val response = ApiModule.eventsApi.deleteEvent(id)
                if (response.isSuccessful) {
                    loadProposals()
                    loadEvents()
                    onResult(true)
                } else {
                    onResult(false)
                }
            } catch (_: Exception) {
                onResult(false)
            }
        }
    }
}
