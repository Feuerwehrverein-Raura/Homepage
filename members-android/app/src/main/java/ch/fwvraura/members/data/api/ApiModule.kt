package ch.fwvraura.members.data.api

import ch.fwvraura.members.MembersApp
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

// Zentraler Retrofit-Setup. Members- und Events-API laufen beide auf
// api.fwv-raura.ch — Traefik routet anhand des Pfades, ein Retrofit-Client reicht.
object ApiModule {
    private const val API_BASE = "https://api.fwv-raura.ch/"

    private val client: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor(MembersApp.instance.tokenManager))
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    private val retrofit: Retrofit by lazy {
        Retrofit.Builder()
            .baseUrl(API_BASE)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
    }

    val authApi: AuthApi by lazy { retrofit.create(AuthApi::class.java) }
    val eventsApi: EventsApi by lazy { retrofit.create(EventsApi::class.java) }
    val membersApi: MembersApi by lazy { retrofit.create(MembersApi::class.java) }
}
