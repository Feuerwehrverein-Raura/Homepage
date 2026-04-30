package ch.fwvraura.vorstand.data.api

import ch.fwvraura.vorstand.data.model.FeeSettingsUpsert
import ch.fwvraura.vorstand.data.model.GeneratePaymentsRequest
import ch.fwvraura.vorstand.data.model.GeneratePaymentsResponse
import ch.fwvraura.vorstand.data.model.MarkFeePaidRequest
import ch.fwvraura.vorstand.data.model.MembershipFeePayment
import ch.fwvraura.vorstand.data.model.MembershipFeeSettings
import ch.fwvraura.vorstand.data.model.MembershipFeeSummary
import ch.fwvraura.vorstand.data.model.SetReferenceRequest
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface MembershipFeesApi {

    /** Alle Zahlungen fuer ein Jahr. Beinhaltet Mitglied via JOIN. */
    @GET("membership-fees/payments")
    suspend fun listPayments(@Query("year") year: Int): Response<List<MembershipFeePayment>>

    /** Stats fuer ein Jahr. */
    @GET("membership-fees/summary")
    suspend fun getSummary(@Query("year") year: Int): Response<MembershipFeeSummary>

    /** Zahlung als bezahlt markieren. Body optional — Default: heute, Bar/unbekannt. */
    @PATCH("membership-fees/payments/{id}/pay")
    suspend fun markPaid(
        @Path("id") id: String,
        @Body body: MarkFeePaidRequest
    ): Response<MembershipFeePayment>

    /** Zahlung zuruecksetzen auf 'offen'. */
    @PATCH("membership-fees/payments/{id}/unpay")
    suspend fun markUnpaid(@Path("id") id: String): Response<MembershipFeePayment>

    /** Jahres-Einstellung fuer ein bestimmtes Jahr (404 wenn nicht gesetzt). */
    @GET("membership-fees/settings/{year}")
    suspend fun getSettings(@Path("year") year: Int): Response<MembershipFeeSettings>

    /** Jahres-Einstellung erstellen oder aktualisieren (Upsert auf year). */
    @POST("membership-fees/settings")
    suspend fun upsertSettings(@Body body: FeeSettingsUpsert): Response<MembershipFeeSettings>

    /** Beitragslauf erstellen — fuer alle Aktiv-/Passivmitglieder (Ehrenmitglieder ausgenommen). */
    @POST("membership-fees/payments/generate")
    suspend fun generatePayments(@Body body: GeneratePaymentsRequest): Response<GeneratePaymentsResponse>

    /** Bank-Referenznummer einer Zahlung zuweisen. */
    @PATCH("membership-fees/payments/{id}/reference")
    suspend fun setReference(
        @Path("id") id: String,
        @Body body: SetReferenceRequest
    ): Response<MembershipFeePayment>

    /** Beitragsbrief per E-Mail an alle offenen Zustellpraeferenz-E-Mail-Mitglieder. */
    @POST("membership-fees/send-email-bulk")
    suspend fun sendEmailBulk(@Body body: ch.fwvraura.vorstand.data.model.SendEmailBulkRequest):
        Response<ch.fwvraura.vorstand.data.model.SendEmailBulkResponse>

    /** Beitragsbrief per Pingen-Post an alle offenen Zustellpraeferenz-Post-Mitglieder. */
    @POST("membership-fees/send-post-bulk")
    suspend fun sendPostBulk(@Body body: ch.fwvraura.vorstand.data.model.SendEmailBulkRequest):
        Response<ch.fwvraura.vorstand.data.model.SendEmailBulkResponse>
}
