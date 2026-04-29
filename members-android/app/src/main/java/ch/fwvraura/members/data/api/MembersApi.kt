package ch.fwvraura.members.data.api

import ch.fwvraura.members.data.model.MemberProfile
import retrofit2.Response
import retrofit2.http.GET

interface MembersApi {
    /** Profil des eingeloggten Mitglieds. Erfordert Authentik-JWT. */
    @GET("members/me")
    suspend fun getMe(): Response<MemberProfile>
}
