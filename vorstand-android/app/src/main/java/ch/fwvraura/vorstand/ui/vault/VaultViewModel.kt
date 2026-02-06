package ch.fwvraura.vorstand.ui.vault

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import ch.fwvraura.vorstand.data.api.ApiModule
import ch.fwvraura.vorstand.data.model.*
import ch.fwvraura.vorstand.util.BitwardenCrypto
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import java.util.UUID

class VaultViewModel : ViewModel() {

    private val api = ApiModule.vaultwardenApi

    private val _allItems = MutableStateFlow<List<DecryptedVaultItem>>(emptyList())
    private val _searchQuery = MutableStateFlow("")
    private val _vaultItems = MutableStateFlow<List<DecryptedVaultItem>>(emptyList())
    val vaultItems: StateFlow<List<DecryptedVaultItem>> = _vaultItems

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error

    private val _isAuthenticated = MutableStateFlow(false)
    val isAuthenticated: StateFlow<Boolean> = _isAuthenticated

    // In-memory only — never persisted
    private var accessToken: String? = null
    private var symmetricKey: BitwardenCrypto.SymmetricKey? = null
    private var rsaPrivateKeyBytes: ByteArray? = null
    private var orgKeys: Map<String, BitwardenCrypto.SymmetricKey> = emptyMap()
    private var orgNames: Map<String, String> = emptyMap()

    init {
        viewModelScope.launch {
            combine(_allItems, _searchQuery) { items, query ->
                if (query.isBlank()) items
                else items.filter { item ->
                    item.name.contains(query, ignoreCase = true) ||
                    item.subtitle?.contains(query, ignoreCase = true) == true ||
                    item.details?.contains(query, ignoreCase = true) == true ||
                    item.organizationName?.contains(query, ignoreCase = true) == true
                }
            }.collect { filtered ->
                _vaultItems.value = filtered
            }
        }
    }

    fun search(query: String) {
        _searchQuery.value = query
    }

    fun login(email: String, masterPassword: String) {
        viewModelScope.launch(Dispatchers.IO) {
            _isLoading.value = true
            _error.value = null

            try {
                // 1. Pre-Login
                val preLoginResponse = api.preLogin(VaultPreLoginRequest(email))
                if (!preLoginResponse.isSuccessful) {
                    _error.value = "Pre-Login fehlgeschlagen: ${preLoginResponse.code()}"
                    _isLoading.value = false
                    return@launch
                }
                val preLogin = preLoginResponse.body()!!
                val iterations = preLogin.kdfIterations

                // 2. Derive keys
                val masterKey = BitwardenCrypto.deriveMasterKey(masterPassword, email, iterations)
                val stretchedKey = BitwardenCrypto.deriveStretchedKey(masterKey)
                val passwordHash = BitwardenCrypto.deriveMasterPasswordHash(masterKey, masterPassword)

                // 3. Login
                val deviceId = UUID.randomUUID().toString()
                val loginResponse = api.login(
                    username = email,
                    password = passwordHash,
                    deviceIdentifier = deviceId
                )
                if (!loginResponse.isSuccessful) {
                    val errorBody = loginResponse.errorBody()?.string() ?: ""
                    _error.value = "Login fehlgeschlagen: ${loginResponse.code()} $errorBody"
                    _isLoading.value = false
                    return@launch
                }
                val loginData = loginResponse.body()!!
                accessToken = loginData.accessToken

                // 4. Decrypt symmetric key
                val encKey = loginData.key
                if (encKey != null) {
                    symmetricKey = BitwardenCrypto.decryptSymmetricKey(encKey, stretchedKey)
                }
                if (symmetricKey == null) {
                    _error.value = "Symmetric Key konnte nicht entschlüsselt werden"
                    _isLoading.value = false
                    return@launch
                }

                // 5. Decrypt RSA private key (for org keys)
                val encPrivateKey = loginData.privateKey
                if (encPrivateKey != null) {
                    rsaPrivateKeyBytes = BitwardenCrypto.decryptRsaPrivateKey(encPrivateKey, symmetricKey!!)
                }

                _isAuthenticated.value = true

                // 6. Sync vault
                syncVault()

            } catch (e: Exception) {
                Log.e("VaultVM", "Login error", e)
                _error.value = e.message ?: "Unbekannter Fehler"
                _isLoading.value = false
            }
        }
    }

    fun refresh() {
        if (_isAuthenticated.value) {
            syncVault()
        }
    }

    private fun syncVault() {
        viewModelScope.launch(Dispatchers.IO) {
            _isLoading.value = true
            _error.value = null

            try {
                val token = accessToken ?: return@launch
                val syncResponse = api.sync("Bearer $token")
                if (!syncResponse.isSuccessful) {
                    _error.value = "Sync fehlgeschlagen: ${syncResponse.code()}"
                    _isLoading.value = false
                    return@launch
                }

                val sync = syncResponse.body()!!

                // Decrypt org keys
                val orgs = sync.profile?.organizations ?: emptyList()
                orgNames = orgs.associate { (it.id ?: "") to (it.name ?: "") }
                if (rsaPrivateKeyBytes != null) {
                    orgKeys = orgs.mapNotNull { org ->
                        val orgKey = org.key ?: return@mapNotNull null
                        val decrypted = BitwardenCrypto.decryptOrgKey(orgKey, rsaPrivateKeyBytes!!)
                            ?: return@mapNotNull null
                        (org.id ?: "") to decrypted
                    }.toMap()
                }

                // Decrypt ciphers
                val ciphers = sync.ciphers ?: emptyList()
                val decryptedItems = ciphers.mapNotNull { cipher ->
                    decryptCipher(cipher)
                }

                // Sort: org items first (grouped by org), then personal
                val sorted = decryptedItems.sortedWith(
                    compareByDescending<DecryptedVaultItem> { it.organizationName != null }
                        .thenBy { it.organizationName ?: "" }
                        .thenBy { it.name.lowercase() }
                )

                _allItems.value = sorted
                _isLoading.value = false

            } catch (e: Exception) {
                Log.e("VaultVM", "Sync error", e)
                _error.value = e.message ?: "Sync fehlgeschlagen"
                _isLoading.value = false
            }
        }
    }

    private fun decryptCipher(cipher: VaultCipher): DecryptedVaultItem? {
        val key = if (cipher.organizationId != null) {
            orgKeys[cipher.organizationId] ?: symmetricKey
        } else {
            symmetricKey
        } ?: return null

        val name = BitwardenCrypto.decryptEncString(cipher.name, key) ?: return null
        val notes = BitwardenCrypto.decryptEncString(cipher.notes, key)
        val orgName = cipher.organizationId?.let { orgNames[it] }

        return when (cipher.type) {
            DecryptedVaultItem.TYPE_LOGIN -> decryptLoginCipher(cipher, key, name, notes, orgName)
            DecryptedVaultItem.TYPE_SECURE_NOTE -> decryptNoteCipher(cipher, key, name, notes, orgName)
            DecryptedVaultItem.TYPE_CARD -> decryptCardCipher(cipher, key, name, notes, orgName)
            DecryptedVaultItem.TYPE_IDENTITY -> decryptIdentityCipher(cipher, key, name, notes, orgName)
            else -> null
        }
    }

    private fun decryptLoginCipher(
        cipher: VaultCipher, key: BitwardenCrypto.SymmetricKey,
        name: String, notes: String?, orgName: String?
    ): DecryptedVaultItem {
        val login = cipher.login
        val username = BitwardenCrypto.decryptEncString(login?.username, key)
        val password = BitwardenCrypto.decryptEncString(login?.password, key)
        val totp = BitwardenCrypto.decryptEncString(login?.totp, key)
        val uri = login?.uris?.firstOrNull()?.let {
            BitwardenCrypto.decryptEncString(it.uri, key)
        }

        val copyFields = mutableMapOf<String, String>()
        if (!username.isNullOrBlank()) copyFields["Benutzer"] = username
        if (!password.isNullOrBlank()) copyFields["Passwort"] = password
        if (!totp.isNullOrBlank()) copyFields["TOTP"] = totp
        if (!uri.isNullOrBlank()) copyFields["URI"] = uri
        if (!notes.isNullOrBlank()) copyFields["Notiz"] = notes

        return DecryptedVaultItem(
            id = cipher.id ?: "",
            type = DecryptedVaultItem.TYPE_LOGIN,
            name = name,
            subtitle = username,
            details = uri,
            notes = notes,
            organizationName = orgName,
            copyFields = copyFields
        )
    }

    private fun decryptNoteCipher(
        cipher: VaultCipher, key: BitwardenCrypto.SymmetricKey,
        name: String, notes: String?, orgName: String?
    ): DecryptedVaultItem {
        val copyFields = mutableMapOf<String, String>()
        if (!notes.isNullOrBlank()) copyFields["Notiz"] = notes

        return DecryptedVaultItem(
            id = cipher.id ?: "",
            type = DecryptedVaultItem.TYPE_SECURE_NOTE,
            name = name,
            subtitle = null,
            details = notes?.take(80),
            notes = notes,
            organizationName = orgName,
            copyFields = copyFields
        )
    }

    private fun decryptCardCipher(
        cipher: VaultCipher, key: BitwardenCrypto.SymmetricKey,
        name: String, notes: String?, orgName: String?
    ): DecryptedVaultItem {
        val card = cipher.card
        val cardholderName = BitwardenCrypto.decryptEncString(card?.cardholderName, key)
        val brand = BitwardenCrypto.decryptEncString(card?.brand, key)
        val number = BitwardenCrypto.decryptEncString(card?.number, key)
        val expMonth = BitwardenCrypto.decryptEncString(card?.expMonth, key)
        val expYear = BitwardenCrypto.decryptEncString(card?.expYear, key)
        val code = BitwardenCrypto.decryptEncString(card?.code, key)

        val subtitle = listOfNotNull(brand, cardholderName).joinToString(" - ").ifBlank { null }
        val maskedNumber = number?.let {
            if (it.length >= 4) "**** ${it.takeLast(4)}" else it
        }
        val expiry = if (expMonth != null && expYear != null) "$expMonth/$expYear" else null
        val details = listOfNotNull(maskedNumber, expiry).joinToString(" | ").ifBlank { null }

        val copyFields = mutableMapOf<String, String>()
        if (!number.isNullOrBlank()) copyFields["Kartennummer"] = number
        if (!code.isNullOrBlank()) copyFields["Sicherheitscode"] = code
        if (!cardholderName.isNullOrBlank()) copyFields["Karteninhaber"] = cardholderName
        if (!notes.isNullOrBlank()) copyFields["Notiz"] = notes

        return DecryptedVaultItem(
            id = cipher.id ?: "",
            type = DecryptedVaultItem.TYPE_CARD,
            name = name,
            subtitle = subtitle,
            details = details,
            notes = notes,
            organizationName = orgName,
            copyFields = copyFields
        )
    }

    private fun decryptIdentityCipher(
        cipher: VaultCipher, key: BitwardenCrypto.SymmetricKey,
        name: String, notes: String?, orgName: String?
    ): DecryptedVaultItem {
        val identity = cipher.identity
        val firstName = BitwardenCrypto.decryptEncString(identity?.firstName, key)
        val lastName = BitwardenCrypto.decryptEncString(identity?.lastName, key)
        val company = BitwardenCrypto.decryptEncString(identity?.company, key)
        val email = BitwardenCrypto.decryptEncString(identity?.email, key)
        val phone = BitwardenCrypto.decryptEncString(identity?.phone, key)

        val fullName = listOfNotNull(firstName, lastName).joinToString(" ").ifBlank { null }
        val subtitle = fullName ?: company
        val details = listOfNotNull(email, phone).joinToString(" | ").ifBlank { null }

        val copyFields = mutableMapOf<String, String>()
        if (!fullName.isNullOrBlank()) copyFields["Name"] = fullName
        if (!email.isNullOrBlank()) copyFields["E-Mail"] = email
        if (!phone.isNullOrBlank()) copyFields["Telefon"] = phone
        if (!company.isNullOrBlank()) copyFields["Firma"] = company
        if (!notes.isNullOrBlank()) copyFields["Notiz"] = notes

        return DecryptedVaultItem(
            id = cipher.id ?: "",
            type = DecryptedVaultItem.TYPE_IDENTITY,
            name = name,
            subtitle = subtitle,
            details = details,
            notes = notes,
            organizationName = orgName,
            copyFields = copyFields
        )
    }

    fun logout() {
        accessToken = null
        symmetricKey = null
        rsaPrivateKeyBytes = null
        orgKeys = emptyMap()
        orgNames = emptyMap()
        _allItems.value = emptyList()
        _isAuthenticated.value = false
        _error.value = null
    }
}
