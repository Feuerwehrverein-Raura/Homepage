package ch.fwvraura.vorstand.ui.mailcow

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.data.model.QuotaInfo
import ch.fwvraura.vorstand.databinding.ItemQuotaBinding

class QuotaAdapter : ListAdapter<QuotaInfo, QuotaAdapter.ViewHolder>(DiffCallback()) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemQuotaBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return ViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    inner class ViewHolder(private val binding: ItemQuotaBinding) : RecyclerView.ViewHolder(binding.root) {

        fun bind(item: QuotaInfo) {
            val ctx = binding.root.context
            binding.email.text = item.email
            binding.name.text = item.name ?: ""

            val percent = item.percentUsed.coerceIn(0, 100)
            binding.progressBar.progress = percent
            binding.percentText.text = "$percent%"

            val usedMb = item.quotaUsed / (1024 * 1024)
            val totalMb = item.quota / (1024 * 1024)
            binding.usageText.text = ctx.getString(R.string.mailcow_quota_usage, "${usedMb} MB", "${totalMb} MB")

            val color = when {
                percent > 90 -> ContextCompat.getColor(ctx, R.color.error)
                percent > 70 -> ContextCompat.getColor(ctx, R.color.warning)
                else -> ContextCompat.getColor(ctx, R.color.success)
            }
            binding.progressBar.setIndicatorColor(color)
            binding.percentText.setTextColor(color)
        }
    }

    class DiffCallback : DiffUtil.ItemCallback<QuotaInfo>() {
        override fun areItemsTheSame(oldItem: QuotaInfo, newItem: QuotaInfo) =
            oldItem.email == newItem.email
        override fun areContentsTheSame(oldItem: QuotaInfo, newItem: QuotaInfo) =
            oldItem == newItem
    }
}
