package ch.fwvraura.members

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import ch.fwvraura.members.databinding.ActivityMainBinding
import ch.fwvraura.members.ui.login.LoginActivity

/**
 * Stub-MainActivity fuer Phase 1a — zeigt Begruessung und ermoeglicht Logout.
 * Events-Liste, Anmelde-Formular, Profil und Organisator-Dashboard kommen
 * in Phase 1b/c.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val tm = MembersApp.instance.tokenManager
        val name = tm.userName ?: tm.userEmail ?: "FWV-Mitglied"
        val type = when (tm.accountType) {
            "organizer" -> "Organisator"
            "qr" -> "via QR-Code"
            else -> "Mitglied"
        }
        binding.welcomeText.text = "Hallo $name ($type)"

        binding.toolbar.setOnMenuItemClickListener { item ->
            if (item.itemId == R.id.action_logout) {
                tm.clear()
                startActivity(Intent(this, LoginActivity::class.java))
                finish()
                true
            } else false
        }
    }
}
