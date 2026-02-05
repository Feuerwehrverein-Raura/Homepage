package ch.fwvraura.vorstand.ui.members

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.data.api.ApiModule
import ch.fwvraura.vorstand.data.model.MemberCreate
import ch.fwvraura.vorstand.databinding.FragmentMemberFormBinding
import ch.fwvraura.vorstand.util.DateUtils
import com.google.android.material.snackbar.Snackbar
import kotlinx.coroutines.launch

class MemberFormFragment : Fragment() {

    private var _binding: FragmentMemberFormBinding? = null
    private val binding get() = _binding!!
    private var memberId: Int = -1
    private val isEdit get() = memberId > 0

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentMemberFormBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        memberId = arguments?.getInt("memberId", -1) ?: -1

        binding.toolbar.title = if (isEdit) getString(R.string.member_edit) else getString(R.string.member_new)
        binding.toolbar.setNavigationOnClickListener { findNavController().navigateUp() }

        // Status dropdown
        val statusAdapter = ArrayAdapter(requireContext(), android.R.layout.simple_dropdown_item_1line,
            listOf("Aktiv", "Passiv", "Ehrenmitglied"))
        binding.inputStatus.setAdapter(statusAdapter)

        if (isEdit) loadMember()

        binding.btnSave.setOnClickListener { saveMember() }
    }

    private fun loadMember() {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.membersApi.getMember(memberId)
                if (response.isSuccessful) {
                    val m = response.body() ?: return@launch
                    binding.inputAnrede.setText(m.anrede ?: "")
                    binding.inputVorname.setText(m.vorname)
                    binding.inputNachname.setText(m.nachname)
                    binding.inputEmail.setText(m.email ?: "")
                    binding.inputTelefon.setText(m.telefon ?: "")
                    binding.inputMobile.setText(m.mobile ?: "")
                    binding.inputStrasse.setText(m.strasse ?: "")
                    binding.inputPlz.setText(m.plz ?: "")
                    binding.inputOrt.setText(m.ort ?: "")
                    binding.inputGeburtstag.setText(DateUtils.formatDate(m.geburtstag))
                    binding.inputStatus.setText(m.status ?: "Aktiv", false)
                    binding.inputFunktion.setText(m.funktion ?: "")
                    binding.inputEintrittsdatum.setText(DateUtils.formatDate(m.eintrittsdatum))
                }
            } catch (_: Exception) { }
        }
    }

    private fun saveMember() {
        val vorname = binding.inputVorname.text.toString().trim()
        val nachname = binding.inputNachname.text.toString().trim()

        if (vorname.isBlank() || nachname.isBlank()) {
            Snackbar.make(binding.root, "Vorname und Nachname sind Pflichtfelder", Snackbar.LENGTH_SHORT).show()
            return
        }

        val member = MemberCreate(
            anrede = binding.inputAnrede.text.toString().trim().ifBlank { null },
            vorname = vorname,
            nachname = nachname,
            email = binding.inputEmail.text.toString().trim().ifBlank { null },
            telefon = binding.inputTelefon.text.toString().trim().ifBlank { null },
            mobile = binding.inputMobile.text.toString().trim().ifBlank { null },
            strasse = binding.inputStrasse.text.toString().trim().ifBlank { null },
            plz = binding.inputPlz.text.toString().trim().ifBlank { null },
            ort = binding.inputOrt.text.toString().trim().ifBlank { null },
            geburtstag = DateUtils.toIsoDate(binding.inputGeburtstag.text.toString().trim()),
            status = binding.inputStatus.text.toString().ifBlank { "Aktiv" },
            funktion = binding.inputFunktion.text.toString().trim().ifBlank { null },
            eintrittsdatum = DateUtils.toIsoDate(binding.inputEintrittsdatum.text.toString().trim())
        )

        binding.btnSave.isEnabled = false
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = if (isEdit) {
                    ApiModule.membersApi.updateMember(memberId, member)
                } else {
                    ApiModule.membersApi.createMember(member)
                }

                if (response.isSuccessful) {
                    Snackbar.make(binding.root, R.string.member_saved, Snackbar.LENGTH_SHORT).show()
                    findNavController().navigateUp()
                } else {
                    Snackbar.make(binding.root, "Fehler beim Speichern (${response.code()})", Snackbar.LENGTH_LONG).show()
                    binding.btnSave.isEnabled = true
                }
            } catch (e: Exception) {
                Snackbar.make(binding.root, "Netzwerkfehler: ${e.message}", Snackbar.LENGTH_LONG).show()
                binding.btnSave.isEnabled = true
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
