package ch.fwvraura.members

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.fragment.app.Fragment
import ch.fwvraura.members.databinding.ActivityMainBinding
import ch.fwvraura.members.ui.events.EventsListFragment
import ch.fwvraura.members.ui.login.LoginActivity
import ch.fwvraura.members.ui.organizer.OrganizerDashboardFragment
import ch.fwvraura.members.ui.profile.ProfileFragment

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val tm = MembersApp.instance.tokenManager
        val isOrganizerMode = tm.accountType == "organizer"

        // Organisator-Tab nur fuer Organisator-Logins anzeigen
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
}
