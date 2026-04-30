package ch.fwvraura.members.ui.splash

import android.animation.ObjectAnimator
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.animation.OvershootInterpolator
import androidx.appcompat.app.AppCompatActivity
import ch.fwvraura.members.MainActivity
import ch.fwvraura.members.MembersApp
import ch.fwvraura.members.databinding.ActivitySplashBinding
import ch.fwvraura.members.ui.login.LoginActivity

/**
 * Kurzer Intro-Screen mit dem Banner-Logo. Nach ~1.5s navigiert die Activity
 * je nach Login-Zustand zu MainActivity oder LoginActivity.
 *
 * Auf Android 12+ zeigt das System vorher noch ~200ms das App-Icon (system
 * splash) — der Uebergang ist fliessend, weil beide Hintergruende rot sind.
 */
class SplashActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        @Suppress("DEPRECATION")
        androidx.core.view.WindowCompat.setDecorFitsSystemWindows(window, true)
        val binding = ActivitySplashBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Sanftes Heran-Zoomen waehrend der Anzeigezeit
        binding.splashLogo.scaleX = 0.8f
        binding.splashLogo.scaleY = 0.8f
        binding.splashLogo.alpha = 0f
        binding.splashLogo.animate()
            .scaleX(1f).scaleY(1f).alpha(1f)
            .setInterpolator(OvershootInterpolator(0.8f))
            .setDuration(700)
            .start()

        Handler(Looper.getMainLooper()).postDelayed({
            val target = if (MembersApp.instance.tokenManager.isLoggedIn)
                MainActivity::class.java else LoginActivity::class.java
            startActivity(Intent(this, target))
            overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
            finish()
        }, 1500)
    }
}
