package ch.fwvraura.members.data.api

import ch.fwvraura.members.data.model.MemberProfile
import ch.fwvraura.members.data.model.MemberProfileUpdate
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PUT

interface MembersApi {
    /** Profil des eingeloggten Mitglieds. Erfordert Authentik-JWT. */
    @GET("members/me")
    suspend fun getMe(): Response<MemberProfile>

    /** Profil-Aenderungen speichern (nur erlaubte Felder). */
    @PUT("members/me")
    suspend fun updateMe(@Body update: MemberProfileUpdate): Response<MemberProfile>
}
