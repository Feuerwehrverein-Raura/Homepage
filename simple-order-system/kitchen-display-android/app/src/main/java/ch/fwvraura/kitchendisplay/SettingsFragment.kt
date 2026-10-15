package ch.fwvraura.kitchendisplay

import android.os.Bundle
import android.widget.Toast
import androidx.lifecycle.lifecycleScope
import androidx.preference.EditTextPreference
import androidx.preference.Preference
import androidx.preference.PreferenceFragmentCompat
import androidx.preference.SwitchPreferenceCompat
import kotlinx.coroutines.launch

class SettingsFragment : PreferenceFragmentCompat() {

    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        setPreferencesFromResource(R.xml.preferences, rootKey)

        findPreference<EditTextPreference>(Kiosk.PREF_SERVER_URL)?.apply {
            summaryProvider = EditTextPreference.SimpleSummaryProvider.getInstance()
        }

        findPreference<SwitchPreferenceCompat>(Kiosk.PREF_AS_HOME)?.setOnPreferenceChangeListener { _, value ->
            Kiosk.setHomeEnabled(requireContext(), value == true)
            true
        }

        findPreference<EditTextPreference>(Kiosk.PREF_EXIT_CODE)?.apply {
            // Code nie im Klartext als Zusammenfassung zeigen; Eingabe nur Ziffern
            text = Kiosk.exitCode(requireContext())
            setOnBindEditTextListener {
                it.inputType = android.text.InputType.TYPE_CLASS_NUMBER or
                    android.text.InputType.TYPE_NUMBER_VARIATION_PASSWORD
                it.setSelection(it.text.length)
            }
            setOnPreferenceChangeListener { _, value ->
                (value as? String)?.trim()?.let { it.length >= 4 && it.all(Char::isDigit) } == true
            }
        }

        findPreference<Preference>("exit_app")?.setOnPreferenceClickListener {
            activity?.finishAffinity()
            true
        }

        findPreference<Preference>("logout")?.setOnPreferenceClickListener {
            TokenManager(requireContext()).logout()
            LoginActivity.open(requireContext())
            activity?.finish()
            true
        }

        findPreference<Preference>("check_update")?.apply {
            summary = getString(
                R.string.version_label,
                requireContext().packageManager.getPackageInfo(requireContext().packageName, 0).versionName
            )
            setOnPreferenceClickListener {
                val ctx = requireContext().applicationContext
                lifecycleScope.launch {
                    val text = when (val r = UpdateChecker(ctx).checkForUpdate()) {
                        is UpdateChecker.UpdateResult.UpdateAvailable ->
                            getString(R.string.update_available, r.newVersion)
                        is UpdateChecker.UpdateResult.NoUpdate -> getString(R.string.no_update)
                        is UpdateChecker.UpdateResult.Error -> getString(R.string.update_check_failed, r.message)
                    }
                    Toast.makeText(ctx, text, Toast.LENGTH_LONG).show()
                }
                true
            }
        }
    }
}
