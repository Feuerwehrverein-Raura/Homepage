package ch.fwvraura.members.ui.organizer

import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.LinearLayout
import android.widget.PopupMenu
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import ch.fwvraura.members.MembersApp
import ch.fwvraura.members.data.api.ApiModule
import ch.fwvraura.members.data.model.Event
import ch.fwvraura.members.data.model.EventRegistration
import ch.fwvraura.members.data.model.Recipe
import ch.fwvraura.members.data.model.Shift
import ch.fwvraura.members.data.model.ShoppingItem
import ch.fwvraura.members.data.model.ShoppingList
import ch.fwvraura.members.data.model.parseRegNotes
import ch.fwvraura.members.databinding.DialogOrgNotifyBinding
import ch.fwvraura.members.databinding.DialogOrgSuggestAlternativeBinding
import ch.fwvraura.members.databinding.FragmentOrganizerBinding
import ch.fwvraura.members.databinding.ItemOrganizerEventBinding
import ch.fwvraura.members.databinding.ItemRegistrationBinding
import ch.fwvraura.members.util.DateUtils
import ch.fwvraura.members.util.FileOpener
import com.google.android.material.snackbar.Snackbar
import kotlinx.coroutines.launch

class OrganizerDashboardFragment : Fragment() {

    private var _binding: FragmentOrganizerBinding? = null
    private val binding get() = _binding!!

    private val regToEventId = mutableMapOf<String, String>()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentOrganizerBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.swipeRefresh.setOnRefreshListener { load() }
        load()
    }

    private fun isMemberMode(): Boolean =
        MembersApp.instance.tokenManager.accountType != "organizer"

    private fun load() {
        binding.progress.visibility = View.VISIBLE
        binding.emptyText.visibility = View.GONE
        binding.eventsContainer.removeAllViews()
        regToEventId.clear()
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                if (isMemberMode()) loadAsMember() else loadAsOrganizer()
            } catch (e: Exception) {
                showError("Netzwerkfehler: ${e.message}")
            } finally {
                binding.progress.visibility = View.GONE
                binding.swipeRefresh.isRefreshing = false
            }
        }
    }

    private suspend fun loadAsMember() {
        val eventsResp = ApiModule.eventsApi.listOrganizedByMe()
        if (!eventsResp.isSuccessful) {
            showError("Fehler ${eventsResp.code()}")
            return
        }
        val events = eventsResp.body().orEmpty()
        if (events.isEmpty()) {
            binding.emptyText.text = "Du organisierst aktuell kein Event."
            binding.emptyText.visibility = View.VISIBLE
            return
        }
        for (event in events) {
            val regsResp = ApiModule.eventsApi.listOrganizerRegistrations(event.id)
            val regs = if (regsResp.isSuccessful) regsResp.body().orEmpty() else emptyList()
            regs.forEach { regToEventId[it.id] = event.id }
            renderEventCard(event, regs)
        }
    }

    private suspend fun loadAsOrganizer() {
        val response = ApiModule.eventsApi.listMyEventRegistrations()
        if (!response.isSuccessful) {
            showError("Fehler ${response.code()}")
            return
        }
        val regs = response.body().orEmpty()
        // Im organizer-Mode kennen wir den Event-Titel nicht; rendern unter generischem Header.
        renderEventCard(
            Event(id = "my-event", title = "Mein Event"),
            regs
        )
    }

    private fun renderEventCard(event: Event, regs: List<EventRegistration>) {
        val card = ItemOrganizerEventBinding.inflate(layoutInflater, binding.eventsContainer, false)
        card.orgEventTitle.text = event.title
        card.orgEventDate.text = DateUtils.formatDate(event.startDate)
        card.orgEventDate.visibility = if (event.startDate.isNullOrBlank()) View.GONE else View.VISIBLE
        card.orgEventLocation.text = event.location.orEmpty()
        card.orgEventLocation.visibility = if (event.location.isNullOrBlank()) View.GONE else View.VISIBLE

        // Im organizer-Mode (Single-Event-Login) gibt es keine echte Event-ID — Hinzufuegen
        // und Event-Aktionen unterstuetzen wir nur fuer Member-Mode.
        if (isMemberMode()) {
            card.orgEventAddBtn.visibility = View.VISIBLE
            card.orgEventAddBtn.setOnClickListener {
                AddRegistrationDialog.newInstance(event.id).apply {
                    onAdded = { load() }
                }.show(parentFragmentManager, "add-reg")
            }
            // Event-Aktionen (PDFs, Informieren, Verwalten) — brauchen die echte Event-ID.
            card.orgEventActionsContainer.visibility = View.VISIBLE
            card.orgEventTeilnehmerlisteBtn.setOnClickListener { downloadTeilnehmerlistePdf(event.id) }
            card.orgEventAushangBtn.setOnClickListener { downloadAushangPdf(event.id) }
            card.orgEventNotifyBtn.setOnClickListener { showNotifyDialog(event) }
            card.orgEventManageBtn.setOnClickListener {
                startActivity(
                    Intent(requireContext(), ch.fwvraura.members.ui.organizer.OrganizerEditEventActivity::class.java)
                        .putExtra("eventId", event.id)
                )
            }
        } else {
            card.orgEventAddBtn.visibility = View.GONE
            card.orgEventActionsContainer.visibility = View.GONE
        }

        // Kapazitaet zaehlt Personen (participants pro Anmeldung), nicht Anmelde-Zeilen,
        // damit Begleitpersonen mitzaehlen (konsistent mit der Web- und Vorstand-Ansicht).
        val pending = regs.count { it.status == "pending" }
        val approved = regs.count { it.status == "approved" }
        val approvedPersons = regs.filter { it.status == "approved" }
            .sumOf { parseRegNotes(it.notes).participants }
        card.orgEventStatPending.text = "$pending wartend"
        card.orgEventStatApproved.text = "$approved bestätigt"
        val capLabel = event.maxParticipants?.let { "$approvedPersons / $it Plätze" } ?: "$approvedPersons total"
        card.orgEventStatCapacity.text = capLabel

        card.orgEventRegsContainer.removeAllViews()
        if (regs.isEmpty()) {
            card.orgEventRegsEmpty.visibility = View.VISIBLE
        } else {
            card.orgEventRegsEmpty.visibility = View.GONE
            val sorted = regs.sortedBy { it.status != "pending" }
            for (r in sorted) {
                val item = ItemRegistrationBinding.inflate(layoutInflater, card.orgEventRegsContainer, false)
                bindRegistration(item, r)
                card.orgEventRegsContainer.addView(item.root)
            }
        }
        binding.eventsContainer.addView(card.root)

        // Rezepte & Einkaufsliste laden (nur Member-Mode: echte Event-ID). Rendert
        // nichts, falls keine Rezepte verknuepft sind — Section bleibt ausgeblendet.
        if (isMemberMode()) {
            loadRecipesAndShopping(event.id, card.orgEventRecipesContainer)
        }
    }

    private fun bindRegistration(item: ItemRegistrationBinding, r: EventRegistration) {
        val displayName = listOfNotNull(r.memberVorname, r.memberNachname)
            .joinToString(" ")
            .ifBlank { r.guestName ?: "(unbekannt)" }
        item.regName.text = displayName

        item.regStatus.text = when (r.status) {
            "approved" -> "Genehmigt"
            "rejected" -> "Abgelehnt"
            "pending" -> "Offen"
            else -> r.status ?: ""
        }
        item.regStatus.setTextColor(when (r.status) {
            "approved" -> Color.parseColor("#0F7A2D")
            "rejected" -> Color.parseColor("#B91C1C")
            "pending" -> Color.parseColor("#A05A00")
            else -> Color.parseColor("#4B5563")
        })

        // Volle Zusatzdaten aus dem rohen notes-JSON (inkl. Begleitung/Menue),
        // nur tatsaechlich vorhandene Teile — je auf eigener Zeile.
        val n = parseRegNotes(r.notes)
        val details = mutableListOf<String>()
        if (n.participants > 1) details += "👥 ${n.participants} Personen"
        if (!n.phone.isNullOrBlank()) details += "📞 ${n.phone}"
        if (n.companions.isNotEmpty()) {
            val names = n.companions.mapNotNull { it.name?.takeIf { nm -> nm.isNotBlank() } }
            if (names.isNotEmpty()) details += "Begleitung: " + names.joinToString(", ")
        }
        if (!n.allergies.isNullOrBlank()) details += "⚠️ ${n.allergies}"
        if (!n.mealSelection.isNullOrBlank()) details += "🍽 ${n.mealSelection}"
        if (!n.text.isNullOrBlank()) details += "📝 ${n.text}"
        r.guestEmail?.takeIf { it.isNotBlank() }?.let { details += "✉️ $it" }
        item.regMeta.text = details.joinToString("\n")
        item.regMeta.visibility = if (details.isEmpty()) View.GONE else View.VISIBLE

        item.btnRegMenu.setOnClickListener { v -> showRegMenu(v, r) }
    }

    private fun showRegMenu(anchor: View, r: EventRegistration) {
        val popup = PopupMenu(requireContext(), anchor)
        // Genehmigen/Ablehnen nur bei pending. Bearbeiten/Loeschen nur fuer Member-Mode-Organisatoren
        // (Single-Event-Organisatoren haben keine Event-ID -> /as-organizer-Endpoint geht nicht).
        val canEdit = isMemberMode() && regToEventId.containsKey(r.id)
        if (r.status == "pending") {
            popup.menu.add(0, MENU_APPROVE, 0, "Genehmigen")
            popup.menu.add(0, MENU_REJECT, 1, "Ablehnen")
        }
        if (canEdit) {
            popup.menu.add(0, MENU_EDIT, 2, "Bearbeiten")
            popup.menu.add(0, MENU_DELETE, 3, "Löschen")
            // Alternative Schicht vorschlagen — nur bei Events mit Schichten sinnvoll;
            // das wird beim Antippen ueber getEvent geprueft.
            popup.menu.add(0, MENU_SUGGEST_ALT, 4, "Alternative vorschlagen")
        }
        popup.setOnMenuItemClickListener { mi ->
            when (mi.itemId) {
                MENU_APPROVE -> { approve(r); true }
                MENU_REJECT -> { reject(r); true }
                MENU_EDIT -> { editRegistration(r); true }
                MENU_DELETE -> { confirmDelete(r); true }
                MENU_SUGGEST_ALT -> { suggestAlternative(r); true }
                else -> false
            }
        }
        popup.show()
    }

    private fun editRegistration(reg: EventRegistration) {
        val eventId = regToEventId[reg.id] ?: return
        EditRegistrationDialog.newInstance(eventId, reg).apply {
            onSaved = { load() }
        }.show(parentFragmentManager, "edit-reg")
    }

    private fun confirmDelete(reg: EventRegistration) {
        val eventId = regToEventId[reg.id] ?: return
        val name = listOfNotNull(reg.memberVorname, reg.memberNachname)
            .joinToString(" ").ifBlank { reg.guestName ?: "diese Anmeldung" }
        AlertDialog.Builder(requireContext())
            .setTitle("Anmeldung löschen?")
            .setMessage("Möchtest du die Anmeldung von \"$name\" wirklich löschen?")
            .setPositiveButton("Löschen") { _, _ -> performDelete(eventId, reg.id) }
            .setNegativeButton("Abbrechen", null)
            .show()
    }

    private fun performDelete(eventId: String, regId: String) {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ApiModule.eventsApi.deleteAsOrganizer(eventId, regId)
                if (response.isSuccessful) load()
                else showError("Fehler ${response.code()}")
            } catch (e: Exception) { showError("Netzwerkfehler: ${e.message}") }
        }
    }

    private fun approve(reg: EventRegistration) {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = if (isMemberMode()) {
                    val eventId = regToEventId[reg.id] ?: return@launch
                    ApiModule.eventsApi.approveAsOrganizer(eventId, reg.id)
                } else {
                    ApiModule.eventsApi.approveMyEventRegistration(reg.id)
                }
                if (response.isSuccessful) load()
                else showError("Fehler ${response.code()}")
            } catch (e: Exception) { showError("Netzwerkfehler: ${e.message}") }
        }
    }

    private fun reject(reg: EventRegistration) {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = if (isMemberMode()) {
                    val eventId = regToEventId[reg.id] ?: return@launch
                    ApiModule.eventsApi.rejectAsOrganizer(eventId, reg.id)
                } else {
                    ApiModule.eventsApi.rejectMyEventRegistration(reg.id)
                }
                if (response.isSuccessful) load()
                else showError("Fehler ${response.code()}")
            } catch (e: Exception) { showError("Netzwerkfehler: ${e.message}") }
        }
    }

    // ============================================================
    // Alternative Schicht vorschlagen (pro Anmeldung, Member-Mode).
    // ============================================================

    /**
     * Schlaegt der angemeldeten Person eine alternative Schicht vor. Laedt zuerst
     * das Event (inkl. Schichten) — die organized-by-me/organizer-registrations-
     * Endpunkte liefern die Schichten nicht mit. Ohne Schichten oder ohne
     * hinterlegte E-Mail wird abgebrochen.
     */
    private fun suggestAlternative(reg: EventRegistration) {
        val eventId = regToEventId[reg.id] ?: return
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val resp = ApiModule.eventsApi.getEvent(eventId)
                val shifts = resp.body()?.shifts.orEmpty()
                if (!resp.isSuccessful || shifts.isEmpty()) {
                    toast("Keine Schichten vorhanden")
                    return@launch
                }
                val email = reg.guestEmail?.trim().orEmpty()
                if (email.isBlank()) {
                    toast("Keine E-Mail-Adresse hinterlegt")
                    return@launch
                }
                showSuggestAlternativeDialog(eventId, reg, shifts, email)
            } catch (e: Exception) {
                showError("Netzwerkfehler: ${e.message}")
            }
        }
    }

    private fun showSuggestAlternativeDialog(
        eventId: String,
        reg: EventRegistration,
        shifts: List<Shift>,
        email: String
    ) {
        val dlgBinding = DialogOrgSuggestAlternativeBinding.inflate(layoutInflater)
        val labels = shifts.map { shiftLabel(it) }
        dlgBinding.orgSuggestShift.setAdapter(
            ArrayAdapter(requireContext(), android.R.layout.simple_dropdown_item_1line, labels)
        )
        var selectedIndex = -1
        dlgBinding.orgSuggestShift.setOnItemClickListener { _, _, position, _ -> selectedIndex = position }

        val dialog = AlertDialog.Builder(requireContext())
            .setTitle("Alternative vorschlagen")
            .setView(dlgBinding.root)
            .setPositiveButton("Vorschlagen", null)
            .setNegativeButton("Abbrechen", null)
            .create()
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                if (selectedIndex < 0) {
                    toast("Bitte eine Schicht auswählen")
                    return@setOnClickListener
                }
                val target = shifts[selectedIndex]
                val comment = dlgBinding.orgSuggestComment.text?.toString()?.trim().orEmpty()
                performSuggestAlternative(eventId, reg.id, target.id, email, labels[selectedIndex], comment, dialog)
            }
        }
        dialog.show()
    }

    private fun performSuggestAlternative(
        eventId: String,
        regId: String,
        newShiftId: String,
        email: String,
        shiftInfo: String,
        comment: String,
        dialog: AlertDialog
    ) {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val resp = ApiModule.eventsApi.suggestAlternativeAsOrganizer(
                    eventId, regId,
                    mapOf(
                        "newShiftId" to newShiftId,
                        "email" to email,
                        "shiftInfo" to shiftInfo,
                        "comment" to comment
                    )
                )
                if (resp.isSuccessful) {
                    toast("Alternative vorgeschlagen")
                    dialog.dismiss()
                } else {
                    showError("Fehler ${resp.code()}")
                }
            } catch (e: Exception) {
                showError("Netzwerkfehler: ${e.message}")
            }
        }
    }

    /** Menschenlesbares Schicht-Label: "{Bereich} - {Name} ({Datum} {Start}-{Ende})". */
    private fun shiftLabel(s: Shift): String {
        val prefix = s.bereich?.takeIf { it.isNotBlank() }?.let { "$it - " } ?: ""
        val time = "${s.startTime ?: ""}-${s.endTime ?: ""}"
        return "$prefix${s.name} (${DateUtils.formatDate(s.date)} $time)".trim()
    }

    // ============================================================
    // Angemeldete informieren (pro Event, Member-Mode).
    // ============================================================

    private fun showNotifyDialog(event: Event) {
        val dlgBinding = DialogOrgNotifyBinding.inflate(layoutInflater)
        dlgBinding.orgNotifySubject.setText("Änderung: ${event.title}")

        val dialog = AlertDialog.Builder(requireContext())
            .setTitle("Angemeldete informieren")
            .setView(dlgBinding.root)
            .setPositiveButton("Senden", null)
            .setNegativeButton("Abbrechen", null)
            .create()
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val subject = dlgBinding.orgNotifySubject.text?.toString()?.trim().orEmpty()
                val message = dlgBinding.orgNotifyMessage.text?.toString()?.trim().orEmpty()
                if (message.isBlank()) {
                    toast("Bitte eine Nachricht eingeben")
                    return@setOnClickListener
                }
                performNotify(event.id, subject, message, dialog)
            }
        }
        dialog.show()
    }

    private fun performNotify(eventId: String, subject: String, message: String, dialog: AlertDialog) {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val resp = ApiModule.eventsApi.notifyRegistrantsAsOrganizer(
                    eventId,
                    mapOf("subject" to subject, "message" to message)
                )
                if (resp.isSuccessful) {
                    dialog.dismiss()
                    val result = resp.body()
                    if (result != null) {
                        val summary = StringBuilder()
                            .append("${result.emailed} per E-Mail, ")
                            .append("${result.posted} per Brief, ")
                            .append("${result.skipped} übersprungen")
                        if (result.unreachable.isNotEmpty()) {
                            summary.append("\nNicht erreichbar: ")
                                .append(result.unreachable.joinToString(", "))
                        }
                        AlertDialog.Builder(requireContext())
                            .setTitle("Benachrichtigung gesendet")
                            .setMessage(summary.toString())
                            .setPositiveButton("OK", null)
                            .show()
                    } else {
                        toast("Benachrichtigung gesendet")
                    }
                } else {
                    showError("Fehler ${resp.code()}")
                }
            } catch (e: Exception) {
                showError("Netzwerkfehler: ${e.message}")
            }
        }
    }

    // ============================================================
    // PDF-Exporte (pro Event, Member-Mode).
    // ============================================================

    private fun downloadTeilnehmerlistePdf(eventId: String) {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val resp = ApiModule.eventsApi.getTeilnehmerlistePdf(eventId)
                val body = resp.body()
                if (resp.isSuccessful && body != null) {
                    val ok = FileOpener.openPdf(requireContext(), body.bytes(), "teilnehmerliste.pdf")
                    if (!ok) toast("Keine PDF-App gefunden")
                } else {
                    showError("Fehler ${resp.code()}")
                }
            } catch (e: Exception) {
                showError("Netzwerkfehler: ${e.message}")
            }
        }
    }

    private fun downloadAushangPdf(eventId: String) {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val resp = ApiModule.eventsApi.getAushangPdf(eventId)
                val body = resp.body()
                when {
                    resp.isSuccessful && body != null -> {
                        val ok = FileOpener.openPdf(requireContext(), body.bytes(), "aushang.pdf")
                        if (!ok) toast("Keine PDF-App gefunden")
                    }
                    resp.code() == 404 -> toast("Kein PDF-Aushang hinterlegt")
                    else -> showError("Fehler ${resp.code()}")
                }
            } catch (e: Exception) {
                showError("Netzwerkfehler: ${e.message}")
            }
        }
    }

    // ============================================================
    // Rezepte & Einkaufsliste (read-only, pro Event, Member-Mode).
    // ============================================================

    /**
     * Laedt Rezepte + Einkaufsliste und befuellt den Section-Container. Ohne
     * verknuepfte Rezepte (oder bei Fehler) bleibt die Section ausgeblendet.
     */
    private fun loadRecipesAndShopping(eventId: String, container: LinearLayout) {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val recipesResp = ApiModule.eventsApi.getRecipes(eventId)
                val recipes = if (recipesResp.isSuccessful) recipesResp.body().orEmpty() else emptyList()
                if (recipes.isEmpty()) return@launch
                val shoppingResp = ApiModule.eventsApi.getShoppingList(eventId)
                val shopping = if (shoppingResp.isSuccessful) shoppingResp.body() else null
                renderRecipesSection(container, recipes, shopping)
            } catch (_: Exception) { /* Section bleibt ausgeblendet */ }
        }
    }

    private fun renderRecipesSection(container: LinearLayout, recipes: List<Recipe>, shopping: ShoppingList?) {
        container.removeAllViews()

        // Trennlinie oben
        container.addView(View(requireContext()).apply {
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(1))
                .apply { topMargin = dp(10); bottomMargin = dp(8) }
            setBackgroundColor(Color.parseColor("#E5E7EB"))
        })
        container.addView(sectionTextView("Rezepte & Einkaufsliste", 14f, "#111827", bold = true, topDp = 0))

        // Rezeptnamen inline
        val names = recipes.mapNotNull { it.name?.takeIf { nm -> nm.isNotBlank() } }
        if (names.isNotEmpty()) {
            container.addView(sectionTextView(names.joinToString(" · "), 13f, "#4B5563", bold = false, topDp = 4))
        }

        // Einkaufslisten-Positionen
        val items = shopping?.items.orEmpty()
        for (item in items) {
            container.addView(sectionTextView(shoppingRowText(item), 13f, "#4B5563", bold = false, topDp = 4))
        }

        // Summenzeile
        if (shopping != null) {
            val total = shopping.totalToBuy ?: items.size
            val cost = shopping.estimatedOpenCost ?: 0.0
            container.addView(
                sectionTextView("$total Positionen · Offen: CHF ${formatCost(cost)}", 13f, "#111827", bold = true, topDp = 6)
            )
        }

        container.visibility = View.VISIBLE
    }

    /** Eine Einkaufslisten-Zeile: "{✅/⬜} {Name}  {Menge Einheit}  {Empfehlung}". */
    private fun shoppingRowText(item: ShoppingItem): String {
        val check = if (item.purchased) "✅" else "⬜"
        val qtyUnit = listOf(formatQty(item.toBuy), item.unit.orEmpty())
            .filter { it.isNotBlank() }.joinToString(" ")
        return buildString {
            append(check).append(" ").append(item.itemName.orEmpty())
            if (qtyUnit.isNotBlank()) append("  ").append(qtyUnit)
            item.recommendation?.takeIf { it.isNotBlank() }?.let { append("  ").append(it) }
        }
    }

    /** Menge ohne unnoetige Nachkommastellen (2.0 -> "2", 1.5 -> "1.5"). */
    private fun formatQty(v: Double?): String {
        if (v == null) return ""
        return if (v % 1.0 == 0.0) v.toLong().toString() else v.toString()
    }

    private fun formatCost(v: Double): String = String.format(java.util.Locale.US, "%.2f", v)

    /** Baut einen einfachen TextView fuer die programmatisch erzeugte Rezept-Section. */
    private fun sectionTextView(text: String, sizeSp: Float, colorHex: String, bold: Boolean, topDp: Int): TextView =
        TextView(requireContext()).apply {
            this.text = text
            textSize = sizeSp
            setTextColor(Color.parseColor(colorHex))
            if (bold) setTypeface(typeface, Typeface.BOLD)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { if (topDp > 0) topMargin = dp(topDp) }
        }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    private fun toast(msg: String) {
        Toast.makeText(requireContext(), msg, Toast.LENGTH_SHORT).show()
    }

    private fun showError(msg: String) {
        Snackbar.make(binding.root, msg, Snackbar.LENGTH_LONG).show()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }

    companion object {
        private const val MENU_APPROVE = 1
        private const val MENU_REJECT = 2
        private const val MENU_EDIT = 3
        private const val MENU_DELETE = 4
        private const val MENU_SUGGEST_ALT = 5
    }
}
