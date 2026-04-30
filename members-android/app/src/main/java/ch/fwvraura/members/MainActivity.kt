package ch.fwvraura.members

import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import ch.fwvraura.members.data.api.ApiModule
import ch.fwvraura.members.databinding.ActivityMainBinding
import ch.fwvraura.members.ui.events.EventsListFragment
import ch.fwvraura.members.ui.login.LoginActivity
import ch.fwvraura.members.ui.organizer.OrganizerDashboardFragment
import ch.fwvraura.members.ui.profile.ProfileFragment
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Verhindert Edge-to-Edge auf Android 15+ — App malt nicht unter Status-/Navigation-Bar
        @Suppress("DEPRECATION")
        WindowCompat.setDecorFitsSystemWindows(window, true)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val tm = MembersApp.instance.tokenManager
        val isOrganizerMode = tm.accountType == "organizer"

        // Organisator-Tab beim Organisator-Login direkt sichtbar; bei Mitgliedern
        // erst nach Backend-Check (E-Mail-Match auf event.organizer_email).
        binding.bottomNav.menu.findItem(R.id.nav_organizer)?.isVisible = isOrganizerMode
        binding.bottomNav.menu.findItem(R.id.nav_profile)?.isVisible = !isOrganizerMode

        binding.bottomNav.setOnItemSelectedListener { item ->
            val frag: Fragment = when (item.itemId) {
                R.id.nav_events -> EventsListFragment()
                R.id.nav_profile -> ProfileFragment()
                R.id.nav_organizer -> OrganizerDashboardFragment()
                else -> EventsListFragment()
            }
            replaceFragment(frag)
            true
        }

        if (savedInstanceState == null) {
            // Standardansicht: Events fuer alle, Organisator-Dashboard wenn Organisator-Login
            val initial: Fragment = if (isOrganizerMode) OrganizerDashboardFragment() else EventsListFragment()
            replaceFragment(initial)
            binding.bottomNav.selectedItemId =
                if (isOrganizerMode) R.id.nav_organizer else R.id.nav_events
        }

        // Wenn als Mitglied eingeloggt: pruefe ob der User per E-Mail-Match
        // Organisator von einem Event ist, und blende den Tab in diesem Fall ein.
        if (!isOrganizerMode) checkOrganizerEligibility()

        binding.toolbar.setOnMenuItemClickListener { item ->
            if (item.itemId == R.id.action_logout) {
                tm.clear()
                startActivity(Intent(this, LoginActivity::class.java))
                finish()
                true
            } else false
        }
    }

    private fun replaceFragment(fragment: Fragment) {
        supportFragmentManager.beginTransaction()
            .replace(R.id.contentContainer, fragment)
            .commit()
    }

    private fun checkOrganizerEligibility() {
        lifecycleScope.launch {
            try {
                val response = ApiModule.eventsApi.listOrganizedByMe()
                if (response.isSuccessful && !response.body().isNullOrEmpty()) {
                    binding.bottomNav.menu.findItem(R.id.nav_organizer)?.isVisible = true
                }
            } catch (_: Exception) { /* nicht kritisch — Tab bleibt versteckt */ }
        }
    }
}
