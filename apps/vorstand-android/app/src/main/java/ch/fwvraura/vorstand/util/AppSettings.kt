package ch.fwvraura.vorstand.util

import android.content.Context
import android.content.SharedPreferences
import androidx.appcompat.app.AppCompatDelegate

/**
 * Verwaltet App-Einstellungen in SharedPreferences.
 *
 * Einstellungen:
 * - Theme (System/Hell/Dunkel)
 * - Benachrichtigungs-Intervall
 * - Benachrichtigungen aktiviert
 */
class AppSettings(context: Context) {

    private val prefs: SharedPreferences = context.getSharedPreferences(
        PREFS_NAME, Context.MODE_PRIVATE
    )

    // ============================================
    // THEME
    // ============================================

    var themeMode: Int
        get() = prefs.getInt(KEY_THEME_MODE, AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM)
        set(value) {
            prefs.edit().putInt(KEY_THEME_MODE, value).apply()
            AppCompatDelegate.setDefaultNightMode(value)
        }

    fun applyTheme() {
        AppCompatDelegate.setDefaultNightMode(themeMode)
    }

    // ============================================
    // BENACHRICHTIGUNGEN
    // ============================================

    var notificationsEnabled: Boolean
        get() = prefs.getBoolean(KEY_NOTIFICATIONS_ENABLED, true)
        set(value) {
            prefs.edit().putBoolean(KEY_NOTIFICATIONS_ENABLED, value).apply()
        }

    /** Intervall in Minuten (15, 30, 60, 120, 240) */
    var notificationIntervalMinutes: Int
        get() = prefs.getInt(KEY_NOTIFICATION_INTERVAL, 60)
        set(value) {
            prefs.edit().putInt(KEY_NOTIFICATION_INTERVAL, value).apply()
        }

    // ============================================
    // UPDATE CHECKS
    // ============================================

    var autoUpdateCheck: Boolean
        get() = prefs.getBoolean(KEY_AUTO_UPDATE_CHECK, true)
        set(value) {
            prefs.edit().putBoolean(KEY_AUTO_UPDATE_CHECK, value).apply()
        }

    companion object {
        private const val PREFS_NAME = "fwv_vorstand_settings"
        private const val KEY_THEME_MODE = "theme_mode"
        private const val KEY_NOTIFICATIONS_ENABLED = "notifications_enabled"
        private const val KEY_NOTIFICATION_INTERVAL = "notification_interval"
        private const val KEY_AUTO_UPDATE_CHECK = "auto_update_check"

        // Theme Mode Konstanten (für UI)
        const val THEME_SYSTEM = AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
        const val THEME_LIGHT = AppCompatDelegate.MODE_NIGHT_NO
        const val THEME_DARK = AppCompatDelegate.MODE_NIGHT_YES
    }
}
