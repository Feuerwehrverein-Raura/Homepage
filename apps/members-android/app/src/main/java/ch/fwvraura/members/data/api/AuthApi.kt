package ch.fwvraura.members.data.api

import ch.fwvraura.members.data.model.LoginResponse
import ch.fwvraura.members.data.model.OrganizerLoginRequest
import ch.fwvraura.members.data.model.QrLoginRequest
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST

interface AuthApi {

    /** Veranstaltungs-Organisator: Event-spezifische E-Mail + Passwort. */
    @POST("events/login")
    suspend fun organizerLogin(@Body request: OrganizerLoginRequest): Response<LoginResponse>

    /** QR-Login fuer Mitglieder (Backend folgt in Phase 1c). */
    @POST("auth/member/qr-login")
    suspend fun memberQrLogin(@Body request: QrLoginRequest): Response<LoginResponse>

    /** QR-Login fuer Organisatoren (Backend folgt in Phase 1c). */
    @POST("auth/organizer/qr-login")
    suspend fun organizerQrLogin(@Body request: QrLoginRequest): Response<LoginResponse>
}
