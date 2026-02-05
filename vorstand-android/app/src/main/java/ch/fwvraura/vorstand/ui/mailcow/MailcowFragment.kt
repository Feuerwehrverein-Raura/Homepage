package ch.fwvraura.vorstand.ui.mailcow

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.navigation.fragment.findNavController
import androidx.viewpager2.adapter.FragmentStateAdapter
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.databinding.FragmentMailcowBinding
import com.google.android.material.tabs.TabLayoutMediator

class MailcowFragment : Fragment() {

    private var _binding: FragmentMailcowBinding? = null
    private val binding get() = _binding!!

    private val tabTitles by lazy {
        listOf(
            getString(R.string.mailcow_tab_mailboxes),
            getString(R.string.mailcow_tab_aliases),
            getString(R.string.mailcow_tab_storage),
            getString(R.string.mailcow_tab_distribution)
        )
    }

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentMailcowBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.toolbar.setNavigationOnClickListener {
            findNavController().navigateUp()
        }

        val pagerAdapter = MailcowPagerAdapter(this)
        binding.viewPager.adapter = pagerAdapter

        TabLayoutMediator(binding.tabLayout, binding.viewPager) { tab, position ->
            tab.text = tabTitles[position]
        }.attach()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }

    private inner class MailcowPagerAdapter(fragment: Fragment) : FragmentStateAdapter(fragment) {

        override fun getItemCount() = 4

        override fun createFragment(position: Int): Fragment {
            return when (position) {
                0 -> MailcowMailboxesFragment()
                1 -> MailcowAliasesFragment()
                2 -> MailcowStorageFragment()
                3 -> MailcowDistributionFragment()
                else -> throw IllegalStateException("Invalid tab position: $position")
            }
        }
    }
}
