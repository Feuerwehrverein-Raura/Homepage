package ch.fwvraura.kitchendisplay

import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.view.View
import android.view.WindowManager
import androidx.preference.PreferenceManager

/** Kiosk-Hilfen und gespeicherte Einstellungen an einem Ort. */
object Kiosk {
    const val PREF_STATION = "station"
    const val PREF_SERVER_URL = "server_url"
    const val PREF_SOUND = "sound_enabled"
    const val PREF_AS_HOME = "as_home"

    const val STATION_KITCHEN = "kitchen"
    const val STATION_BAR = "bar"
    const val STATION_ALL = "all"

    private fun prefs(context: Context) = PreferenceManager.getDefaultSharedPreferences(context)

    /** Gewaehlte Station oder null, solange noch keine gewaehlt wurde. */
    fun station(context: Context): String? =
        prefs(context).getString(PREF_STATION, null)
            ?.takeIf { it == STATION_KITCHEN || it == STATION_BAR || it == STATION_ALL }

    fun setStation(context: Context, station: String) {
        prefs(context).edit().putString(PREF_STATION, station).apply()
    }

    fun stationLabel(context: Context, station: String?): String = when (station) {
        STATION_BAR -> context.getString(R.string.station_bar)
        STATION_KITCHEN -> context.getString(R.string.station_kitchen)
        else -> context.getString(R.string.station_all)
    }

    fun serverUrl(context: Context): String {
        val def = context.getString(R.string.default_server_url)
        return prefs(context).getString(PREF_SERVER_URL, def)?.trim()?.ifEmpty { def } ?: def
    }

    fun soundEnabled(context: Context): Boolean = prefs(context).getBoolean(PREF_SOUND, true)

    /**
     * Vollbild: Status- und Navigationsleiste ausblenden («sticky immersive»).
     * Ein Wisch vom Rand zeigt sie kurz an, danach verschwinden sie wieder.
     * Die alten Flags gelten ab Android 4.4 und reichen fuer Android 7.
     */
    @Suppress("DEPRECATION")
    private const val IMMERSIVE_FLAGS = (
        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_FULLSCREEN
        )

    @Suppress("DEPRECATION")
    fun applyFullscreen(activity: Activity) {
        activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val decor = activity.window.decorView
        decor.systemUiVisibility = IMMERSIVE_FLAGS
        // Auf manchen Android-7-Geraeten bleiben die Leisten nach dem Hereinwischen
        // stehen — nach 2 s wieder ausblenden.
        decor.setOnSystemUiVisibilityChangeListener { visibility ->
            if (visibility and View.SYSTEM_UI_FLAG_FULLSCREEN == 0) {
                decor.postDelayed({ decor.systemUiVisibility = IMMERSIVE_FLAGS }, 2000)
            }
        }
    }

    // --- Kiosk-Ausgang ----------------------------------------------------

    /**
     * Ausgangs-Code für den Kioskmodus (Standard). Nur damit kommt man in die
     * Einstellungen bzw. aus der App. In den Einstellungen aenderbar
     * (gespeichert unter PREF_EXIT_CODE). Das Repo ist oeffentlich — der Code
     * schuetzt nur vor versehentlichem Verlassen, nicht vor Angriffen.
     */
    const val DEFAULT_EXIT_CODE = "9876"
    const val PREF_EXIT_CODE = "exit_code"
    private const val HOLD_MS = 3000L

    fun exitCode(context: Context): String =
        prefs(context).getString(PREF_EXIT_CODE, null)?.trim()?.takeIf { it.isNotEmpty() }
            ?: DEFAULT_EXIT_CODE

    /** 3 s gedrueckt halten auf [view] -> Code-Abfrage -> bei Erfolg [onUnlocked]. */
    @android.annotation.SuppressLint("ClickableViewAccessibility")
    fun attachSecretHold(activity: Activity, view: View, onUnlocked: () -> Unit) {
        val trigger = Runnable { askExitCode(activity, onUnlocked) }
        view.setOnTouchListener { v, event ->
            when (event.actionMasked) {
                android.view.MotionEvent.ACTION_DOWN -> v.postDelayed(trigger, HOLD_MS)
                android.view.MotionEvent.ACTION_UP,
                android.view.MotionEvent.ACTION_CANCEL -> v.removeCallbacks(trigger)
            }
            true
        }
    }

    private fun askExitCode(activity: Activity, onUnlocked: () -> Unit) {
        if (activity.isFinishing) return
        val input = android.widget.EditText(activity).apply {
            inputType = android.text.InputType.TYPE_CLASS_NUMBER or
                android.text.InputType.TYPE_NUMBER_VARIATION_PASSWORD
            hint = activity.getString(R.string.exit_code_hint)
        }
        val box = android.widget.FrameLayout(activity).apply {
            val pad = (24 * activity.resources.displayMetrics.density).toInt()
            setPadding(pad, pad / 2, pad, 0)
            addView(input)
        }
        val dialog = androidx.appcompat.app.AlertDialog.Builder(activity)
            .setTitle(R.string.exit_code_title)
            .setView(box)
            .setPositiveButton(android.R.string.ok) { _, _ ->
                // Falscher Code: einfach schliessen, ohne Hinweis
                if (input.text.toString().trim() == exitCode(activity)) onUnlocked()
            }
            .setNegativeButton(android.R.string.cancel, null)
            .create()
        dialog.setOnDismissListener { applyFullscreen(activity) }
        input.imeOptions = android.view.inputmethod.EditorInfo.IME_ACTION_DONE
        input.setOnEditorActionListener { _, _, _ ->
            dialog.getButton(android.content.DialogInterface.BUTTON_POSITIVE)?.performClick()
            true
        }
        dialog.window?.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE)
        dialog.show()
        input.requestFocus()
    }

    /**
     * Als Startbildschirm (HOME) anbieten oder nicht. Standard: aus — sonst
     * fragt Android nach jedem Druck auf «Home», welche App gemeint ist.
     */
    fun setHomeEnabled(context: Context, enabled: Boolean) {
        val state = if (enabled) PackageManager.COMPONENT_ENABLED_STATE_ENABLED
        else PackageManager.COMPONENT_ENABLED_STATE_DISABLED
        context.packageManager.setComponentEnabledSetting(
            ComponentName(context, "${context.packageName}.HomeAlias"),
            state,
            PackageManager.DONT_KILL_APP
        )
    }
}
