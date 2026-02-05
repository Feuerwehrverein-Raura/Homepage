package ch.fwvraura.vorstand.ui.members

import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.data.api.ApiModule
import ch.fwvraura.vorstand.data.model.Member
import ch.fwvraura.vorstand.databinding.FragmentMemberDetailBinding
import ch.fwvraura.vorstand.util.DateUtils
import coil.load
import coil.request.CachePolicy
import coil.transform.CircleCropTransformation
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File

class MemberDetailFragment : Fragment() {

    private var _binding: FragmentMemberDetailBinding? = null
    private val binding get() = _binding!!
    private var memberId: String? = null
    private var member: Member? = null
    private var cameraUri: Uri? = null

    private val galleryLauncher = registerForActivityResult(
        ActivityResultContracts.PickVisualMedia()
    ) { uri ->
        uri?.let { uploadPhoto(it) }
    }

    private val cameraLauncher = registerForActivityResult(
        ActivityResultContracts.TakePicture()
    ) { success ->
        if (success) {
            cameraUri?.let { uploadPhoto(it) }
        }
    }

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
        binding.photoContainer.setOnClickListener { showPhotoOptions() }

        loadMember()
    }

    private fun showPhotoOptions() {
        val options = mutableListOf(
            getString(R.string.photo_choose_gallery),
            getString(R.string.photo_take)
        )
        if (!member?.foto.isNullOrEmpty()) {
            options.add(getString(R.string.photo_delete))
        }

        MaterialAlertDialogBuilder(requireContext())
            .setTitle(R.string.photo_change)
            .setItems(options.toTypedArray()) { _, which ->
                when (which) {
                    0 -> galleryLauncher.launch(
                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                    )
                    1 -> launchCamera()
                    2 -> confirmDeletePhoto()
                }
            }
            .show()
    }

    private fun launchCamera() {
        val file = File(requireContext().cacheDir, "photo_${System.currentTimeMillis()}.jpg")
        cameraUri = FileProvider.getUriForFile(
            requireContext(),
            "${requireContext().packageName}.fileprovider",
            file
        )
        cameraLauncher.launch(cameraUri!!)
    }

    private fun uploadPhoto(uri: Uri) {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val inputStream = requireContext().contentResolver.openInputStream(uri)
                    ?: return@launch
                val bytes = inputStream.readBytes()
                inputStream.close()

                val contentType = requireContext().contentResolver.getType(uri) ?: "image/jpeg"
                val requestBody = bytes.toRequestBody(contentType.toMediaType())
                val part = MultipartBody.Part.createFormData("photo", "photo.jpg", requestBody)

                val response = ApiModule.membersApi.uploadPhoto(memberId!!, part)
                if (response.isSuccessful) {
                    Toast.makeText(context, R.string.photo_upload_success, Toast.LENGTH_SHORT).show()
                    loadMember()
                } else {
                    Toast.makeText(context, R.string.photo_upload_error, Toast.LENGTH_SHORT).show()
                }
            } catch (_: Exception) {
                Toast.makeText(context, R.string.photo_upload_error, Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun confirmDeletePhoto() {
        MaterialAlertDialogBuilder(requireContext())
            .setTitle(R.string.photo_delete)
            .setPositiveButton(R.string.delete) { _, _ -> deletePhoto() }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun deletePhoto() {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.membersApi.deletePhoto(memberId!!)
                if (response.isSuccessful) {
                    Toast.makeText(context, R.string.photo_delete_success, Toast.LENGTH_SHORT).show()
                    member = member?.copy(foto = null)
                    binding.memberPhoto.setImageDrawable(null)
                    binding.memberPhoto.setBackgroundResource(R.drawable.circle_background)
                } else {
                    Toast.makeText(context, R.string.photo_delete_error, Toast.LENGTH_SHORT).show()
                }
            } catch (_: Exception) {
                Toast.makeText(context, R.string.photo_delete_error, Toast.LENGTH_SHORT).show()
            }
        }
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
        if (!m.foto.isNullOrEmpty()) {
            binding.memberPhoto.load("https://api.fwv-raura.ch${m.foto}") {
                transformations(CircleCropTransformation())
                memoryCachePolicy(CachePolicy.DISABLED)
            }
        } else {
            binding.memberPhoto.setImageDrawable(null)
            binding.memberPhoto.setBackgroundResource(R.drawable.circle_background)
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
