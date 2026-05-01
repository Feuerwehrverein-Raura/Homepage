package ch.fwvraura.members.notifications

import android.content.Context
import android.util.Log
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.firebase.messaging.FirebaseMessaging
import com.huawei.agconnect.AGConnectInstance
import com.huawei.hms.aaid.HmsInstanceId
import com.huawei.hms.api.HuaweiApiAvailability
import kotlinx.coroutines.tasks.await

/**
 * Erkennt zur Laufzeit, welcher Push-Provider auf dem Geraet verfuegbar ist
 * und liefert den passenden Geraete-Token.
 *
 * Reihenfolge:
 *  1. Google Mobile Services (FCM) — alle "normalen" Android-Geraete
 *  2. Huawei Mobile Services (HMS) — Huawei/Honor ab Mate 30/P40 (kein GMS)
 *
 * Geraete mit beiden Services (alte Huaweis) bevorzugen FCM, weil das Backend
 * bisher nur FCM kennt und der FCM-Pfad der Standard fuer den Play Store ist.
 */
enum class PushProvider(val wireName: String) {
    /** Firebase Cloud Messaging (Google) */
    FCM("fcm"),
    /** Huawei Push Kit */
    HMS("hms"),
    /** Weder GMS noch HMS — Geraet kann keine Server-Pushes empfangen. */
    NONE("none")
}

object PushProviderResolver {

    private const val TAG = "PushProvider"

    /** Bestimmt den verfuegbaren Provider, ohne einen Token zu holen. */
    fun resolve(context: Context): PushProvider {
        if (isGmsAvailable(context)) return PushProvider.FCM
        if (isHmsAvailable(context)) return PushProvider.HMS
        return PushProvider.NONE
    }

    private fun isGmsAvailable(context: Context): Boolean = try {
        GoogleApiAvailability.getInstance()
            .isGooglePlayServicesAvailable(context) == ConnectionResult.SUCCESS
    } catch (e: Throwable) {
        Log.w(TAG, "GMS-Check fehlgeschlagen: ${e.message}")
        false
    }

    private fun isHmsAvailable(context: Context): Boolean = try {
        HuaweiApiAvailability.getInstance()
            .isHuaweiMobileServicesAvailable(context) == com.huawei.hms.api.ConnectionResult.SUCCESS
    } catch (e: Throwable) {
        // HMS-SDK kann fehlen, falls das Modul nicht eingebunden wurde — das ist
        // okay, dann gibt es nur FCM.
        Log.w(TAG, "HMS-Check fehlgeschlagen: ${e.message}")
        false
    }

    /**
     * Holt den Push-Token fuer den verfuegbaren Provider. Ergebnis kann null sein,
     * wenn weder FCM noch HMS funktionieren oder keine Credentials vorliegen.
     */
    suspend fun fetchToken(context: Context): Pair<PushProvider, String>? {
        return when (resolve(context)) {
            PushProvider.FCM -> fetchFcmToken()?.let { PushProvider.FCM to it }
            PushProvider.HMS -> fetchHmsToken(context)?.let { PushProvider.HMS to it }
            PushProvider.NONE -> null
        }
    }

    private suspend fun fetchFcmToken(): String? = try {
        FirebaseMessaging.getInstance().token.await()
    } catch (e: Exception) {
        Log.w(TAG, "FirebaseMessaging.getToken fehlgeschlagen: ${e.message}")
        null
    }

    /**
     * Huawei: Token kommt synchron via HmsInstanceId. AppId stammt aus
     * agconnect-services.json (client/app_id). Ohne diese Datei → null.
     */
    private fun fetchHmsToken(context: Context): String? = try {
        val appId = AGConnectInstance.getInstance()
            ?.options?.getString("client/app_id")
        if (appId.isNullOrBlank()) {
            Log.w(TAG, "HMS app_id nicht gefunden (agconnect-services.json fehlt?)")
            null
        } else {
            HmsInstanceId.getInstance(context).getToken(appId, "HCM").takeUnless { it.isBlank() }
        }
    } catch (e: Exception) {
        Log.w(TAG, "HmsInstanceId.getToken fehlgeschlagen: ${e.message}")
        null
    }
}
