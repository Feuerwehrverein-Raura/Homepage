package ch.fwvraura.vorstand.ui.members

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import ch.fwvraura.vorstand.data.api.ApiModule
import ch.fwvraura.vorstand.data.model.Member
import ch.fwvraura.vorstand.data.model.MemberStats
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class MembersViewModel : ViewModel() {

    private val _members = MutableStateFlow<List<Member>>(emptyList())
    val members: StateFlow<List<Member>> = _members

    private val _stats = MutableStateFlow<MemberStats?>(null)
    val stats: StateFlow<MemberStats?> = _stats

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error

    var currentFilter: String? = null
        private set
    var currentSearch: String? = null
        private set

    fun loadMembers(filter: String? = currentFilter, search: String? = currentSearch) {
        currentFilter = filter
        currentSearch = search
        _isLoading.value = true
        _error.value = null

        viewModelScope.launch {
            try {
                val statusParam = when (filter) {
                    "Aktiv", "Passiv", "Ehren" -> filter
                    else -> null
                }
                val response = ApiModule.membersApi.getMembers(
                    status = statusParam,
                    search = if (search.isNullOrBlank()) null else search
                )
                if (response.isSuccessful) {
                    _members.value = response.body() ?: emptyList()
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

    fun deleteMember(id: String, onSuccess: () -> Unit) {
        viewModelScope.launch {
            try {
                val response = ApiModule.membersApi.deleteMember(id)
                if (response.isSuccessful) {
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
