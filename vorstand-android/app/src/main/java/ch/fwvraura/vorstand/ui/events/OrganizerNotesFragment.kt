package ch.fwvraura.vorstand.ui.events

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.util.Base64
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.data.api.ApiModule
import ch.fwvraura.vorstand.data.model.CreateOrganizerNoteRequest
import ch.fwvraura.vorstand.data.model.NoteAttachmentUpload
import ch.fwvraura.vorstand.data.model.OrganizerNote
import ch.fwvraura.vorstand.data.model.OrganizerNoteAttachment
import ch.fwvraura.vorstand.databinding.FragmentOrganizerNotesBinding
import ch.fwvraura.vorstand.util.FileOpener
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.textfield.TextInputEditText
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * OrganizerNotesFragment – Organisator-Notizen zu einem Event.
 *
 * Zeigt alle Notizen eines Events (neueste zuerst) in einer RecyclerView und
 * ermoeglicht:
 * - Neue Notiz anlegen: Text und/oder beliebig viele Anhaenge (Bilder & Dokumente).
 * - Notiz loeschen (mit Rueckfrage), inkl. aller Anhaenge.
 * - Einzelnen Anhang entfernen (mit Rueckfrage).
 * - Anhang oeffnen: der Inhalt wird authentifiziert ueber die API geladen, im Cache
 *   abgelegt und via FileProvider an den System-Viewer uebergeben (ACTION_VIEW).
 * - Bild-Anhaenge werden als Vorschau im Listeneintrag angezeigt.
 *
 * Die Event-ID wird als Fragment-Argument "eventId" uebergeben (siehe nav_graph),
 * geoeffnet aus dem EventRegistrationsFragment.
 */
class OrganizerNotesFragment : Fragment() {

    /** View-Binding-Referenz, wird in onDestroyView auf null gesetzt. */
    private var _binding: FragmentOrganizerNotesBinding? = null

    /** Sicherer Zugriff auf das Binding. */
    private val binding get() = _binding!!

    /** ID des Events, dessen Notizen angezeigt werden. */
    private var eventId: String? = null

    /** Adapter der Notizen-Liste. */
    private lateinit var adapter: OrganizerNotesAdapter

    /**
     * In-Memory-Cache fuer bereits geladene Anhang-Bytes (key = Anhang-ID). Vermeidet
     * wiederholte Netzwerk-Downloads bei Bild-Vorschauen (RecyclerView-Recycling) und
     * beim Oeffnen. Wird beim Verlassen des Screens mit dem Fragment verworfen.
     */
    private val attachmentBytesCache = mutableMapOf<String, ByteArray>()

    /**
     * Lokaler Halter fuer einen im "Neue Notiz"-Dialog ausgewaehlten Anhang.
     * Die Bytes werden bereits beim Auswaehlen gelesen und als Base64 gehalten,
     * damit keine Uri-Zugriffsrechte ueber den Dialog-Lebenszyklus hinaus noetig sind.
     */
    private data class PendingAttachment(
        val filename: String,
        val contentType: String,
        val base64: String,
        val size: Int
    )

    /** Aktuell im Dialog ausgewaehlte (noch nicht gespeicherte) Anhaenge. */
    private val pickedAttachments = mutableListOf<PendingAttachment>()

    /** Referenz auf das Anhang-Label des offenen Dialogs (sonst null). */
    private var attachmentsLabel: TextView? = null

    /**
     * Datei-Picker fuer Anhaenge (Bilder UND Dokumente, alle MIME-Typen).
     *
     * Muss als Fragment-Property registriert werden (vor STARTED), damit keine
     * IllegalStateException auftritt – gleiches Muster wie in EventFormFragment.
     * OpenMultipleDocuments erlaubt die Mehrfachauswahl; zusaetzlich kann der Nutzer
     * den Picker mehrfach oeffnen, um weitere Anhaenge hinzuzufuegen.
     */
    private val attachmentPickerLauncher = registerForActivityResult(
        ActivityResultContracts.OpenMultipleDocuments()
    ) { uris ->
        if (uris.isNullOrEmpty()) return@registerForActivityResult
        viewLifecycleOwner.lifecycleScope.launch {
            var tooLarge = 0
            var failed = 0
            for (uri in uris) {
                val pa = withContext(Dispatchers.IO) { readAttachment(uri) }
                when {
                    pa == null -> failed++
                    pa.size > MAX_ATTACHMENT_BYTES -> tooLarge++
                    else -> pickedAttachments.add(pa)
                }
            }
            updateAttachmentsLabel()
            if (tooLarge > 0) {
                Toast.makeText(requireContext(), "$tooLarge Datei(en) zu groß (max. 10 MB)", Toast.LENGTH_LONG).show()
            }
            if (failed > 0) {
                Toast.makeText(requireContext(), "$failed Datei(en) konnten nicht gelesen werden", Toast.LENGTH_SHORT).show()
            }
        }
    }

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentOrganizerNotesBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        eventId = arguments?.getString("eventId")

        // Toolbar-Navigation: zurueck zur vorherigen Ansicht
        binding.toolbar.setNavigationOnClickListener { findNavController().navigateUp() }

        // Adapter mit den Aktions-Callbacks aufbauen
        adapter = OrganizerNotesAdapter(
            onDeleteNote = { note -> confirmDeleteNote(note) },
            onOpenAttachment = { note, att -> openAttachment(note, att) },
            onDeleteAttachment = { note, att -> confirmDeleteAttachment(note, att) },
            loadImagePreview = { note, att, iv -> loadImagePreview(note, att, iv) }
        )
        binding.notesRecycler.layoutManager = LinearLayoutManager(requireContext())
        binding.notesRecycler.adapter = adapter
        binding.notesRecycler.isNestedScrollingEnabled = false

        binding.swipeRefresh.setOnRefreshListener { load() }
        binding.btnAddNote.setOnClickListener { showAddNoteDialog() }

        load()
    }

    // ── Laden ────────────────────────────────────────────────────────────────

    /** Laedt alle Notizen des Events und aktualisiert die Liste / den Leerzustand. */
    private fun load() {
        val eid = eventId ?: return
        binding.swipeRefresh.isRefreshing = true
        viewLifecycleOwner.lifecycleScope.launch {
            val result = try {
                ApiModule.eventsApi.getOrganizerNotes(eid)
            } catch (_: Exception) {
                null
            }
            // View koennte waehrend des Ladens zerstoert worden sein
            val b = _binding ?: return@launch
            b.swipeRefresh.isRefreshing = false
            if (result == null) {
                Toast.makeText(requireContext(), "Netzwerkfehler", Toast.LENGTH_SHORT).show()
                return@launch
            }
            if (result.isSuccessful) {
                val notes = result.body() ?: emptyList()
                adapter.submitList(notes)
                b.emptyText.visibility = if (notes.isEmpty()) View.VISIBLE else View.GONE
                b.notesRecycler.visibility = if (notes.isEmpty()) View.GONE else View.VISIBLE
            } else {
                Toast.makeText(requireContext(), "Fehler beim Laden (${result.code()})", Toast.LENGTH_SHORT).show()
            }
        }
    }

    // ── Neue Notiz ─────────────────────────────────────────────────────────────

    /** Oeffnet den Dialog zum Anlegen einer neuen Notiz (Text und/oder Anhaenge). */
    private fun showAddNoteDialog() {
        // Frische Auswahl fuer diesen Dialog
        pickedAttachments.clear()

        val dialogView = layoutInflater.inflate(R.layout.dialog_organizer_note, null)
        val contentInput = dialogView.findViewById<TextInputEditText>(R.id.noteContentInput)
        val btnPick = dialogView.findViewById<View>(R.id.btnPickAttachments)
        attachmentsLabel = dialogView.findViewById(R.id.attachmentsLabel)
        updateAttachmentsLabel()

        // "*/*" erlaubt sowohl Bilder als auch Dokumente
        btnPick.setOnClickListener { attachmentPickerLauncher.launch(arrayOf("*/*")) }

        val dialog = MaterialAlertDialogBuilder(requireContext())
            .setTitle("Neue Notiz")
            .setView(dialogView)
            .setPositiveButton("Speichern", null)
            .setNegativeButton("Abbrechen", null)
            .create()

        // Eigener Listener, damit der Dialog bei Validierungsfehlern offen bleibt
        dialog.setOnShowListener {
            dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val content = contentInput.text?.toString()?.trim().orEmpty()
                // Mindestens Text ODER ein Anhang
                if (content.isEmpty() && pickedAttachments.isEmpty()) {
                    Toast.makeText(requireContext(), "Bitte Text eingeben oder einen Anhang wählen", Toast.LENGTH_SHORT).show()
                    return@setOnClickListener
                }
                saveNote(content, dialog)
            }
        }
        // Label-Referenz wieder freigeben, wenn der Dialog verschwindet
        dialog.setOnDismissListener { attachmentsLabel = null }
        dialog.show()
    }

    /** Aktualisiert das Anhang-Label im offenen Dialog (Liste der Dateinamen). */
    private fun updateAttachmentsLabel() {
        val label = attachmentsLabel ?: return
        label.text = if (pickedAttachments.isEmpty()) {
            "Keine Anhänge ausgewählt"
        } else {
            pickedAttachments.joinToString("\n") { "• ${it.filename}" }
        }
    }

    /**
     * Speichert die neue Notiz. Der Standard-Gson laesst null-Felder weg, sodass reine
     * Text- bzw. reine Anhang-Notizen korrekt gesendet werden.
     */
    private fun saveNote(content: String, dialog: androidx.appcompat.app.AlertDialog) {
        val eid = eventId ?: return
        val uploads = pickedAttachments.map {
            NoteAttachmentUpload(filename = it.filename, contentType = it.contentType, data = it.base64)
        }
        val request = CreateOrganizerNoteRequest(
            content = content.ifBlank { null },
            attachments = uploads.ifEmpty { null }
        )

        val saveButton = dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_POSITIVE)
        saveButton.isEnabled = false
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.eventsApi.createOrganizerNote(eid, request)
                when {
                    response.isSuccessful -> {
                        Toast.makeText(requireContext(), "Notiz gespeichert", Toast.LENGTH_SHORT).show()
                        dialog.dismiss()
                        load()
                    }
                    response.code() == 413 -> {
                        Toast.makeText(requireContext(), "Anhang zu groß (max. 10 MB)", Toast.LENGTH_LONG).show()
                        saveButton.isEnabled = true
                    }
                    else -> {
                        Toast.makeText(requireContext(), "Fehler beim Speichern (${response.code()})", Toast.LENGTH_LONG).show()
                        saveButton.isEnabled = true
                    }
                }
            } catch (e: Exception) {
                Toast.makeText(requireContext(), "Netzwerkfehler: ${e.message}", Toast.LENGTH_LONG).show()
                saveButton.isEnabled = true
            }
        }
    }

    /**
     * Liest einen ausgewaehlten Anhang vollstaendig ein (Name, MIME-Type, Base64,
     * Groesse). Laeuft im IO-Kontext. Gibt null zurueck, wenn das Lesen scheitert.
     */
    private fun readAttachment(uri: Uri): PendingAttachment? {
        return try {
            val resolver = requireContext().contentResolver
            val bytes = resolver.openInputStream(uri)?.use { it.readBytes() } ?: return null
            val name = resolveDisplayName(uri)
            val type = resolver.getType(uri) ?: "application/octet-stream"
            val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
            PendingAttachment(filename = name, contentType = type, base64 = base64, size = bytes.size)
        } catch (_: Exception) {
            null
        }
    }

    /** Ermittelt den Anzeigenamen einer per Picker gewaehlten Datei (mit Fallback). */
    private fun resolveDisplayName(uri: Uri): String {
        var name: String? = null
        try {
            requireContext().contentResolver
                .query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
                ?.use { cursor ->
                    if (cursor.moveToFirst()) {
                        val idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                        if (idx >= 0) name = cursor.getString(idx)
                    }
                }
        } catch (_: Exception) {
            // Fallback-Namen verwenden
        }
        return name ?: "datei"
    }

    // ── Anhaenge: laden / anzeigen / oeffnen ────────────────────────────────────

    /**
     * Laedt die Bytes eines Anhangs authentifiziert (Bearer via AuthInterceptor) und
     * cached sie. Gibt null bei Fehlern zurueck.
     */
    private suspend fun fetchAttachmentBytes(
        note: OrganizerNote,
        att: OrganizerNoteAttachment
    ): ByteArray? {
        val eid = eventId ?: return null
        attachmentBytesCache[att.id]?.let { return it }
        return try {
            val response = ApiModule.eventsApi.getOrganizerNoteAttachment(eid, note.id, att.id)
            val body = response.body()
            if (response.isSuccessful && body != null) {
                val bytes = withContext(Dispatchers.IO) { body.bytes() }
                attachmentBytesCache[att.id] = bytes
                bytes
            } else {
                null
            }
        } catch (_: Exception) {
            null
        }
    }

    /** Laedt die Bild-Vorschau eines Anhangs und setzt sie in die ImageView. */
    private fun loadImagePreview(
        note: OrganizerNote,
        att: OrganizerNoteAttachment,
        imageView: ImageView
    ) {
        viewLifecycleOwner.lifecycleScope.launch {
            val bytes = fetchAttachmentBytes(note, att) ?: return@launch
            val bmp = withContext(Dispatchers.IO) { decodeSampledBitmap(bytes, 800, 800) } ?: return@launch
            // Nur setzen, wenn die (recycelte) ImageView noch denselben Anhang zeigt
            if (imageView.tag == att.id) imageView.setImageBitmap(bmp)
        }
    }

    /** Laedt den Anhang und oeffnet ihn im passenden System-Viewer. */
    private fun openAttachment(note: OrganizerNote, att: OrganizerNoteAttachment) {
        Toast.makeText(requireContext(), "Öffne ${att.filename}…", Toast.LENGTH_SHORT).show()
        viewLifecycleOwner.lifecycleScope.launch {
            val bytes = fetchAttachmentBytes(note, att)
            if (bytes == null) {
                Toast.makeText(requireContext(), "Fehler beim Laden des Anhangs", Toast.LENGTH_SHORT).show()
                return@launch
            }
            val ok = FileOpener.openFile(requireContext(), bytes, att.filename, att.contentType)
            if (!ok) {
                Toast.makeText(requireContext(), "Keine App zum Öffnen gefunden", Toast.LENGTH_SHORT).show()
            }
        }
    }

    /**
     * Dekodiert ein Bild aus Bytes und skaliert es fuer die Vorschau herunter
     * (inSampleSize), um Speicher zu sparen. Gibt null bei Fehlern zurueck.
     */
    private fun decodeSampledBitmap(bytes: ByteArray, reqW: Int, reqH: Int): Bitmap? {
        return try {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
            var sample = 1
            while (bounds.outWidth / sample > reqW || bounds.outHeight / sample > reqH) sample *= 2
            val opts = BitmapFactory.Options().apply { inSampleSize = sample }
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
        } catch (_: Exception) {
            null
        }
    }

    // ── Loeschen ────────────────────────────────────────────────────────────────

    /** Rueckfrage vor dem Loeschen einer ganzen Notiz. */
    private fun confirmDeleteNote(note: OrganizerNote) {
        MaterialAlertDialogBuilder(requireContext())
            .setTitle("Notiz löschen")
            .setMessage("Diese Notiz und alle Anhänge wirklich löschen?")
            .setPositiveButton("Löschen") { _, _ -> deleteNote(note) }
            .setNegativeButton("Abbrechen", null)
            .show()
    }

    /** Loescht eine Notiz und laedt die Liste neu. */
    private fun deleteNote(note: OrganizerNote) {
        val eid = eventId ?: return
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.eventsApi.deleteOrganizerNote(eid, note.id)
                if (response.isSuccessful) {
                    Toast.makeText(requireContext(), "Notiz gelöscht", Toast.LENGTH_SHORT).show()
                    load()
                } else {
                    Toast.makeText(requireContext(), "Fehler beim Löschen (${response.code()})", Toast.LENGTH_SHORT).show()
                }
            } catch (_: Exception) {
                Toast.makeText(requireContext(), "Netzwerkfehler", Toast.LENGTH_SHORT).show()
            }
        }
    }

    /** Rueckfrage vor dem Entfernen eines einzelnen Anhangs. */
    private fun confirmDeleteAttachment(note: OrganizerNote, att: OrganizerNoteAttachment) {
        MaterialAlertDialogBuilder(requireContext())
            .setTitle("Anhang entfernen")
            .setMessage("\"${att.filename}\" wirklich entfernen?")
            .setPositiveButton("Entfernen") { _, _ -> deleteAttachment(note, att) }
            .setNegativeButton("Abbrechen", null)
            .show()
    }

    /** Entfernt einen einzelnen Anhang und laedt die Liste neu. */
    private fun deleteAttachment(note: OrganizerNote, att: OrganizerNoteAttachment) {
        val eid = eventId ?: return
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.eventsApi.deleteOrganizerNoteAttachment(eid, note.id, att.id)
                if (response.isSuccessful) {
                    attachmentBytesCache.remove(att.id)
                    Toast.makeText(requireContext(), "Anhang entfernt", Toast.LENGTH_SHORT).show()
                    load()
                } else {
                    Toast.makeText(requireContext(), "Fehler beim Entfernen (${response.code()})", Toast.LENGTH_SHORT).show()
                }
            } catch (_: Exception) {
                Toast.makeText(requireContext(), "Netzwerkfehler", Toast.LENGTH_SHORT).show()
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        attachmentsLabel = null
        _binding = null
    }

    companion object {
        /** Maximale Anhang-Groesse (10 MB) – deckt sich mit der Backend-Grenze (413). */
        private const val MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
    }
}
