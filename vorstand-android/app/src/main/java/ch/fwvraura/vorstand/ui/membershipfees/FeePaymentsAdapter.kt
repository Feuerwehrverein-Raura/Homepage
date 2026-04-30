package ch.fwvraura.vorstand.ui.membershipfees

import android.graphics.Color
import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.vorstand.data.model.MembershipFeePayment
import ch.fwvraura.vorstand.databinding.ItemFeePaymentBinding

class FeePaymentsAdapter(
    private val onToggle: (MembershipFeePayment) -> Unit
) : ListAdapter<MembershipFeePayment, FeePaymentsAdapter.VH>(DIFF) {

    inner class VH(val b: ItemFeePaymentBinding) : RecyclerView.ViewHolder(b.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH =
        VH(ItemFeePaymentBinding.inflate(LayoutInflater.from(parent.context), parent, false))

    override fun onBindViewHolder(holder: VH, position: Int) {
        val p = getItem(position)
        val b = holder.b
        b.feeName.text = listOfNotNull(p.nachname, p.vorname).joinToString(", ")
            .ifBlank { "(unbekannt)" }

        val isPaid = p.status == "bezahlt"
        b.feeStatus.text = if (isPaid) "Bezahlt" else "Offen"
        b.feeStatus.setTextColor(if (isPaid) Color.parseColor("#0F7A2D") else Color.parseColor("#A05A00"))

        val meta = mutableListOf<String>()
        p.amount?.let { meta.add("CHF ${formatAmount(it)}") }
        if (!p.referenceNr.isNullOrBlank()) {
            val short = p.referenceNr.takeLast(6)
            meta.add("Ref. …$short")
        }
        if (isPaid) p.paidDate?.takeIf { it.isNotBlank() }?.let { meta.add("Bezahlt am ${it.substring(0, minOf(10, it.length))}") }
        b.feeMeta.text = meta.joinToString(" · ")

        b.feeActionBtn.text = if (isPaid) "Zurücksetzen auf offen" else "Als bezahlt markieren"
        b.feeActionBtn.setOnClickListener { onToggle(p) }
    }

    private fun formatAmount(raw: String): String = try {
        val v = raw.toDouble()
        if (v == v.toInt().toDouble()) v.toInt().toString() else "%.2f".format(v)
    } catch (_: Exception) { raw }

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<MembershipFeePayment>() {
            override fun areItemsTheSame(o: MembershipFeePayment, n: MembershipFeePayment) = o.id == n.id
            override fun areContentsTheSame(o: MembershipFeePayment, n: MembershipFeePayment) = o == n
        }
    }
}
