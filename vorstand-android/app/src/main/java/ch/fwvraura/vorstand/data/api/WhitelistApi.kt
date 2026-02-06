package ch.fwvraura.vorstand.data.api

import ch.fwvraura.vorstand.data.model.*
import retrofit2.Response
import retrofit2.http.*

/**
 * Retrofit API-Interface für die IP-Whitelist des Kassensystems.
 * Base-URL: https://order.fwv-raura.ch/
 */
interface WhitelistApi {

    // ============================================
    // ÖFFENTLICHE ENDPUNKTE (keine Auth nötig)
    // ============================================

    /**
     * Eigene öffentliche IP-Adresse abrufen.
     */
    @GET("api/whitelist/my-ip")
    suspend fun getMyIp(): Response<MyIpResponse>

    /**
     * Prüfen ob die eigene IP freigeschaltet ist.
     */
    @GET("api/whitelist/check")
    suspend fun checkWhitelist(): Response<WhitelistCheckResponse>

    // ============================================
    // GESCHÜTZTE ENDPUNKTE (Auth erforderlich)
    // ============================================

    /**
     * Whitelist-Status abrufen (aktiviert/deaktiviert).
     */
    @GET("api/whitelist/enabled")
    suspend fun getWhitelistEnabled(
        @Header("Authorization") token: String
    ): Response<WhitelistEnabledResponse>

    /**
     * Whitelist aktivieren/deaktivieren.
     */
    @PUT("api/whitelist/enabled")
    suspend fun setWhitelistEnabled(
        @Header("Authorization") token: String,
        @Body request: WhitelistEnabledRequest
    ): Response<WhitelistSuccessResponse>

    /**
     * Alle Whitelist-Einträge abrufen.
     */
    @GET("api/whitelist")
    suspend fun getWhitelist(
        @Header("Authorization") token: String
    ): Response<List<WhitelistEntry>>

    /**
     * IP manuell zur Whitelist hinzufügen (permanent).
     */
    @POST("api/whitelist")
    suspend fun addToWhitelist(
        @Header("Authorization") token: String,
        @Body request: WhitelistAddRequest
    ): Response<WhitelistSuccessResponse>

    /**
     * IP aus der Whitelist entfernen.
     */
    @DELETE("api/whitelist/{id}")
    suspend fun removeFromWhitelist(
        @Header("Authorization") token: String,
        @Path("id") id: Int
    ): Response<WhitelistSuccessResponse>
}
