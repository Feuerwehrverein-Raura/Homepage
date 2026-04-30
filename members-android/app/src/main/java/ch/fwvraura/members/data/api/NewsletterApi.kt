package ch.fwvraura.members.data.api

import ch.fwvraura.members.data.model.NewsletterEmailRequest
import ch.fwvraura.members.data.model.NewsletterResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST

/**
 * Oeffentliche Newsletter-Anmeldung (api-dispatch). Kein Auth-Header noetig
 * — der Endpoint funktioniert auch fuer nicht-Mitglieder.
 */
interface NewsletterApi {

    /** Anmeldung — Backend schickt Bestaetigungs-E-Mail mit Token-Link. */
    @POST("newsletter/subscribe")
    suspend fun subscribe(@Body body: NewsletterEmailRequest): Response<NewsletterResponse>

    /** Abmeldung per E-Mail. */
    @POST("newsletter/unsubscribe")
    suspend fun unsubscribe(@Body body: NewsletterEmailRequest): Response<NewsletterResponse>
}
