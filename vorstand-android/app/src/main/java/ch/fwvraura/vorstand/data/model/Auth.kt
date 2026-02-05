package ch.fwvraura.vorstand.data.model

data class LoginRequest(
    val email: String,
    val password: String
)

data class LoginResponse(
    val success: Boolean,
    val token: String,
    val user: UserInfo
)

data class UserInfo(
    val email: String,
    val role: String,
    val name: String? = null,
    val groups: List<String>? = null
)
