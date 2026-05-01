package ch.fwvraura.vorstand.ui.dispatch

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.viewpager2.adapter.FragmentStateAdapter
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.databinding.FragmentDispatchBinding
import com.google.android.material.tabs.TabLayoutMediator

class DispatchFragment : Fragment() {

    private var _binding: FragmentDispatchBinding? = null
    private val binding get() = _binding!!

    private val tabTitles by lazy {
        listOf(
            getString(R.string.dispatch_tab_send),
            getString(R.string.dispatch_tab_templates),
            getString(R.string.dispatch_tab_log)
        )
    }

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentDispatchBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        val pagerAdapter = DispatchPagerAdapter(this)
        binding.viewPager.adapter = pagerAdapter

        TabLayoutMediator(binding.tabLayout, binding.viewPager) { tab, position ->
            tab.text = tabTitles[position]
        }.attach()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }

    private inner class DispatchPagerAdapter(fragment: Fragment) : FragmentStateAdapter(fragment) {

        override fun getItemCount() = 3

        override fun createFragment(position: Int): Fragment {
            return when (position) {
                0 -> DispatchComposeFragment()
                1 -> DispatchTemplatesFragment()
                2 -> DispatchLogFragment()
                else -> throw IllegalStateException("Invalid tab position: $position")
            }
        }
    }
}
