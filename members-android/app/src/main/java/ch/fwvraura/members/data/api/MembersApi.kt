package ch.fwvraura.members.data.api

import ch.fwvraura.members.data.model.AustrittRequest
import ch.fwvraura.members.data.model.AustrittResponse
import ch.fwvraura.members.data.model.MemberProfile
import ch.fwvraura.members.data.model.MemberProfileUpdate
import ch.fwvraura.members.data.model.PhotoUploadResponse
import okhttp3.MultipartBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Part

interface MembersApi {
    /** Profil des eingeloggten Mitglieds. Erfordert Authentik-JWT. */
    @GET("members/me")
    suspend fun getMe(): Response<MemberProfile>

    /** Profil-Aenderungen speichern (nur erlaubte Felder). */
    @PUT("members/me")
    suspend fun updateMe(@Body update: MemberProfileUpdate): Response<MemberProfile>

    /** Austritt aus dem Verein beantragen. Loescht keine Daten — Vorstand entscheidet. */
    @POST("members/me/austritt")
    suspend fun requestAustritt(@Body request: AustrittRequest): Response<AustrittResponse>

    /** Mitglieder-Verzeichnis fuer Adressbuch-Sync. */
    @GET("members/directory")
    suspend fun getDirectory(): Response<List<ch.fwvraura.members.data.model.DirectoryEntry>>

    /** Profilfoto hochladen (multipart, Feldname "photo"). Backend skaliert nicht — App muss vorher komprimieren. */
    @Multipart
    @POST("members/me/photo")
    suspend fun uploadPhoto(@Part photo: MultipartBody.Part): Response<PhotoUploadResponse>

    /** Eigenes Profilfoto loeschen. */
    @DELETE("members/me/photo")
    suspend fun deletePhoto(): Response<Unit>

    /** Benachrichtigungs-Einstellungen abrufen. */
    @GET("members/me/notifications")
    suspend fun getNotifications():
        Response<List<ch.fwvraura.members.data.model.NotificationPreference>>

    /** Benachrichtigungs-Einstellungen speichern (alle 4 Typen auf einmal). */
    @PUT("members/me/notifications")
    suspend fun updateNotifications(
        @Body body: ch.fwvraura.members.data.model.NotificationsUpdateRequest
    ): Response<List<ch.fwvraura.members.data.model.NotificationPreference>>
}
