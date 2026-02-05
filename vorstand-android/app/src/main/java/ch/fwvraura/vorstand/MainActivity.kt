package ch.fwvraura.vorstand

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.NavHostFragment
import androidx.navigation.ui.setupWithNavController
import ch.fwvraura.vorstand.databinding.ActivityMainBinding
import ch.fwvraura.vorstand.ui.login.LoginActivity
import ch.fwvraura.vorstand.util.UpdateChecker
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
