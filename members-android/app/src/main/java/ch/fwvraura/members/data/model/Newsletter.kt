package ch.fwvraura.members.data.model

/** Body fuer POST /newsletter/{subscribe,unsubscribe}. */
data class NewsletterEmailRequest(val email: String)

/** Antwort von beiden Newsletter-Endpoints. */
data class NewsletterResponse(
    val success: Boolean = false,
    val message: String? = null
)
