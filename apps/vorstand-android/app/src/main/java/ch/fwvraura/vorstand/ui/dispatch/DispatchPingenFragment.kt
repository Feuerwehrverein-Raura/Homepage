package ch.fwvraura.vorstand.ui.dispatch

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.AutoCompleteTextView
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.fragment.app.activityViewModels
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.LinearLayoutManager
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.snackbar.Snackbar
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.data.model.PostMember
import ch.fwvraura.vorstand.databinding.FragmentDispatchPingenBinding
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class DispatchPingenFragment : Fragment() {

    private var _binding: FragmentDispatchPingenBinding? = null
    private val binding get() = _binding!!
    private val viewModel: DispatchViewModel by activityViewModels()
    private lateinit var lettersAdapter: PingenLettersAdapter

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentDispatchPingenBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        // Letters RecyclerView
        lettersAdapter = PingenLettersAdapter { letter ->
            letter.externalId?.let { viewModel.checkLetterStatus(it) }
        }
        binding.lettersRecycler.layoutManager = LinearLayoutManager(requireContext())
        binding.lettersRecycler.adapter = lettersAdapter

        // Stats Grid (3 columns)
        binding.statsGrid.layoutManager = GridLayoutManager(requireContext(), 3)

        // Staging Switch
        binding.stagingSwitch.isChecked = viewModel.staging
        binding.stagingSwitch.setOnCheckedChangeListener { _, isChecked ->
            viewModel.setStaging(isChecked)
        }

        // SwipeRefresh
        binding.swipeRefresh.setOnRefreshListener {
            viewModel.loadPingenDashboard()
        }

        // Retry
        binding.retryButton.setOnClickListener {
            viewModel.loadPingenDashboard()
        }

        // Observe data
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.pingenAccount.collectLatest { account ->
                if (account != null) {
                    binding.accountCard.visibility = View.VISIBLE
                    val balanceFormatted = String.format("%.2f %s", account.balance / 100.0, account.currency)
                    binding.balanceText.text = balanceFormatted
                } else {
                    binding.accountCard.visibility = View.GONE
                }
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.pingenStats.collectLatest { stats ->
                if (stats != null) {
                    val statItems = listOf(
                        Pair(stats.total.toString(), getString(R.string.dispatch_stat_total)),
                        Pair(stats.sent.toString(), getString(R.string.dispatch_stat_sent)),
                        Pair(stats.pending.toString(), getString(R.string.dispatch_stat_pending)),
                        Pair(stats.failed.toString(), getString(R.string.dispatch_stat_failed)),
                        Pair(stats.last30Days.toString(), getString(R.string.dispatch_stat_30days)),
                        Pair(stats.last7Days.toString(), getString(R.string.dispatch_stat_7days))
                    )
                    binding.statsGrid.adapter = PingenStatsAdapter(statItems)
                }
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.pingenLetters.collectLatest { letters ->
                lettersAdapter.submitList(letters)
                binding.lettersRecycler.visibility = if (letters.isEmpty()) View.GONE else View.VISIBLE
                binding.emptyLetters.visibility = if (letters.isEmpty()) View.VISIBLE else View.GONE
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.isLoading.collectLatest { loading ->
                binding.swipeRefresh.isRefreshing = loading
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.error.collectLatest { error ->
                if (error != null) {
                    binding.errorText.text = error
                    binding.errorState.visibility = View.VISIBLE
                    viewModel.clearError()
                } else {
                    binding.errorState.visibility = View.GONE
                }
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.sendResult.collectLatest { result ->
                if (result != null) {
                    Snackbar.make(binding.root, result, Snackbar.LENGTH_LONG).show()
                    viewModel.clearSendResult()
                }
            }
        }

        // Initial load
        viewModel.loadPingenDashboard()
        viewModel.loadPostMembers()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
