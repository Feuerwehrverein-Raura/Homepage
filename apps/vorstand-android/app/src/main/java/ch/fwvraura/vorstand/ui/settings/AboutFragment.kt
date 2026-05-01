package ch.fwvraura.vorstand.ui.settings

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.navigation.fragment.findNavController
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.databinding.FragmentAboutBinding
import com.google.android.material.dialog.MaterialAlertDialogBuilder

/**
 * About-Screen mit App-Informationen, Links und Lizenzen.
 */
class AboutFragment : Fragment() {

    private var _binding: FragmentAboutBinding? = null
    private val binding get() = _binding!!

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentAboutBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        setupToolbar()
        showVersion()
        setupLinks()
    }

    private fun setupToolbar() {
        binding.toolbar.setNavigationOnClickListener {
            findNavController().navigateUp()
        }
    }

    private fun showVersion() {
        try {
            val packageInfo = requireContext().packageManager.getPackageInfo(
                requireContext().packageName, 0
            )
            binding.versionText.text = getString(
                R.string.about_version_format,
                packageInfo.versionName,
                packageInfo.longVersionCode
            )
        } catch (e: Exception) {
            binding.versionText.text = "Version unbekannt"
        }
    }

    private fun setupLinks() {
        binding.linkWebsite.setOnClickListener {
            openUrl("https://fwv-raura.ch")
        }

        binding.linkGithub.setOnClickListener {
            openUrl("https://github.com/Feuerwehrverein-Raura/Homepage")
        }

        binding.linkPrivacy.setOnClickListener {
            openUrl("https://fwv-raura.ch/datenschutz.html")
        }

        binding.linkLicenses.setOnClickListener {
            showLicensesDialog()
        }
    }

    private fun openUrl(url: String) {
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
            startActivity(intent)
        } catch (e: Exception) {
            // Browser nicht verfügbar
        }
    }

    private fun showLicensesDialog() {
        val licenses = """
            Diese App verwendet folgende Open-Source-Bibliotheken:

            Retrofit
            Copyright Square, Inc.
            Apache License 2.0

            OkHttp
            Copyright Square, Inc.
            Apache License 2.0

            Gson
            Copyright Google Inc.
            Apache License 2.0

            Material Components
            Copyright Google Inc.
            Apache License 2.0

            AndroidX Libraries
            Copyright Google Inc.
            Apache License 2.0

            EncryptedSharedPreferences
            Copyright Google Inc.
            Apache License 2.0
        """.trimIndent()

        MaterialAlertDialogBuilder(requireContext())
            .setTitle(R.string.about_licenses)
            .setMessage(licenses)
            .setPositiveButton(R.string.close, null)
            .show()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
