package ch.fwvraura.vorstand.ui.membershipfees

import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import androidx.appcompat.app.AlertDialog
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import android.text.InputType
import android.widget.EditText
import ch.fwvraura.vorstand.data.api.ApiModule
import ch.fwvraura.vorstand.data.model.GeneratePaymentsRequest
import ch.fwvraura.vorstand.data.model.MarkFeePaidRequest
import ch.fwvraura.vorstand.data.model.MembershipFeePayment
import ch.fwvraura.vorstand.data.model.SendEmailBulkRequest
import ch.fwvraura.vorstand.data.model.SendSingleRequest
import ch.fwvraura.vorstand.data.model.SetReferenceRequest
import ch.fwvraura.vorstand.databinding.FragmentMembershipFeesBinding
import com.google.android.material.snackbar.Snackbar
import com.google.android.material.tabs.TabLayout
import kotlinx.coroutines.launch
import java.util.Calendar

/**
 * Phase 1 — Lesen + manuelles Markieren von Mitgliedsbeitraegen.
 *
 * Was es kann:
 *  - Jahr aus Dropdown waehlen (aktuelles + 4 Jahre zurueck).
 *  - Statistik-Box: total / bezahlt / offen.
 *  - Liste aller Zahlungen mit Filter (Alle/Offen/Bezahlt) und Namens-Suche.
 *  - Pro Zahlung "Als bezahlt markieren" oder "Zuruecksetzen auf offen".
 *
 * Spaeter (Phase 2/3): Beitragslauf generieren, Referenznummern, Versand.
 */
class MembershipFeesFragment : Fragment() {

    private var _binding: FragmentMembershipFeesBinding? = null
    private val binding get() = _binding!!

    private val adapter = FeePaymentsAdapter(
        onTogglePaid = ::onTogglePayment,
        onEditReference = ::onEditReference,
        onSend = ::onSendSingle
    )
    private var allPayments: List<MembershipFeePayment> = emptyList()
    private var selectedYear: Int = Calendar.getInstance().get(Calendar.YEAR)

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentMembershipFeesBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.toolbar.setNavigationOnClickListener { findNavController().navigateUp() }
        binding.feesRecycler.layoutManager = LinearLayoutManager(requireContext())
        binding.feesRecycler.adapter = adapter
        binding.feesRecycler.isNestedScrollingEnabled = false
        binding.swipeRefresh.setOnRefreshListener { load() }

        setupYearPicker()
        setupFilters()

        binding.btnSettings.setOnClickListener {
            FeeSettingsDialog.newInstance(selectedYear).apply {
                onSaved = {
                    Snackbar.make(binding.root, "Einstellungen gespeichert.", Snackbar.LENGTH_SHORT).show()
                }
            }.show(parentFragmentManager, "fee_settings")
        }

        binding.btnGenerate.setOnClickListener { onGenerateClicked() }
        binding.btnSendEmailBulk.setOnClickListener { onSendBulkClicked(channel = "email") }
        binding.btnSendPostBulk.setOnClickListener { onSendBulkClicked(channel = "post") }

        load()
    }

    private fun setupYearPicker() {
        val current = Calendar.getInstance().get(Calendar.YEAR)
        val years = (0..4).map { current - it }
        val labels = years.map { it.toString() }
        binding.yearPicker.setAdapter(ArrayAdapter(requireContext(), android.R.layout.simple_dropdown_item_1line, labels))
        binding.yearPicker.setText(current.toString(), false)
        binding.yearPicker.setOnItemClickListener { _, _, position, _ ->
            selectedYear = years[position]
            load()
        }
    }

    private fun setupFilters() {
        binding.statusTabs.addOnTabSelectedListener(object : TabLayout.OnTabSelectedListener {
            override fun onTabSelected(tab: TabLayout.Tab) { applyFilters() }
            override fun onTabUnselected(tab: TabLayout.Tab) {}
            override fun onTabReselected(tab: TabLayout.Tab) {}
        })
        binding.searchInput.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) { applyFilters() }
            override fun afterTextChanged(s: Editable?) {}
        })
    }

    private fun load() {
        binding.progress.visibility = View.VISIBLE
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val (paymentsResp, summaryResp) = kotlinx.coroutines.coroutineScope {
                    val a = kotlinx.coroutines.async { ApiModule.membershipFeesApi.listPayments(selectedYear) }
                    val b = kotlinx.coroutines.async { ApiModule.membershipFeesApi.getSummary(selectedYear) }
                    a.await() to b.await()
                }

                if (paymentsResp.isSuccessful) {
                    allPayments = paymentsResp.body().orEmpty()
                    applyFilters()
                } else {
                    showError("Fehler beim Laden (${paymentsResp.code()})")
                }

                if (summaryResp.isSuccessful) {
                    val s = summaryResp.body()
                    binding.statTotal.text = (s?.total ?: 0).toString()
                    binding.statPaid.text = (s?.paid ?: 0).toString()
                    binding.statOpen.text = (s?.open ?: 0).toString()
                    val paid = formatChf(s?.paidAmount)
                    val total = formatChf(s?.totalAmount)
                    binding.amountSummary.text = "Bezahlt CHF $paid von CHF $total"
                }
            } catch (e: Exception) {
                showError("Netzwerkfehler: ${e.message}")
            } finally {
                binding.progress.visibility = View.GONE
                binding.swipeRefresh.isRefreshing = false
            }
        }
    }

    private fun applyFilters() {
        val statusFilter = when (binding.statusTabs.selectedTabPosition) {
            1 -> "offen"
            2 -> "bezahlt"
            else -> null
        }
        val needle = binding.searchInput.text?.toString()?.trim()?.lowercase().orEmpty()

        val filtered = allPayments.filter { p ->
            (statusFilter == null || p.status == statusFilter) &&
                (needle.isBlank() || matches(p, needle))
        }
        adapter.submitList(filtered)
        binding.emptyText.visibility = if (filtered.isEmpty()) View.VISIBLE else View.GONE
    }

    private fun matches(p: MembershipFeePayment, needle: String): Boolean {
        val full = listOfNotNull(p.vorname, p.nachname).joinToString(" ").lowercase()
        return full.contains(needle) || (p.email ?: "").lowercase().contains(needle)
    }

    private fun onTogglePayment(p: MembershipFeePayment) {
        val isPaid = p.status == "bezahlt"
        val title = if (isPaid) "Auf offen zurücksetzen?" else "Als bezahlt markieren?"
        val name = listOfNotNull(p.vorname, p.nachname).joinToString(" ").ifBlank { "diese Zahlung" }
        AlertDialog.Builder(requireContext())
            .setTitle(title)
            .setMessage(if (isPaid)
                "Möchtest du die Zahlung von $name wirklich zurücksetzen?"
            else
                "Markiere die Zahlung von $name als bezahlt (Datum: heute).")
            .setPositiveButton(if (isPaid) "Zurücksetzen" else "Bezahlt") { _, _ -> sendToggle(p) }
            .setNegativeButton("Abbrechen", null)
            .show()
    }

    private fun sendToggle(p: MembershipFeePayment) {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val resp = if (p.status == "bezahlt")
                    ApiModule.membershipFeesApi.markUnpaid(p.id)
                else
                    ApiModule.membershipFeesApi.markPaid(p.id, MarkFeePaidRequest())
                if (resp.isSuccessful) load()
                else showError("Fehler ${resp.code()}")
            } catch (e: Exception) {
                showError("Netzwerkfehler: ${e.message}")
            }
        }
    }

    /** Beitragslauf erstellen — laedt zuerst Settings, fragt User um Bestaetigung, ruft dann generate. */
    private fun onGenerateClicked() {
        viewLifecycleOwner.lifecycleScope.launch {
            val settings = try {
                ApiModule.membershipFeesApi.getSettings(selectedYear).body()
            } catch (_: Exception) { null }

            if (settings == null || settings.amount.isNullOrBlank()) {
                AlertDialog.Builder(requireContext())
                    .setTitle("Einstellungen fehlen")
                    .setMessage("Für $selectedYear sind noch keine Beitragseinstellungen gespeichert. Bitte zuerst über \"Einstellungen\" Betrag und Datum festlegen.")
                    .setPositiveButton("OK", null)
                    .show()
                return@launch
            }

            val amountFmt = formatChf(settings.amount)
            AlertDialog.Builder(requireContext())
                .setTitle("Beitragslauf für $selectedYear?")
                .setMessage("Erstellt für jedes Aktiv-/Passivmitglied einen Eintrag mit CHF $amountFmt. Bestehende Einträge werden nicht überschrieben (Ehrenmitglieder ausgenommen).")
                .setPositiveButton("Erstellen") { _, _ -> doGenerate(settings.amount) }
                .setNegativeButton("Abbrechen", null)
                .show()
        }
    }

    private fun doGenerate(amount: String) {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val resp = ApiModule.membershipFeesApi.generatePayments(
                    GeneratePaymentsRequest(year = selectedYear, amount = amount)
                )
                if (resp.isSuccessful) {
                    val r = resp.body()
                    val msg = if (r != null)
                        "${r.created} neu, ${r.skipped} bestehend (von ${r.total} Mitgliedern)."
                    else
                        "Beitragslauf erstellt."
                    Snackbar.make(binding.root, msg, Snackbar.LENGTH_LONG).show()
                    load()
                } else {
                    showError("Fehler ${resp.code()}")
                }
            } catch (e: Exception) {
                showError("Netzwerkfehler: ${e.message}")
            }
        }
    }

    private fun onEditReference(p: MembershipFeePayment) {
        val ctx = requireContext()
        val input = EditText(ctx).apply {
            inputType = InputType.TYPE_CLASS_NUMBER
            hint = "Referenznummer (Bank)"
            setText(p.referenceNr.orEmpty())
        }
        val container = android.widget.FrameLayout(ctx).apply {
            val pad = (resources.displayMetrics.density * 20).toInt()
            setPadding(pad, 0, pad, 0)
            addView(input)
        }
        val name = listOfNotNull(p.vorname, p.nachname).joinToString(" ").ifBlank { "Mitglied" }
        AlertDialog.Builder(ctx)
            .setTitle("Referenz für $name")
            .setMessage("Die Bank-Referenznummer (i.d.R. 27-stellig) eintragen.")
            .setView(container)
            .setPositiveButton("Speichern") { _, _ ->
                val value = input.text?.toString()?.trim().orEmpty()
                sendReference(p, value)
            }
            .setNegativeButton("Abbrechen", null)
            .show()
    }

    private fun sendReference(p: MembershipFeePayment, value: String) {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val resp = ApiModule.membershipFeesApi.setReference(p.id, SetReferenceRequest(value))
                if (resp.isSuccessful) load()
                else showError("Fehler ${resp.code()}")
            } catch (e: Exception) {
                showError("Netzwerkfehler: ${e.message}")
            }
        }
    }

    /** Massenversand: zaehlt zuerst Kandidaten, fragt um Bestaetigung, ruft dann Endpoint.
     *  channel = "email" oder "post". */
    private fun onSendBulkClicked(channel: String) {
        val isEmail = channel == "email"
        val candidates = allPayments.count { p ->
            p.status == "offen" &&
                !p.referenceNr.isNullOrBlank() &&
                p.memberStatus != "Ehrenmitglied" && (
                    if (isEmail) !p.email.isNullOrBlank()
                    else !p.strasse.isNullOrBlank() && !p.plz.isNullOrBlank() && !p.ort.isNullOrBlank()
                )
        }
        val withoutRef = allPayments.count { p ->
            p.status == "offen" && p.memberStatus != "Ehrenmitglied" &&
                p.referenceNr.isNullOrBlank()
        }

        val channelLabel = if (isEmail) "E-Mail" else "Brief (Pingen)"
        val prefLabel = if (isEmail) "Zustellpräferenz E-Mail" else "Zustellpräferenz Post + vollständige Adresse"

        if (candidates == 0) {
            AlertDialog.Builder(requireContext())
                .setTitle("Keine Empfänger")
                .setMessage("Keine offenen Beiträge für $channelLabel-Versand in $selectedYear (Filter: $prefLabel + Ref-Nr).")
                .setPositiveButton("OK", null)
                .show()
            return
        }

        val warning = if (withoutRef > 0)
            "\n\n⚠ $withoutRef weitere Mitglieder haben keine Referenznummer und werden NICHT versendet (QR-Rechnung wäre unbrauchbar)."
        else ""

        val extraPostHint = if (!isEmail)
            "\n\nKostenpunkt: ca. CHF 1.– pro Brief via Pingen."
        else ""

        AlertDialog.Builder(requireContext())
            .setTitle("$channelLabel an $candidates Mitglieder?")
            .setMessage("Beitragsbrief für $selectedYear wird via $channelLabel an alle offenen Mitglieder mit $prefLabel versendet. Ehrenmitglieder ausgenommen.$warning$extraPostHint")
            .setPositiveButton("Senden") { _, _ -> doSendBulk(channel) }
            .setNegativeButton("Abbrechen", null)
            .show()
    }

    private fun doSendBulk(channel: String) {
        val isEmail = channel == "email"
        binding.btnSendEmailBulk.isEnabled = false
        binding.btnSendPostBulk.isEnabled = false
        binding.progress.visibility = View.VISIBLE
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val req = SendEmailBulkRequest(year = selectedYear)
                val resp = if (isEmail) ApiModule.membershipFeesApi.sendEmailBulk(req)
                else ApiModule.membershipFeesApi.sendPostBulk(req)
                if (resp.isSuccessful) {
                    val r = resp.body()
                    val msg = if (r != null)
                        "${r.success} versendet, ${r.failed} fehlgeschlagen (von ${r.candidates} Empfängern)."
                    else
                        "Versand abgeschlossen."
                    AlertDialog.Builder(requireContext())
                        .setTitle(if (isEmail) "E-Mail-Versand abgeschlossen" else "Brief-Versand abgeschlossen")
                        .setMessage(msg)
                        .setPositiveButton("OK", null)
                        .show()
                } else {
                    showError("Fehler ${resp.code()}")
                }
            } catch (e: Exception) {
                showError("Netzwerkfehler: ${e.message}")
            } finally {
                binding.btnSendEmailBulk.isEnabled = true
                binding.btnSendPostBulk.isEnabled = true
                binding.progress.visibility = View.GONE
            }
        }
    }

    /** Einzelversand: Auswahl-Dialog mit "E-Mail" oder "Brief" und dann API-Call. */
    private fun onSendSingle(p: MembershipFeePayment) {
        val name = listOfNotNull(p.vorname, p.nachname).joinToString(" ").ifBlank { "Mitglied" }
        val hasEmail = !p.email.isNullOrBlank()
        val hasAddress = !p.strasse.isNullOrBlank() && !p.plz.isNullOrBlank() && !p.ort.isNullOrBlank()

        val options = mutableListOf<Pair<String, String>>() // label -> channel
        if (hasEmail) options.add("E-Mail an ${p.email}" to "email")
        if (hasAddress) options.add("Brief via Pingen (~CHF 1.–)" to "post")

        if (options.isEmpty()) {
            AlertDialog.Builder(requireContext())
                .setTitle("Versand nicht möglich")
                .setMessage("$name hat weder E-Mail-Adresse noch vollständige Postadresse hinterlegt.")
                .setPositiveButton("OK", null)
                .show()
            return
        }

        AlertDialog.Builder(requireContext())
            .setTitle("Versand an $name")
            .setItems(options.map { it.first }.toTypedArray()) { _, which ->
                doSendSingle(p, options[which].second)
            }
            .setNegativeButton("Abbrechen", null)
            .show()
    }

    private fun doSendSingle(p: MembershipFeePayment, channel: String) {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val resp = ApiModule.membershipFeesApi.sendSingle(p.id, SendSingleRequest(channel))
                if (resp.isSuccessful && resp.body()?.success == true) {
                    val name = listOfNotNull(p.vorname, p.nachname).joinToString(" ").ifBlank { "Mitglied" }
                    val label = if (channel == "email") "E-Mail" else "Brief"
                    Snackbar.make(binding.root, "$label an $name versendet.", Snackbar.LENGTH_SHORT).show()
                } else {
                    val err = resp.body()?.error ?: resp.errorBody()?.string() ?: "Fehler ${resp.code()}"
                    showError(err)
                }
            } catch (e: Exception) {
                showError("Netzwerkfehler: ${e.message}")
            }
        }
    }

    private fun showError(msg: String) {
        Snackbar.make(binding.root, msg, Snackbar.LENGTH_LONG).show()
    }

    private fun formatChf(raw: String?): String = try {
        val v = raw?.toDoubleOrNull() ?: 0.0
        if (v == v.toInt().toDouble()) "%,d".format(v.toInt()).replace(',', '\'')
        else "%,.2f".format(v).replace(',', '\'')
    } catch (_: Exception) { raw ?: "0" }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
