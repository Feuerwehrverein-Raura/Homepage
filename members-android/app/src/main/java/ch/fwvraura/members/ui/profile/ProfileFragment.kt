package ch.fwvraura.members.ui.profile

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.LinearLayout
import androidx.appcompat.app.AlertDialog
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import ch.fwvraura.members.MembersApp
import ch.fwvraura.members.data.api.ApiModule
import ch.fwvraura.members.data.model.AustrittRequest
import ch.fwvraura.members.data.model.MemberProfile
import ch.fwvraura.members.data.model.MyRegistration
import ch.fwvraura.members.databinding.FragmentProfileBinding
import ch.fwvraura.members.databinding.ItemMyRegistrationBinding
import ch.fwvraura.members.ui.login.LoginActivity
import ch.fwvraura.members.util.DateUtils
import com.google.android.material.snackbar.Snackbar
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import kotlinx.coroutines.launch

class ProfileFragment : Fragment() {

    private var _binding: FragmentProfileBinding? = null
    private val binding get() = _binding!!

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentProfileBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.swipeRefresh.setOnRefreshListener { loadProfile() }
        binding.btnEdit.setOnClickListener {
            startActivity(Intent(requireContext(), EditProfileActivity::class.java))
        }
        binding.btnAustritt.setOnClickListener { showAustrittDialog() }

        // Sofort die in TokenManager gespeicherten Daten anzeigen
        val tm = MembersApp.instance.tokenManager
        binding.profileName.text = tm.userName ?: tm.userEmail ?: "FWV-Mitglied"
        binding.profileEmail.text = tm.userEmail.orEmpty()

        loadProfile()
    }

    override fun onResume() {
        super.onResume()
        loadProfile()
        loadMyRegistrations()
    }

    private fun loadMyRegistrations() {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.eventsApi.listMyRegistrations()
                if (response.isSuccessful) renderMyRegistrations(response.body().orEmpty())
            } catch (_: Exception) { /* nicht kritisch */ }
        }
    }

    private fun renderMyRegistrations(regs: List<MyRegistration>) {
        binding.myRegsList.removeAllViews()
        binding.myRegsEmpty.visibility = if (regs.isEmpty()) View.VISIBLE else View.GONE
        for (r in regs) {
            val item = ItemMyRegistrationBinding.inflate(layoutInflater, binding.myRegsList, false)
            item.regEventTitle.text = r.eventTitle.orEmpty()
            item.regEventDate.text = DateUtils.formatDate(r.eventStartDate)
            item.regEventLocation.text = r.eventLocation.orEmpty()
            item.regEventLocation.visibility = if (r.eventLocation.isNullOrBlank()) View.GONE else View.VISIBLE

            val (label, color) = when (r.status) {
                "approved" -> "Bestätigt" to Color.parseColor("#0F7A2D")
                "rejected" -> "Abgelehnt" to Color.parseColor("#B91C1C")
                "pending"  -> "Wartend" to Color.parseColor("#A05A00")
                else       -> (r.status ?: "") to Color.parseColor("#4B5563")
            }
            item.regStatus.text = label
            item.regStatus.setTextColor(color)
            binding.myRegsList.addView(item.root)
        }
    }

    private fun loadProfile() {
        binding.profileProgress.visibility = View.VISIBLE
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.membersApi.getMe()
                if (response.isSuccessful) {
                    response.body()?.let { bind(it) }
                } else if (response.code() != 404) {
                    Snackbar.make(binding.root, "Fehler ${response.code()}", Snackbar.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                Snackbar.make(binding.root, "Netzwerkfehler: ${e.message}", Snackbar.LENGTH_LONG).show()
            } finally {
                binding.profileProgress.visibility = View.GONE
                binding.swipeRefresh.isRefreshing = false
            }
        }
    }

    private fun bind(p: MemberProfile) {
        binding.profileName.text = listOfNotNull(p.vorname, p.nachname).joinToString(" ")
            .ifBlank { p.email ?: "FWV-Mitglied" }
        binding.profileFunktion.text = p.funktion.orEmpty()
        binding.profileFunktion.visibility = if (p.funktion.isNullOrBlank()) View.GONE else View.VISIBLE
        binding.profileEmail.text = p.email.orEmpty()

        bindRow(binding.rowMobile, binding.profileMobile, p.mobile)
        bindRow(binding.rowTelefon, binding.profileTelefon, p.telefon)
        val adresse = listOfNotNull(p.strasse, listOfNotNull(p.plz, p.ort).joinToString(" ").ifBlank { null })
            .joinToString("\n")
        bindRow(binding.rowAdresse, binding.profileAdresse, adresse.ifBlank { null })
        bindRow(binding.rowStatus, binding.profileStatus, p.status)
    }

    private fun bindRow(row: View, text: android.widget.TextView, value: String?) {
        if (value.isNullOrBlank()) {
            row.visibility = View.GONE
        } else {
            row.visibility = View.VISIBLE
            text.text = value
        }
    }

    private fun showAustrittDialog() {
        val context = requireContext()
        val container = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 24, 48, 0)
        }
        val info = android.widget.TextView(context).apply {
            text = "Möchtest du wirklich aus dem Feuerwehrverein Raura austreten? " +
                    "Der Vorstand wird deinen Antrag gemäss Statuten bearbeiten und sich bei dir melden. " +
                    "Deine Daten werden nicht sofort gelöscht."
            textSize = 14f
            setPadding(0, 0, 0, 16)
        }
        val reasonEdit = EditText(context).apply {
            hint = "Begründung (optional)"
            isSingleLine = false
            maxLines = 4
        }
        container.addView(info)
        container.addView(reasonEdit)

        AlertDialog.Builder(context)
            .setTitle("Austritt beantragen")
            .setView(container)
            .setPositiveButton("Antrag senden") { _, _ ->
                submitAustritt(reasonEdit.text?.toString()?.trim().orEmpty())
            }
            .setNegativeButton("Abbrechen", null)
            .show()
    }

    private fun submitAustritt(reason: String) {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.membersApi.requestAustritt(
                    AustrittRequest(reason = reason.ifBlank { null })
                )
                if (response.isSuccessful && response.body()?.success == true) {
                    AlertDialog.Builder(requireContext())
                        .setTitle("Austritts-Antrag gesendet")
                        .setMessage("Der Vorstand wurde benachrichtigt und meldet sich bei dir. Du wirst nun ausgeloggt.")
                        .setPositiveButton("OK") { _, _ ->
                            MembersApp.instance.tokenManager.clear()
                            startActivity(Intent(requireContext(), LoginActivity::class.java))
                            requireActivity().finish()
                        }
                        .setCancelable(false)
                        .show()
                } else {
                    val msg = response.body()?.message ?: "Fehler ${response.code()}"
                    Snackbar.make(binding.root, msg, Snackbar.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                Snackbar.make(binding.root, "Netzwerkfehler: ${e.message}", Snackbar.LENGTH_LONG).show()
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
