package ch.fwvraura.members.ui.organizer

import android.app.Dialog
import android.os.Bundle
import android.text.InputType
import android.view.View
import android.widget.LinearLayout
import androidx.appcompat.app.AlertDialog
import androidx.fragment.app.DialogFragment
import androidx.lifecycle.lifecycleScope
import ch.fwvraura.members.data.api.ApiModule
import ch.fwvraura.members.data.model.EventRegistration
import ch.fwvraura.members.data.model.OrganizerEditRegistrationRequest
import com.google.android.material.snackbar.Snackbar
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import kotlinx.coroutines.launch

/**
 * Dialog zum Bearbeiten einer bestehenden Anmeldung als Organisator.
 * Erlaubt: Name, E-Mail, Telefon, Personenanzahl, Notiz.
 * Status wird ueber das Menue (Genehmigen/Ablehnen) geaendert, nicht hier.
 */
class EditRegistrationDialog : DialogFragment() {

    private lateinit var nameInput: TextInputEditText
    private lateinit var emailInput: TextInputEditText
    private lateinit var phoneInput: TextInputEditText
    private lateinit var participantsInput: TextInputEditText
    private lateinit var notesInput: TextInputEditText

    var onSaved: (() -> Unit)? = null

    private var eventId: String = ""
    private var regId: String = ""
    private var initialName: String = ""
    private var initialEmail: String = ""
    private var initialPhone: String = ""
    private var initialParticipants: Int = 1
    private var initialNotes: String = ""

    override fun onCreateDialog(savedInstanceState: Bundle?): Dialog {
        eventId = arguments?.getString(ARG_EVENT_ID).orEmpty()
        regId = arguments?.getString(ARG_REG_ID).orEmpty()
        initialName = arguments?.getString(ARG_NAME).orEmpty()
        initialEmail = arguments?.getString(ARG_EMAIL).orEmpty()
        initialPhone = arguments?.getString(ARG_PHONE).orEmpty()
        initialParticipants = arguments?.getInt(ARG_PARTICIPANTS, 1) ?: 1
        initialNotes = arguments?.getString(ARG_NOTES).orEmpty()

        val ctx = requireContext()
        val dp = ctx.resources.displayMetrics.density
        val pad = (16 * dp).toInt()

        val container = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, 0)
        }

        nameInput = addField(container, "Name", initialName, InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_WORDS)
        emailInput = addField(container, "E-Mail", initialEmail, InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS)
        phoneInput = addField(container, "Telefon", initialPhone, InputType.TYPE_CLASS_PHONE)
        participantsInput = addField(container, "Personen", initialParticipants.toString(), InputType.TYPE_CLASS_NUMBER)
        notesInput = addField(container, "Notiz", initialNotes, InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE)

        return AlertDialog.Builder(ctx)
            .setTitle("Anmeldung bearbeiten")
            .setView(container)
            .setPositiveButton("Speichern", null)
            .setNegativeButton("Abbrechen", null)
            .create().also { dlg ->
                dlg.setOnShowListener {
                    dlg.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener { submit(dlg) }
                }
            }
    }

    private fun addField(parent: LinearLayout, hint: String, initial: String, inputType: Int): TextInputEditText {
        val til = TextInputLayout(parent.context).apply {
            this.hint = hint
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { topMargin = (4 * resources.displayMetrics.density).toInt() }
        }
        val edit = TextInputEditText(parent.context).apply {
            this.inputType = inputType
            setText(initial)
        }
        til.addView(edit)
        parent.addView(til)
        return edit
    }

    private fun submit(dlg: AlertDialog) {
        val newName = nameInput.text?.toString()?.trim().orEmpty()
        if (newName.isBlank()) { nameInput.error = "Pflichtfeld"; return }
        val newEmail = emailInput.text?.toString()?.trim()?.ifBlank { null }
        val newPhone = phoneInput.text?.toString()?.trim()?.ifBlank { null }
        val newParticipants = participantsInput.text?.toString()?.toIntOrNull() ?: 1
        val newNotes = notesInput.text?.toString()?.trim()?.ifBlank { null }

        val body = OrganizerEditRegistrationRequest(
            guestName = newName,
            guestEmail = newEmail,
            guestPhone = newPhone,
            participants = newParticipants,
            notes = newNotes
        )

        dlg.getButton(AlertDialog.BUTTON_POSITIVE).isEnabled = false
        lifecycleScope.launch {
            try {
                val resp = ApiModule.eventsApi.editAsOrganizer(eventId, regId, body)
                if (resp.isSuccessful) {
                    onSaved?.invoke()
                    dismiss()
                } else {
                    Snackbar.make(dlg.window!!.decorView, "Fehler ${resp.code()}", Snackbar.LENGTH_LONG).show()
                    dlg.getButton(AlertDialog.BUTTON_POSITIVE).isEnabled = true
                }
            } catch (e: Exception) {
                Snackbar.make(dlg.window!!.decorView, "Netzwerkfehler: ${e.message}", Snackbar.LENGTH_LONG).show()
                dlg.getButton(AlertDialog.BUTTON_POSITIVE).isEnabled = true
            }
        }
    }

    companion object {
        private const val ARG_EVENT_ID = "event_id"
        private const val ARG_REG_ID = "reg_id"
        private const val ARG_NAME = "name"
        private const val ARG_EMAIL = "email"
        private const val ARG_PHONE = "phone"
        private const val ARG_PARTICIPANTS = "participants"
        private const val ARG_NOTES = "notes"

        fun newInstance(eventId: String, reg: EventRegistration): EditRegistrationDialog {
            val displayName = listOfNotNull(reg.memberVorname, reg.memberNachname)
                .joinToString(" ")
                .ifBlank { reg.guestName.orEmpty() }
            return EditRegistrationDialog().apply {
                arguments = Bundle().apply {
                    putString(ARG_EVENT_ID, eventId)
                    putString(ARG_REG_ID, reg.id)
                    putString(ARG_NAME, displayName)
                    putString(ARG_EMAIL, reg.guestEmail.orEmpty())
                    putString(ARG_PHONE, reg.parsedNotes?.phone.orEmpty())
                    putInt(ARG_PARTICIPANTS, reg.parsedNotes?.participants ?: 1)
                    putString(ARG_NOTES, reg.parsedNotes?.notes.orEmpty())
                }
            }
        }
    }
}
