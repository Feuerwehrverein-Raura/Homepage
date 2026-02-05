package ch.fwvraura.vorstand.ui.events

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.data.api.ApiModule
import ch.fwvraura.vorstand.data.model.EventCreate
import ch.fwvraura.vorstand.databinding.FragmentEventFormBinding
import ch.fwvraura.vorstand.util.DateUtils
import com.google.android.material.snackbar.Snackbar
import kotlinx.coroutines.launch

class EventFormFragment : Fragment() {

    private var _binding: FragmentEventFormBinding? = null
    private val binding get() = _binding!!
    private var eventId: String? = null
    private val isEdit get() = eventId != null

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentEventFormBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        eventId = arguments?.getString("eventId")

        binding.toolbar.title = if (isEdit) getString(R.string.event_edit) else getString(R.string.event_new)
        binding.toolbar.setNavigationOnClickListener { findNavController().navigateUp() }

        if (isEdit) loadEvent()

        binding.btnSave.setOnClickListener { saveEvent() }
    }

    private fun loadEvent() {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.eventsApi.getEvent(eventId!!)
                if (response.isSuccessful) {
                    val e = response.body() ?: return@launch
                    binding.inputTitle.setText(e.title)
                    binding.inputSubtitle.setText(e.subtitle ?: "")
                    binding.inputLocation.setText(e.location ?: "")
                    binding.inputStartDate.setText(DateUtils.formatDate(e.startDate))
                    binding.inputEndDate.setText(DateUtils.formatDate(e.endDate))
                    binding.inputDescription.setText(e.description ?: "")
                }
            } catch (_: Exception) { }
        }
    }

    private fun saveEvent() {
        val title = binding.inputTitle.text.toString().trim()
        if (title.isBlank()) {
            Snackbar.make(binding.root, "Titel ist ein Pflichtfeld", Snackbar.LENGTH_SHORT).show()
            return
        }

        val event = EventCreate(
            title = title,
            subtitle = binding.inputSubtitle.text.toString().trim().ifBlank { null },
            location = binding.inputLocation.text.toString().trim().ifBlank { null },
            startDate = DateUtils.toIsoDate(binding.inputStartDate.text.toString().trim()),
            endDate = DateUtils.toIsoDate(binding.inputEndDate.text.toString().trim()),
            description = binding.inputDescription.text.toString().trim().ifBlank { null }
        )

        binding.btnSave.isEnabled = false
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = if (isEdit) {
                    ApiModule.eventsApi.updateEvent(eventId!!, event)
                } else {
                    ApiModule.eventsApi.createEvent(event)
                }

                if (response.isSuccessful) {
                    findNavController().navigateUp()
                } else {
                    Snackbar.make(binding.root, "Fehler (${response.code()})", Snackbar.LENGTH_LONG).show()
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
