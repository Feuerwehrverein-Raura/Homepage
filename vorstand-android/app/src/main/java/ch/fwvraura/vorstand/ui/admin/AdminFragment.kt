package ch.fwvraura.vorstand.ui.admin

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.data.api.ApiModule
import ch.fwvraura.vorstand.databinding.FragmentAdminBinding
import kotlinx.coroutines.launch

class AdminFragment : Fragment() {

    private var _binding: FragmentAdminBinding? = null
    private val binding get() = _binding!!

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentAdminBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.cardRegistrations.setOnClickListener {
            findNavController().navigate(R.id.action_admin_to_registrations)
        }
        binding.cardAudit.setOnClickListener {
            findNavController().navigate(R.id.action_admin_to_audit)
        }

        loadPendingCount()
    }

    private fun loadPendingCount() {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.registrationsApi.getPendingCount()
                if (response.isSuccessful) {
                    val count = response.body()?.count ?: 0
                    binding.registrationCount.text = if (count > 0) "$count offene Anträge" else "Keine offenen Anträge"
                }
            } catch (_: Exception) {
                binding.registrationCount.text = ""
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
