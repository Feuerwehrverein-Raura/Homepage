package ch.fwvraura.members.ui.settings

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.activity.result.contract.ActivityResultContracts
import androidx.fragment.app.Fragment
import ch.fwvraura.members.MembersApp
import ch.fwvraura.members.databinding.FragmentSettingsBinding
import ch.fwvraura.members.sync.ContactsSyncManager
import ch.fwvraura.members.ui.login.LoginActivity
import ch.fwvraura.members.ui.notifications.NotificationsActivity
import com.google.android.material.snackbar.Snackbar

/**
 * Einstellungen als eigener Reiter.
 *
 * Bisher lagen Benachrichtigungen und Adressbuch-Abgleich im Profil und das
 * Abmelden im Ueberlauf-Menue der Titelleiste. Die iOS-App trennt das seit
 * jeher; damit beide Apps gleich aufgebaut sind, wandert es auch hier
 * hierher.
 */
class SettingsFragment : Fragment() {

    private var _binding: FragmentSettingsBinding? = null
    private val binding get() = _binding!!

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

        binding.btnNotifications.setOnClickListener {
            startActivity(Intent(requireContext(), NotificationsActivity::class.java))
        }
        binding.btnLogout.setOnClickListener { logout() }
        setupContactsSyncSwitch()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }

    private val contactsPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { _ ->
        val tm = MembersApp.instance.tokenManager
        tm.contactsSyncEnabled = true
        ContactsSyncManager.enableSync(requireContext())
        ContactsSyncManager.requestSyncNow(requireContext())
        binding.syncControlsRow.visibility = View.VISIBLE
        Snackbar.make(binding.root, "Mitglieder werden ins Adressbuch synchronisiert.",
            Snackbar.LENGTH_SHORT).show()
    }

    private fun setupContactsSyncSwitch() {
        val tm = MembersApp.instance.tokenManager
        binding.switchContactsSync.isChecked = tm.contactsSyncEnabled
        binding.syncControlsRow.visibility =
            if (tm.contactsSyncEnabled) View.VISIBLE else View.GONE

        binding.switchContactsSync.setOnCheckedChangeListener { _, checked ->
            if (checked == tm.contactsSyncEnabled) return@setOnCheckedChangeListener
            tm.contactsSyncAsked = true
            if (checked) {
                contactsPermissionLauncher.launch(arrayOf(
                    android.Manifest.permission.READ_CONTACTS,
                    android.Manifest.permission.WRITE_CONTACTS
                ))
            } else {
                tm.contactsSyncEnabled = false
                ContactsSyncManager.disableSync(requireContext())
                binding.syncControlsRow.visibility = View.GONE
                Snackbar.make(binding.root,
                    "Adressbuch-Sync deaktiviert. FWV-Kontakte wurden vom Telefon entfernt.",
                    Snackbar.LENGTH_LONG).show()
            }
        }

        binding.btnSyncNow.setOnClickListener {
            ContactsSyncManager.requestSyncNow(requireContext())
            Snackbar.make(binding.root, "Sync angestossen — kann ein paar Sekunden dauern.",
                Snackbar.LENGTH_SHORT).show()
        }

        binding.btnRestoreContacts.setOnClickListener {
            val removed = ContactsSyncManager.restoreDeletedContacts(requireContext())
            val msg = if (removed > 0)
                "$removed gelöschte Mitglieder werden wiederhergestellt — Sync läuft."
            else
                "Keine gelöschten FWV-Kontakte gefunden. Sync wird trotzdem ausgelöst."
            Snackbar.make(binding.root, msg, Snackbar.LENGTH_LONG).show()
        }
    }

    /**
     * Beim Abmelden wird der Adressbuch-Abgleich abgeschaltet — sonst blieben
     * die FWV-Kontakte auf dem Geraet zurueck, wenn sich danach jemand anders
     * anmeldet. Gleiche Reihenfolge wie bisher im Ueberlauf-Menue.
     */
    private fun logout() {
        ContactsSyncManager.disableSync(requireContext())
        MembersApp.instance.tokenManager.clear()
        startActivity(Intent(requireContext(), LoginActivity::class.java))
        requireActivity().finish()
    }
}
