package ch.fwvraura.kitchendisplay

import android.os.Bundle
import androidx.preference.EditTextPreference
import androidx.preference.PreferenceFragmentCompat

class SettingsFragment : PreferenceFragmentCompat() {

    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        setPreferencesFromResource(R.xml.preferences, rootKey)

        // Update server URL summary to show current value
        findPreference<EditTextPreference>("server_url")?.apply {
            summaryProvider = EditTextPreference.SimpleSummaryProvider.getInstance()
        }
    }
}
