package ch.fwvraura.members.ui.profile

import android.os.Bundle
import android.view.View
import android.widget.ArrayAdapter
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import ch.fwvraura.members.MembersApp
import ch.fwvraura.members.data.api.ApiModule
import ch.fwvraura.members.data.model.MemberProfile
import ch.fwvraura.members.data.model.MemberProfileUpdate
import ch.fwvraura.members.databinding.ActivityEditProfileBinding
import com.google.android.material.datepicker.MaterialDatePicker
import com.google.android.material.snackbar.Snackbar
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

class EditProfileActivity : AppCompatActivity() {

    private lateinit var binding: ActivityEditProfileBinding
    private val swissDate = SimpleDateFormat("dd.MM.yyyy", Locale.GERMAN).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }
    private val isoDate = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    /** Wir merken uns das ISO-Datum getrennt vom angezeigten dd.MM.yyyy. */
    private var geburtstagIso: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityEditProfileBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.toolbar.setNavigationOnClickListener { finish() }

        // Anrede-Dropdown
        binding.inputAnrede.setAdapter(
            ArrayAdapter(this, android.R.layout.simple_dropdown_item_1line, listOf("Frau", "Herr", "Divers"))
        )

        binding.inputGeburtstag.setOnClickListener { showDatePicker() }

        loadProfile()

        binding.btnSave.setOnClickListener { save() }
    }

    private fun loadProfile() {
        binding.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val profile = ApiModule.membersApi.getMe().body() ?: return@launch
                fillForm(profile)
            } catch (e: Exception) {
                Snackbar.make(binding.root, "Fehler: ${e.message}", Snackbar.LENGTH_LONG).show()
            } finally {
                binding.progress.visibility = View.GONE
            }
        }
    }

    private fun fillForm(p: MemberProfile) {
        binding.inputAnrede.setText(p.anrede.orEmpty(), false)
        binding.inputVorname.setText(p.vorname.orEmpty())
        binding.inputNachname.setText(p.nachname.orEmpty())
        binding.inputEmail.setText(p.email.orEmpty())
        if (!p.geburtstag.isNullOrBlank()) {
            geburtstagIso = p.geburtstag.substring(0, minOf(10, p.geburtstag.length))
            try {
                val d = isoDate.parse(geburtstagIso!!)
                binding.inputGeburtstag.setText(swissDate.format(d ?: Date()))
            } catch (_: Exception) {
                binding.inputGeburtstag.setText(geburtstagIso)
            }
        }
        binding.inputMobile.setText(p.mobile.orEmpty())
        binding.inputTelefon.setText(p.telefon.orEmpty())
        binding.inputStrasse.setText(p.strasse.orEmpty())
        binding.inputPlz.setText(p.plz.orEmpty())
        binding.inputOrt.setText(p.ort.orEmpty())
    }

    private fun showDatePicker() {
        val initialMs = geburtstagIso?.let {
            try { isoDate.parse(it)?.time } catch (_: Exception) { null }
        } ?: MaterialDatePicker.todayInUtcMilliseconds()

        val picker = MaterialDatePicker.Builder.datePicker()
            .setTitleText("Geburtstag")
            .setSelection(initialMs)
            .build()
        picker.addOnPositiveButtonClickListener { ms ->
            val date = Date(ms)
            geburtstagIso = isoDate.format(date)
            binding.inputGeburtstag.setText(swissDate.format(date))
        }
        picker.show(supportFragmentManager, "geburtstag_picker")
    }

    private fun save() {
        val update = MemberProfileUpdate(
            anrede = binding.inputAnrede.text?.toString()?.trim()?.ifBlank { null },
            vorname = binding.inputVorname.text?.toString()?.trim()?.ifBlank { null },
            nachname = binding.inputNachname.text?.toString()?.trim()?.ifBlank { null },
            email = binding.inputEmail.text?.toString()?.trim()?.ifBlank { null },
            geburtstag = geburtstagIso,
            mobile = binding.inputMobile.text?.toString()?.trim()?.ifBlank { null },
            telefon = binding.inputTelefon.text?.toString()?.trim()?.ifBlank { null },
            strasse = binding.inputStrasse.text?.toString()?.trim()?.ifBlank { null },
            plz = binding.inputPlz.text?.toString()?.trim()?.ifBlank { null },
            ort = binding.inputOrt.text?.toString()?.trim()?.ifBlank { null }
        )

        binding.progress.visibility = View.VISIBLE
        binding.btnSave.isEnabled = false
        lifecycleScope.launch {
            try {
                val response = ApiModule.membersApi.updateMe(update)
                if (response.isSuccessful) {
                    val tm = MembersApp.instance.tokenManager
                    response.body()?.let {
                        tm.userEmail = it.email
                        tm.userName = listOfNotNull(it.vorname, it.nachname).joinToString(" ").ifBlank { null }
                    }
                    Snackbar.make(binding.root, "Profil gespeichert", Snackbar.LENGTH_SHORT).show()
                    binding.root.postDelayed({ finish() }, 700)
                } else {
                    Snackbar.make(binding.root, "Fehler ${response.code()}", Snackbar.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                Snackbar.make(binding.root, "Netzwerkfehler: ${e.message}", Snackbar.LENGTH_LONG).show()
            } finally {
                binding.progress.visibility = View.GONE
                binding.btnSave.isEnabled = true
            }
        }
    }
}
