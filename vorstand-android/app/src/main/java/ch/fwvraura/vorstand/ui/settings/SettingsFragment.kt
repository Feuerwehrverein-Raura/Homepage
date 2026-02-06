package ch.fwvraura.vorstand.ui.settings

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.appcompat.app.AppCompatDelegate
import androidx.fragment.app.Fragment
import androidx.navigation.fragment.findNavController
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.VorstandApp
import ch.fwvraura.vorstand.databinding.FragmentSettingsBinding
import ch.fwvraura.vorstand.util.AppSettings

/**
 * Fragment für die App-Einstellungen.
 *
 * Einstellungen:
 * - Theme (System/Hell/Dunkel)
 * - Benachrichtigungen (An/Aus, Intervall)
 * - Auto-Update-Check
 */
class SettingsFragment : Fragment() {

    private var _binding: FragmentSettingsBinding? = null
    private val binding get() = _binding!!

    private lateinit var settings: AppSettings

    // Slider-Position zu Minuten Mapping
    private val intervalValues = listOf(15, 30, 60, 120, 240)

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentSettingsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        settings = VorstandApp.instance.appSettings

        setupToolbar()
        loadSettings()
        setupListeners()
    }

    private fun setupToolbar() {
        binding.toolbar.setNavigationOnClickListener {
            findNavController().navigateUp()
        }
    }

    private fun loadSettings() {
        // Theme
        when (settings.themeMode) {
            AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM -> {
                binding.radioThemeSystem.isChecked = true
                binding.themeValue.text = getString(R.string.settings_theme_system)
            }
            AppCompatDelegate.MODE_NIGHT_NO -> {
                binding.radioThemeLight.isChecked = true
                binding.themeValue.text = getString(R.string.settings_theme_light)
            }
            AppCompatDelegate.MODE_NIGHT_YES -> {
                binding.radioThemeDark.isChecked = true
                binding.themeValue.text = getString(R.string.settings_theme_dark)
            }
        }

        // Benachrichtigungen
        binding.switchNotifications.isChecked = settings.notificationsEnabled
        updateIntervalUI(settings.notificationIntervalMinutes)

        // Slider Position setzen
        val sliderPos = intervalValues.indexOf(settings.notificationIntervalMinutes)
        binding.intervalSlider.value = if (sliderPos >= 0) sliderPos.toFloat() else 2f

        // Auto-Update
        binding.switchAutoUpdate.isChecked = settings.autoUpdateCheck
    }

    private fun setupListeners() {
        // Theme RadioGroup
        binding.themeRadioGroup.setOnCheckedChangeListener { _, checkedId ->
            val newMode = when (checkedId) {
                R.id.radioThemeSystem -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
                R.id.radioThemeLight -> AppCompatDelegate.MODE_NIGHT_NO
                R.id.radioThemeDark -> AppCompatDelegate.MODE_NIGHT_YES
                else -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
            }
            settings.themeMode = newMode

            binding.themeValue.text = when (newMode) {
                AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM -> getString(R.string.settings_theme_system)
                AppCompatDelegate.MODE_NIGHT_NO -> getString(R.string.settings_theme_light)
                AppCompatDelegate.MODE_NIGHT_YES -> getString(R.string.settings_theme_dark)
                else -> getString(R.string.settings_theme_system)
            }
        }

        // Benachrichtigungen Switch
        binding.switchNotifications.setOnCheckedChangeListener { _, isChecked ->
            settings.notificationsEnabled = isChecked
        }

        // Intervall Slider
        binding.intervalSlider.addOnChangeListener { _, value, fromUser ->
            if (fromUser) {
                val minutes = intervalValues[value.toInt()]
                settings.notificationIntervalMinutes = minutes
                updateIntervalUI(minutes)
            }
        }

        // Auto-Update Switch
        binding.switchAutoUpdate.setOnCheckedChangeListener { _, isChecked ->
            settings.autoUpdateCheck = isChecked
        }
    }

    private fun updateIntervalUI(minutes: Int) {
        binding.intervalValue.text = when (minutes) {
            15 -> getString(R.string.settings_interval_15)
            30 -> getString(R.string.settings_interval_30)
            60 -> getString(R.string.settings_interval_60)
            120 -> getString(R.string.settings_interval_120)
            240 -> getString(R.string.settings_interval_240)
            else -> getString(R.string.settings_interval_60)
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
