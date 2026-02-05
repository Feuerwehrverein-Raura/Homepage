package ch.fwvraura.vorstand.ui.members

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.data.api.ApiModule
import ch.fwvraura.vorstand.data.model.Member
import ch.fwvraura.vorstand.databinding.FragmentMemberDetailBinding
import ch.fwvraura.vorstand.util.DateUtils
import coil.load
import coil.transform.CircleCropTransformation
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import kotlinx.coroutines.launch

class MemberDetailFragment : Fragment() {

    private var _binding: FragmentMemberDetailBinding? = null
    private val binding get() = _binding!!
    private var memberId: String? = null
    private var member: Member? = null

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentMemberDetailBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        memberId = arguments?.getString("memberId")

        binding.toolbar.setNavigationOnClickListener { findNavController().navigateUp() }
        binding.btnEdit.setOnClickListener {
            val bundle = Bundle().apply { putString("memberId", memberId) }
            findNavController().navigate(R.id.action_detail_to_form, bundle)
        }
        binding.btnDelete.setOnClickListener { confirmDelete() }

        loadMember()
    }

    private fun loadMember() {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.membersApi.getMember(memberId!!)
                if (response.isSuccessful) {
                    member = response.body()
                    member?.let { displayMember(it) }
                }
            } catch (_: Exception) { }
        }
    }

    private fun displayMember(m: Member) {
        binding.toolbar.title = m.fullName
        binding.memberName.text = m.fullName
        binding.memberFunction.text = m.funktion ?: ""

        // Photo
        if (!m.photoUrl.isNullOrEmpty()) {
            binding.memberPhoto.load("https://api.fwv-raura.ch${m.photoUrl}") {
                transformations(CircleCropTransformation())
            }
        }

        // Contact
        binding.detailEmail.text = "E-Mail: ${m.email ?: "-"}"
        binding.detailPhone.text = "Telefon: ${m.telefon ?: "-"}"
        binding.detailMobile.text = "Mobile: ${m.mobile ?: "-"}"

        val address = listOfNotNull(m.strasse, m.adresszusatz, "${m.plz ?: ""} ${m.ort ?: ""}".trim())
            .filter { it.isNotBlank() }
            .joinToString(", ")
        binding.detailAddress.text = "Adresse: ${address.ifBlank { "-" }}"

        // Details
        binding.detailStatus.text = "Status: ${m.status ?: "-"}"
        binding.detailBirthday.text = "Geburtstag: ${DateUtils.formatDate(m.geburtstag)}"
        binding.detailEntry.text = "Eintrittsdatum: ${DateUtils.formatDate(m.eintrittsdatum)}"
    }

    private fun confirmDelete() {
        MaterialAlertDialogBuilder(requireContext())
            .setTitle(R.string.member_delete)
            .setMessage(R.string.member_delete_confirm)
            .setPositiveButton(R.string.delete) { _, _ -> deleteMember() }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun deleteMember() {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.membersApi.deleteMember(memberId!!)
                if (response.isSuccessful) {
                    findNavController().navigateUp()
                }
            } catch (_: Exception) { }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
