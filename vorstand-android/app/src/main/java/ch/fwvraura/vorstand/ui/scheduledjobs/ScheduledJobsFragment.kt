package ch.fwvraura.vorstand.ui.scheduledjobs

import android.graphics.Color
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.appcompat.app.AlertDialog
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.vorstand.data.api.ApiModule
import ch.fwvraura.vorstand.data.model.ScheduledJob
import ch.fwvraura.vorstand.databinding.FragmentScheduledJobsBinding
import ch.fwvraura.vorstand.databinding.ItemScheduledJobBinding
import com.google.android.material.snackbar.Snackbar
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

class ScheduledJobsFragment : Fragment() {

    private var _binding: FragmentScheduledJobsBinding? = null
    private val binding get() = _binding!!

    private val adapter = JobsAdapter(::onCancel)

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentScheduledJobsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.toolbar.setNavigationOnClickListener { findNavController().navigateUp() }
        binding.jobsRecycler.layoutManager = LinearLayoutManager(requireContext())
        binding.jobsRecycler.adapter = adapter
        binding.swipeRefresh.setOnRefreshListener { load() }
        load()
    }

    private fun load() {
        binding.progress.visibility = View.VISIBLE
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val resp = ApiModule.scheduledJobsApi.list()
                if (resp.isSuccessful) {
                    val list = resp.body().orEmpty()
                    adapter.submitList(list)
                    binding.emptyText.visibility = if (list.isEmpty()) View.VISIBLE else View.GONE
                } else {
                    Snackbar.make(binding.root, "Fehler ${resp.code()}", Snackbar.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                Snackbar.make(binding.root, "Netzwerkfehler: ${e.message}", Snackbar.LENGTH_LONG).show()
            } finally {
                binding.progress.visibility = View.GONE
                binding.swipeRefresh.isRefreshing = false
            }
        }
    }

    private fun onCancel(job: ScheduledJob) {
        AlertDialog.Builder(requireContext())
            .setTitle("Abbrechen?")
            .setMessage("Geplante Aufgabe \"${job.label ?: job.action}\" wird storniert.")
            .setPositiveButton("Stornieren") { _, _ ->
                viewLifecycleOwner.lifecycleScope.launch {
                    try {
                        val resp = ApiModule.scheduledJobsApi.cancel(job.id)
                        if (resp.isSuccessful) load()
                        else Snackbar.make(binding.root, "Fehler ${resp.code()}", Snackbar.LENGTH_LONG).show()
                    } catch (e: Exception) {
                        Snackbar.make(binding.root, "Netzwerkfehler: ${e.message}", Snackbar.LENGTH_LONG).show()
                    }
                }
            }
            .setNegativeButton("Zurück", null)
            .show()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}

private class JobsAdapter(
    private val onCancel: (ScheduledJob) -> Unit
) : ListAdapter<ScheduledJob, JobsAdapter.VH>(DIFF) {

    private val isoIn = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }
    private val swiss = SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.GERMAN)

    inner class VH(val b: ItemScheduledJobBinding) : RecyclerView.ViewHolder(b.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH =
        VH(ItemScheduledJobBinding.inflate(LayoutInflater.from(parent.context), parent, false))

    override fun onBindViewHolder(holder: VH, position: Int) {
        val j = getItem(position)
        val b = holder.b
        b.jobLabel.text = j.label ?: j.action

        val (statusLabel, statusColor) = when (j.status) {
            "scheduled" -> "Geplant" to Color.parseColor("#A05A00")
            "running"   -> "Läuft" to Color.parseColor("#1E40AF")
            "done"      -> "Erledigt" to Color.parseColor("#0F7A2D")
            "failed"    -> "Fehlgeschlagen" to Color.parseColor("#B91C1C")
            "cancelled" -> "Abgebrochen" to Color.parseColor("#4B5563")
            else        -> (j.status ?: "") to Color.parseColor("#4B5563")
        }
        b.jobStatus.text = statusLabel
        b.jobStatus.setTextColor(statusColor)

        val parts = mutableListOf<String>()
        formatDate(j.scheduledAt)?.let { parts.add("Geplant für $it") }
        if (j.status == "done" || j.status == "failed") {
            j.result?.let { parts.add(formatResult(it)) }
        }
        b.jobMeta.text = parts.joinToString("\n")

        b.jobCancelBtn.visibility = if (j.status == "scheduled") View.VISIBLE else View.GONE
        b.jobCancelBtn.setOnClickListener { onCancel(j) }
    }

    private fun formatDate(iso: String?): String? {
        if (iso.isNullOrBlank()) return null
        // ISO mit oder ohne Z am Ende — robust trimmen
        val cleaned = iso.substringBefore('.').substringBefore('+').removeSuffix("Z")
        return try {
            val d = isoIn.parse(cleaned)
            swiss.format(d ?: Date())
        } catch (_: Exception) { iso }
    }

    private fun formatResult(map: Map<String, Any?>): String = buildString {
        map["error"]?.let { append("Fehler: $it") }
        map["success"]?.let { if (isNotEmpty()) append(", "); append("$it versendet") }
        map["failed"]?.let { if (isNotEmpty()) append(", "); append("$it fehlgeschlagen") }
        if (isEmpty()) append(map.toString().take(100))
    }

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<ScheduledJob>() {
            override fun areItemsTheSame(o: ScheduledJob, n: ScheduledJob) = o.id == n.id
            override fun areContentsTheSame(o: ScheduledJob, n: ScheduledJob) = o == n
        }
    }
}
