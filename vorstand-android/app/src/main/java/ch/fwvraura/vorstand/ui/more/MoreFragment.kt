package ch.fwvraura.vorstand.ui.more

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import ch.fwvraura.vorstand.MainActivity
import ch.fwvraura.vorstand.VorstandApp
import ch.fwvraura.vorstand.databinding.FragmentMoreBinding

class MoreFragment : Fragment() {

    private var _binding: FragmentMoreBinding? = null
    private val binding get() = _binding!!

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentMoreBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        // Show version
        try {
            val packageInfo = requireContext().packageManager.getPackageInfo(requireContext().packageName, 0)
            binding.versionText.text = "Version ${packageInfo.versionName}"
        } catch (_: Exception) { }

        // Show user info
        val tokenManager = VorstandApp.instance.tokenManager
        binding.versionText.append("\n${tokenManager.userEmail ?: ""}")

        binding.btnLogout.setOnClickListener {
            (requireActivity() as? MainActivity)?.logout()
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
