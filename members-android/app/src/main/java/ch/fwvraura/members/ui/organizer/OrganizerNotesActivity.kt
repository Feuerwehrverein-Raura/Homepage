package ch.fwvraura.members.ui.organizer

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.util.Base64
import android.view.View
import android.widget.ImageView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import ch.fwvraura.members.R
import ch.fwvraura.members.data.api.ApiModule
import ch.fwvraura.members.data.model.CreateOrganizerNoteRequest
import ch.fwvraura.members.data.model.NoteAttachmentUpload
import ch.fwvraura.members.data.model.OrganizerNote
import ch.fwvraura.members.data.model.OrganizerNoteAttachment
import ch.fwvraura.members.databinding.ActivityOrganizerNotesBinding
import ch.fwvraura.members.util.FileOpener
import com.google.android.material.chip.Chip
import com.google.android.material.snackbar.Snackbar
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * OrganizerNotesActivity — Notizen-Verwaltung fuer ein Event.
 *
 * Startet aus dem Organisator-Dashboard und erwartet die Intent-Extras
 * [EXTRA_EVENT_ID] und [EXTRA_EVENT_TITLE]. Der Organisator (oder Vorstand) kann
 * pro Event beliebig viele Notizen anlegen und loeschen — jede mit Text und/oder
 * beliebig vielen Anhaengen (Bilder und Dokumente).
 *
 * Aufbau:
 * - Fixer Verfasser-Bereich oben (Text + Anhang-Chips + Speichern).
 * - Scrollbare Notizenliste (RecyclerView + [OrganizerNotesAdapter]).
 * - Anhaenge werden authentifiziert geladen (Retrofit @Streaming); Bilder als
 *   Vorschau, Dokumente ueber [FileOpener] im System-Viewer.
 */
class OrganizerNotesActivity : AppCompatActivity() {

    private lateinit var binding: ActivityOrganizerNotesBinding
    private lateinit var adapter: OrganizerNotesAdapter

    private lateinit var eventId: String
    private var eventTitle: String = ""

    /** Vor dem Absenden gesammelte Anhaenge der neuen Notiz. */
    private val pendingAttachments = mutableListOf<PendingAttachment>()

    /** Kleiner Vorschau-Cache (Anhang-ID -> heruntergerechnetes Bitmap). */
    private val imageCache = mutableMapOf<String, Bitmap>()

    /** Ein bereits eingelesener, noch nicht abgesendeter Anhang. */
    private data class PendingAttachment(
        val filename: String,
        val contentType: String,
        val base64: String,
        val sizeBytes: Int
    )

    /**
     * Datei-Picker (mehrere Dateien auf einmal, beliebiger MIME-Typ). Muss als
     * Feld registriert werden (vor dem START-Zustand). Liefert URIs, die wir
     * sofort einlesen und als Base64 zwischenspeichern.
     */
    private val attachmentPicker = registerForActivityResult(
        ActivityResultContracts.OpenMultipleDocuments()
    ) { uris -> onAttachmentsPicked(uris) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        @Suppress("DEPRECATION")
        androidx.core.view.WindowCompat.setDecorFitsSystemWindows(window, true)
        binding = ActivityOrganizerNotesBinding.inflate(layoutInflater)
        setContentView(binding.root)

        eventId = intent.getStringExtra(EXTRA_EVENT_ID).orEmpty()
        eventTitle = intent.getStringExtra(EXTRA_EVENT_TITLE).orEmpty()
        if (eventId.isBlank()) {
            toast("Kein Event angegeben")
            finish()
            return
        }

        binding.toolbar.setNavigationOnClickListener { finish() }
        if (eventTitle.isNotBlank()) {
            binding.toolbar.subtitle = eventTitle
            binding.toolbar.setSubtitleTextColor(getColor(R.color.on_primary))
        }

        adapter = OrganizerNotesAdapter(
            onOpenAttachment = { note, att -> openAttachment(note, att) },
            onDeleteNote = { note -> confirmDeleteNote(note) },
            onDeleteAttachment = { note, att -> confirmDeleteAttachment(note, att) },
            loadImagePreview = { noteId, att, target -> loadImagePreview(noteId, att, target) }
        )
        binding.notesList.layoutManager = LinearLayoutManager(this)
        binding.notesList.adapter = adapter

        binding.swipeRefresh.setOnRefreshListener { load() }
        binding.btnAddAttachment.setOnClickListener { attachmentPicker.launch(arrayOf("*/*")) }
        binding.btnSaveNote.setOnClickListener { submitNote() }

        load()
    }

    // ── Notizen laden ─────────────────────────────────────────────────────────

    private fun load() {
        binding.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val resp = ApiModule.eventsApi.getOrganizerNotes(eventId)
                if (resp.isSuccessful) {
                    val notes = resp.body().orEmpty()
                    adapter.submitList(notes)
                    binding.emptyText.visibility = if (notes.isEmpty()) View.VISIBLE else View.GONE
                } else {
                    showError(errorMessage(resp.code()))
                }
            } catch (e: Exception) {
                showError("Netzwerkfehler: ${e.message}")
            } finally {
                binding.progress.visibility = View.GONE
                binding.swipeRefresh.isRefreshing = false
            }
        }
    }

    // ── Neue Notiz: Anhaenge waehlen ──────────────────────────────────────────

    private fun onAttachmentsPicked(uris: List<Uri>) {
        if (uris.isEmpty()) return
        lifecycleScope.launch {
            for (uri in uris) {
                try {
                    val prepared = withContext(Dispatchers.IO) { readAttachment(uri) }
                    when {
                        prepared == null -> toast("Datei konnte nicht gelesen werden")
                        prepared.sizeBytes > MAX_FILE_BYTES ->
                            toast("„${prepared.filename}“ ist zu groß (max. 10 MB)")
                        else -> pendingAttachments.add(prepared)
                    }
                } catch (e: Exception) {
                    toast("Fehler beim Laden: ${e.message}")
                }
            }
            renderPendingChips()
        }
    }

    /** Liest eine Datei-Uri komplett ein und kodiert sie als Base64.NO_WRAP. */
    private fun readAttachment(uri: Uri): PendingAttachment? {
        val name = resolveDisplayName(uri)
        val type = contentResolver.getType(uri) ?: "application/octet-stream"
        val bytes = contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return null
        val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
        return PendingAttachment(name, type, b64, bytes.size)
    }

    /** Anzeigename einer per Picker gewaehlten Datei (Fallback "datei"). */
    private fun resolveDisplayName(uri: Uri): String {
        var name: String? = null
        try {
            contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                if (c.moveToFirst()) {
                    val idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (idx >= 0) name = c.getString(idx)
                }
            }
        } catch (_: Exception) { /* Fallback verwenden */ }
        return name?.takeIf { it.isNotBlank() } ?: "datei"
    }

    private fun renderPendingChips() {
        binding.composerChips.removeAllViews()
        binding.composerChips.visibility =
            if (pendingAttachments.isEmpty()) View.GONE else View.VISIBLE
        for (att in pendingAttachments) {
            val chip = Chip(this).apply {
                text = att.filename
                isCloseIconVisible = true
                setOnCloseIconClickListener {
                    pendingAttachments.remove(att)
                    renderPendingChips()
                }
            }
            binding.composerChips.addView(chip)
        }
    }

    // ── Neue Notiz: absenden ──────────────────────────────────────────────────

    private fun submitNote() {
        val content = binding.noteInput.text?.toString()?.trim()?.ifBlank { null }
        if (content == null && pendingAttachments.isEmpty()) {
            toast("Bitte Text eingeben oder einen Anhang hinzufügen")
            return
        }
        val uploads = pendingAttachments.map {
            NoteAttachmentUpload(filename = it.filename, contentType = it.contentType, data = it.base64)
        }
        val body = CreateOrganizerNoteRequest(content = content, attachments = uploads.ifEmpty { null })

        setComposerEnabled(false)
        binding.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val resp = ApiModule.eventsApi.createOrganizerNote(eventId, body)
                if (resp.isSuccessful) {
                    binding.noteInput.setText("")
                    pendingAttachments.clear()
                    renderPendingChips()
                    load()
                } else {
                    showError(errorMessage(resp.code()))
                }
            } catch (e: Exception) {
                showError("Netzwerkfehler: ${e.message}")
            } finally {
                setComposerEnabled(true)
                binding.progress.visibility = View.GONE
            }
        }
    }

    private fun setComposerEnabled(enabled: Boolean) {
        binding.btnSaveNote.isEnabled = enabled
        binding.btnAddAttachment.isEnabled = enabled
    }

    // ── Anhang oeffnen ────────────────────────────────────────────────────────

    private fun openAttachment(note: OrganizerNote, att: OrganizerNoteAttachment) {
        binding.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val resp = ApiModule.eventsApi.getOrganizerNoteAttachment(eventId, note.id, att.id)
                val stream = resp.body()
                if (!resp.isSuccessful || stream == null) {
                    showError(errorMessage(resp.code()))
                    return@launch
                }
                val bytes = withContext(Dispatchers.IO) { stream.bytes() }
                val type = att.contentType?.takeIf { it.isNotBlank() }
                    ?: resp.headers()["Content-Type"]
                val opened = FileOpener.openFile(this@OrganizerNotesActivity, bytes, att.filename, type)
                if (!opened) {
                    val shared = FileOpener.shareFile(this@OrganizerNotesActivity, bytes, att.filename, type)
                    if (!shared) toast("Keine App zum Öffnen gefunden")
                }
            } catch (e: Exception) {
                showError("Netzwerkfehler: ${e.message}")
            } finally {
                binding.progress.visibility = View.GONE
            }
        }
    }

    // ── Bild-Vorschau (authentifiziert) ───────────────────────────────────────

    private fun loadImagePreview(noteId: String, att: OrganizerNoteAttachment, target: ImageView) {
        // Recycling-Schutz: der Ziel-ImageView merkt sich, welchen Anhang er zeigt.
        target.tag = att.id
        imageCache[att.id]?.let { target.setImageBitmap(it); return }
        lifecycleScope.launch {
            try {
                val resp = ApiModule.eventsApi.getOrganizerNoteAttachment(eventId, noteId, att.id)
                val stream = resp.body()
                if (!resp.isSuccessful || stream == null) return@launch
                val bmp = withContext(Dispatchers.IO) {
                    decodeSampled(stream.bytes(), THUMB_PX)
                } ?: return@launch
                imageCache[att.id] = bmp
                if (target.tag == att.id) target.setImageBitmap(bmp)
            } catch (_: Exception) { /* Vorschau bleibt der Platzhalter */ }
        }
    }

    /** Dekodiert ein Bild heruntergerechnet auf ~[reqPx] px, um OOM zu vermeiden. */
    private fun decodeSampled(bytes: ByteArray, reqPx: Int): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        var sample = 1
        val w = bounds.outWidth
        val h = bounds.outHeight
        if (w > reqPx || h > reqPx) {
            val halfW = w / 2
            val halfH = h / 2
            while (halfW / sample >= reqPx && halfH / sample >= reqPx) sample *= 2
        }
        val opts = BitmapFactory.Options().apply { inSampleSize = sample }
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
    }

    // ── Loeschen ──────────────────────────────────────────────────────────────

    private fun confirmDeleteNote(note: OrganizerNote) {
        AlertDialog.Builder(this)
            .setTitle("Notiz löschen?")
            .setMessage("Möchtest du diese Notiz samt Anhängen wirklich löschen?")
            .setPositiveButton("Löschen") { _, _ -> performDeleteNote(note) }
            .setNegativeButton("Abbrechen", null)
            .show()
    }

    private fun performDeleteNote(note: OrganizerNote) {
        binding.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val resp = ApiModule.eventsApi.deleteOrganizerNote(eventId, note.id)
                if (resp.isSuccessful) {
                    note.attachments.forEach { imageCache.remove(it.id) }
                    load()
                } else {
                    showError(errorMessage(resp.code()))
                }
            } catch (e: Exception) {
                showError("Netzwerkfehler: ${e.message}")
            } finally {
                binding.progress.visibility = View.GONE
            }
        }
    }

    private fun confirmDeleteAttachment(note: OrganizerNote, att: OrganizerNoteAttachment) {
        AlertDialog.Builder(this)
            .setTitle("Anhang löschen?")
            .setMessage("„${att.filename}“ wirklich löschen?")
            .setPositiveButton("Löschen") { _, _ -> performDeleteAttachment(note, att) }
            .setNegativeButton("Abbrechen", null)
            .show()
    }

    private fun performDeleteAttachment(note: OrganizerNote, att: OrganizerNoteAttachment) {
        binding.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val resp = ApiModule.eventsApi.deleteOrganizerNoteAttachment(eventId, note.id, att.id)
                if (resp.isSuccessful) {
                    imageCache.remove(att.id)
                    load()
                } else {
                    showError(errorMessage(resp.code()))
                }
            } catch (e: Exception) {
                showError("Netzwerkfehler: ${e.message}")
            } finally {
                binding.progress.visibility = View.GONE
            }
        }
    }

    // ── Sonstiges ─────────────────────────────────────────────────────────────

    /** Menschenlesbare Fehlermeldung fuer die bekannten Backend-Status-Codes. */
    private fun errorMessage(code: Int): String = when (code) {
        403 -> "Kein Zugriff (nur Organisator/Vorstand)"
        413 -> "Datei zu groß (max. 10 MB)"
        400 -> "Ungültige Eingabe"
        else -> "Fehler $code"
    }

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_LONG).show()

    private fun showError(msg: String) =
        Snackbar.make(binding.root, msg, Snackbar.LENGTH_LONG).show()

    companion object {
        const val EXTRA_EVENT_ID = "eventId"
        const val EXTRA_EVENT_TITLE = "eventTitle"

        /** Lokale Groessengrenze (Backend antwortet sonst mit 413). */
        private const val MAX_FILE_BYTES = 10 * 1024 * 1024

        /** Ziel-Kantenlaenge der Vorschau-Bitmaps in px. */
        private const val THUMB_PX = 256
    }
}
