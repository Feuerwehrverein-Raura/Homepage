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

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupNavigation()
        checkForUpdates()
    }

    private fun setupNavigation() {
        val navHostFragment = supportFragmentManager
            .findFragmentById(R.id.navHostFragment) as NavHostFragment
        val navController = navHostFragment.navController
        binding.bottomNav.setupWithNavController(navController)
    }

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

    fun logout() {
        VorstandApp.instance.tokenManager.clear()
        startActivity(Intent(this, LoginActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        })
        finish()
    }
}
