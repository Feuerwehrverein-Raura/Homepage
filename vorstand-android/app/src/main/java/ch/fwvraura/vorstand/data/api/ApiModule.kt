package ch.fwvraura.vorstand.data.api

import ch.fwvraura.vorstand.util.TokenManager
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object ApiModule {

    private const val BASE_URL = "https://api.fwv-raura.ch/"

    private var retrofit: Retrofit? = null
    private var tokenManager: TokenManager? = null

    fun init(tokenManager: TokenManager) {
        this.tokenManager = tokenManager

        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        }

        val client = OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor(tokenManager))
            .addInterceptor(logging)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()

        retrofit = Retrofit.Builder()
            .baseUrl(BASE_URL)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
    }

    val authApi: AuthApi by lazy { retrofit!!.create(AuthApi::class.java) }
    val membersApi: MembersApi by lazy { retrofit!!.create(MembersApi::class.java) }
    val eventsApi: EventsApi by lazy { retrofit!!.create(EventsApi::class.java) }
    val registrationsApi: MemberRegistrationsApi by lazy { retrofit!!.create(MemberRegistrationsApi::class.java) }
    val auditApi: AuditApi by lazy { retrofit!!.create(AuditApi::class.java) }
}
