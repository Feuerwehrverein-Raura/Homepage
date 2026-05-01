package ch.fwvraura.vorstand

import android.content.Intent
import android.os.Bundle
import android.util.Base64
import android.util.Log
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.NavHostFragment
import androidx.navigation.ui.setupWithNavController
import ch.fwvraura.vorstand.databinding.ActivityMainBinding
import ch.fwvraura.vorstand.ui.login.LoginActivity
import ch.fwvraura.vorstand.util.UpdateChecker
import com.google.gson.Gson
import com.google.gson.annotations.SerializedName
import kotlinx.coroutines.launch

/**
 * Haupt-Activity nach dem Login.
 *
 * Enthaelt die Bottom-Navigation mit 5 Tabs:
 * Mitglieder, Events, Dispatch, Verwaltung, Mehr.
 *
 * Diese Activity wird nur angezeigt, wenn der Benutzer bereits eingeloggt ist.
 * Der Login wird in der LoginActivity abgewickelt, bevor hierhin navigiert wird.
 */
class MainActivity : AppCompatActivity() {

    /** View-Binding fuer activity_main.xml — ermoeglicht typsicheren Zugriff auf alle Views. */
    private lateinit var binding: ActivityMainBinding

    /**
     * Wird beim Erstellen der Activity aufgerufen.
     * Inflated das Layout, richtet die Navigation ein und prueft auf verfuegbare Updates.
     */
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupNavigation()
        checkForUpdates()
    }

    /**
     * Richtet die Bottom-Navigation ein.
     *
     * Holt das NavHostFragment aus dem Layout (der Container, in dem die einzelnen
     * Fragment-Screens angezeigt werden) und verbindet dessen NavController mit der
     * BottomNavigationView. Dadurch wechselt ein Tap auf einen Tab automatisch
     * zum zugehoerigen Fragment (Mitglieder, Events, Dispatch, Verwaltung, Mehr).
     */
    private fun setupNavigation() {
        val navHostFragment = supportFragmentManager
            .findFragmentById(R.id.navHostFragment) as NavHostFragment
        val navController = navHostFragment.navController
        binding.bottomNav.setupWithNavController(navController)
    }

    /**
     * Prueft beim App-Start, ob eine neue Version auf GitHub verfuegbar ist.
     *
     * Startet eine Coroutine im lifecycleScope (wird automatisch abgebrochen,
     * wenn die Activity zerstoert wird). Falls ein Update verfuegbar ist,
     * wird ein Dialog angezeigt, der den Benutzer informiert und zum Download
     * weiterleitet. Bei keinem Update oder einem Fehler passiert nichts.
     */
    private fun checkForUpdates() {
        val checker = UpdateChecker(this)
        lifecycleScope.launch {
            when (val result = checker.checkForUpdate()) {
                is UpdateChecker.UpdateResult.UpdateAvailable -> {
                    checker.showUpdateDialog(result)
                }
                else -> { /* No update or error */ }
            }
        }
    }

    /**
     * Wird aufgerufen wenn die Activity wieder in den Vordergrund kommt
     * (z.B. nach App-Wechsel, Bildschirm einschalten).
     *
     * Prueft proaktiv ob der JWT-Token noch gueltig ist (nicht abgelaufen).
     * Das ist noetig, weil der AuthInterceptor nur bei API-Calls reagiert.
     * Wenn die App stundenlang im Hintergrund war, wird der Benutzer sofort
     * zum Login weitergeleitet, statt erst beim naechsten API-Call.
     */
    override fun onResume() {
        super.onResume()
        checkTokenExpiry()
    }

    /**
     * Prueft ob der gespeicherte JWT-Token abgelaufen ist.
     *
     * Ein JWT besteht aus 3 Teilen, getrennt durch Punkte: header.payload.signature
     * Der Payload (2. Teil) ist Base64-kodiert und enthaelt den "exp"-Claim
     * (Ablaufzeitpunkt als Unix-Timestamp in Sekunden).
     *
     * Wenn der Token abgelaufen ist oder nicht gelesen werden kann,
     * wird der Benutzer automatisch ausgeloggt.
     */
    private fun checkTokenExpiry() {
        val token = VorstandApp.instance.tokenManager.token ?: return

        try {
            // JWT-Payload (2. Teil) extrahieren und Base64-dekodieren
            val parts = token.split(".")
            if (parts.size != 3) {
                logout()
                return
            }
            val payloadJson = String(Base64.decode(parts[1], Base64.URL_SAFE or Base64.NO_PADDING))
            val payload = Gson().fromJson(payloadJson, JwtPayload::class.java)

            // "exp" ist ein Unix-Timestamp in Sekunden
            val nowSeconds = System.currentTimeMillis() / 1000
            if (payload.exp != null && payload.exp < nowSeconds) {
                Log.d("MainActivity", "JWT abgelaufen (exp=${payload.exp}, now=$nowSeconds)")
                logout()
            }
        } catch (e: Exception) {
            Log.e("MainActivity", "JWT-Pruefung fehlgeschlagen", e)
            logout()
        }
    }

    /** Minimale Datenklasse fuer den JWT-Payload (nur "exp" wird benoetigt). */
    private data class JwtPayload(
        @SerializedName("exp") val exp: Long? = null
    )

    /**
     * Meldet den Benutzer ab (Logout).
     *
     * 1. Loescht alle gespeicherten Tokens und Benutzerdaten aus dem TokenManager.
     * 2. Startet die LoginActivity mit den Flags FLAG_ACTIVITY_NEW_TASK und
     *    FLAG_ACTIVITY_CLEAR_TASK, sodass der gesamte Activity-Stack geleert wird
     *    und der Benutzer nicht per Zurueck-Taste wieder in die MainActivity gelangt.
     * 3. Beendet die aktuelle MainActivity mit finish().
     */
    fun logout() {
        VorstandApp.instance.tokenManager.clear()
        startActivity(Intent(this, LoginActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        })
        finish()
    }
}
