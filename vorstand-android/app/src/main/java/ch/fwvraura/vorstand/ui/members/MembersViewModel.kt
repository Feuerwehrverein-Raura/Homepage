package ch.fwvraura.vorstand.ui.members

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import ch.fwvraura.vorstand.data.api.ApiModule
import ch.fwvraura.vorstand.data.model.Member
import ch.fwvraura.vorstand.data.model.MemberStats
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/**
 * MembersViewModel — ViewModel fuer die Mitglieder-Liste.
 *
 * Ein ViewModel haelt Daten ueber Konfigurationsaenderungen hinweg (z.B. Screen-Rotation).
 * Wenn der Benutzer das Geraet dreht, wird das Fragment zerstoert und neu erstellt,
 * aber das ViewModel bleibt bestehen. Dadurch muessen die Daten nicht erneut geladen werden.
 *
 * Dieses ViewModel verwaltet:
 * - Die Mitglieder-Liste (members)
 * - Statistik-Daten (stats)
 * - Den Lade-Zustand (isLoading)
 * - Fehlermeldungen (error)
 * - Den aktuellen Filter und Suchbegriff (currentFilter, currentSearch)
 */
class MembersViewModel : ViewModel() {

    /**
     * MutableStateFlow fuer die Mitglieder-Liste.
     *
     * MutableStateFlow ist ein reaktiver Datentyp aus Kotlin Coroutines:
     * - Er haelt immer einen aktuellen Wert (hier: eine Liste von Member-Objekten).
     * - Wenn sich der Wert aendert, werden alle Beobachter (Collectors) automatisch benachrichtigt.
     * - Die UI (Fragment) sammelt diesen Flow und aktualisiert sich selbststaendig.
     *
     * _members (mit Unterstrich) ist privat und mutable — nur das ViewModel darf den Wert aendern.
     * members (ohne Unterstrich) ist oeffentlich und read-only (StateFlow) — die UI kann nur lesen.
     * Dieses Pattern nennt sich "Backing Property" und schuetzt vor ungewollten Aenderungen von aussen.
     */
    private val _members = MutableStateFlow<List<Member>>(emptyList())
    val members: StateFlow<List<Member>> = _members

    /**
     * MutableStateFlow fuer die Mitglieder-Statistik (z.B. Anzahl aktiv, passiv, ehren).
     * Startwert ist null, bis die Statistik erfolgreich geladen wurde.
     */
    private val _stats = MutableStateFlow<MemberStats?>(null)
    val stats: StateFlow<MemberStats?> = _stats

    /**
     * MutableStateFlow fuer den Lade-Zustand.
     * true = Daten werden gerade geladen, false = kein Ladevorgang aktiv.
     * Die UI nutzt diesen Wert, um einen Ladeindikator anzuzeigen oder zu verstecken.
     */
    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading

    /**
     * MutableStateFlow fuer Fehlermeldungen.
     * null = kein Fehler vorhanden, String = Fehlerbeschreibung.
     * Die UI zeigt basierend auf diesem Wert eine Fehlermeldung an.
     */
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error

    /**
     * Aktueller Status-Filter (z.B. "Aktiv", "Passiv", "Ehren") oder null fuer alle.
     * Wird bei jedem Aufruf von loadMembers() aktualisiert und gespeichert,
     * damit der Filter bei einem erneuten Laden (z.B. nach Loeschen) beibehalten wird.
     * "private set" bedeutet: Nur innerhalb dieser Klasse aenderbar, aber von aussen lesbar.
     */
    var currentFilter: String? = null
        private set

    /**
     * Aktueller Suchbegriff oder null wenn keine Suche aktiv ist.
     * Funktioniert analog zu currentFilter — wird gespeichert und bei erneutem Laden wiederverwendet.
     */
    var currentSearch: String? = null
        private set

    /**
     * loadMembers — Laedt die Mitglieder-Liste von der API.
     *
     * Kann mit optionalem Filter (Status) und Suchbegriff aufgerufen werden.
     * Standardmaessig werden die aktuell gespeicherten Werte (currentFilter, currentSearch) verwendet,
     * sodass z.B. nach dem Loeschen eines Mitglieds die Liste mit denselben Filtern neu geladen wird.
     *
     * Ablauf:
     * 1. Filter und Suchbegriff werden gespeichert.
     * 2. Lade-Zustand wird auf true gesetzt, Fehler wird zurueckgesetzt.
     * 3. Asynchroner API-Aufruf in einer Coroutine (viewModelScope.launch).
     *    viewModelScope ist an den Lifecycle des ViewModels gebunden — wird das ViewModel zerstoert,
     *    werden alle laufenden Coroutinen automatisch abgebrochen.
     * 4. Bei Erfolg: Mitglieder-Liste wird aktualisiert.
     * 5. Bei Fehler: Fehlermeldung wird gesetzt.
     * 6. Im finally-Block: Lade-Zustand wird auf false zurueckgesetzt (egal ob Erfolg oder Fehler).
     *
     * @param filter Status-Filter ("Aktiv", "Passiv", "Ehren") oder null fuer alle
     * @param search Suchbegriff oder null fuer keine Suche
     */
    fun loadMembers(filter: String? = currentFilter, search: String? = currentSearch) {
        currentFilter = filter
        currentSearch = search
        _isLoading.value = true
        _error.value = null

        viewModelScope.launch {
            try {
                // Filter-Wert fuer die API: Nur gueltige Status-Werte werden uebergeben
                val statusParam = when (filter) {
                    "Aktiv", "Passiv", "Ehren" -> filter
                    else -> null
                }
                // API-Aufruf: Laedt Mitglieder mit optionalem Status-Filter und Suchbegriff
                val response = ApiModule.membersApi.getMembers(
                    status = statusParam,
                    search = if (search.isNullOrBlank()) null else search
                )
                if (response.isSuccessful) {
                    // Erfolg: Liste aktualisieren (leere Liste als Fallback wenn Body null ist)
                    _members.value = response.body() ?: emptyList()
                } else {
                    // HTTP-Fehler (z.B. 400, 500): Fehlermeldung mit Status-Code setzen
                    _error.value = "Fehler beim Laden (${response.code()})"
                }
            } catch (e: Exception) {
                // Netzwerkfehler (z.B. kein Internet, Timeout): Fehlermeldung setzen
                _error.value = "Netzwerkfehler: ${e.message}"
            } finally {
                // Lade-Zustand zuruecksetzen, egal ob Erfolg oder Fehler
                _isLoading.value = false
            }
        }
    }

    /**
     * loadStats — Laedt die Mitglieder-Statistik von der API.
     *
     * Ruft die Statistik-Uebersicht ab (z.B. Anzahl aktive/passive/Ehrenmitglieder).
     * Fehler werden hier bewusst ignoriert (leerer catch-Block), da die Statistik
     * nicht kritisch ist und die Hauptfunktionalitaet nicht beeintraechtigen soll.
     */
    fun loadStats() {
        viewModelScope.launch {
            try {
                val response = ApiModule.membersApi.getStats()
                if (response.isSuccessful) {
                    _stats.value = response.body()
                }
            } catch (_: Exception) { }
        }
    }

    /**
     * deleteMember — Loescht ein Mitglied ueber die API.
     *
     * Ablauf:
     * 1. Sendet einen DELETE-Request an die API mit der Mitglieder-ID.
     * 2. Bei Erfolg: Laedt die Mitglieder-Liste neu (mit aktuellen Filtern) und
     *    ruft den onSuccess-Callback auf (z.B. um zurueck zu navigieren).
     * 3. Bei Fehler: Setzt eine Fehlermeldung.
     *
     * @param id Die eindeutige ID des zu loeschenden Mitglieds
     * @param onSuccess Callback-Funktion, die bei erfolgreichem Loeschen aufgerufen wird
     */
    fun deleteMember(id: String, onSuccess: () -> Unit) {
        viewModelScope.launch {
            try {
                val response = ApiModule.membersApi.deleteMember(id)
                if (response.isSuccessful) {
                    // Erfolgreich geloescht: Liste neu laden und Erfolg melden
                    loadMembers()
                    onSuccess()
                } else {
                    _error.value = "Löschen fehlgeschlagen"
                }
            } catch (e: Exception) {
                _error.value = "Fehler: ${e.message}"
            }
        }
    }
}
