package ch.fwvraura.vorstand.data.api

import ch.fwvraura.vorstand.data.model.MarkFeePaidRequest
import ch.fwvraura.vorstand.data.model.MembershipFeePayment
import ch.fwvraura.vorstand.data.model.MembershipFeeSummary
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
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
}
