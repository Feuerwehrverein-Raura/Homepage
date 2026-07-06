package ch.fwvraura.members.data.api

import ch.fwvraura.members.data.model.LoginResponse
import ch.fwvraura.members.data.model.MemberAuthResponse
import ch.fwvraura.members.data.model.MemberLoginRequest
import ch.fwvraura.members.data.model.OrganizerLoginRequest
import ch.fwvraura.members.data.model.QrLoginRequest
import ch.fwvraura.members.data.model.RequestResetRequest
import ch.fwvraura.members.data.model.ResetRequest
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST

interface AuthApi {

    /** Veranstaltungs-Organisator: Event-spezifische E-Mail + Passwort. */
    @POST("events/login")
    suspend fun organizerLogin(@Body request: OrganizerLoginRequest): Response<LoginResponse>

    /** App-natives Mitglieder-Login: E-Mail + App-Passwort. 200 -> token+user, 401 -> {error}. */
    @POST("auth/member/login")
    suspend fun memberLogin(@Body request: MemberLoginRequest): Response<MemberAuthResponse>

    /** Reset-Code anfordern. Antwort immer generisch (200), auch wenn E-Mail unbekannt. */
    @POST("auth/member/request-reset")
    suspend fun requestPasswordReset(@Body request: RequestResetRequest): Response<MemberAuthResponse>

    /** Passwort mit Code neu setzen. 200 -> token+user (direkt eingeloggt), 400/429 -> {error}. */
    @POST("auth/member/reset")
    suspend fun resetPassword(@Body request: ResetRequest): Response<MemberAuthResponse>

    /** QR-Login fuer Mitglieder (Backend folgt in Phase 1c). */
    @POST("auth/member/qr-login")
    suspend fun memberQrLogin(@Body request: QrLoginRequest): Response<LoginResponse>

    /** QR-Login fuer Organisatoren (Backend folgt in Phase 1c). */
    @POST("auth/organizer/qr-login")
    suspend fun organizerQrLogin(@Body request: QrLoginRequest): Response<LoginResponse>
}
