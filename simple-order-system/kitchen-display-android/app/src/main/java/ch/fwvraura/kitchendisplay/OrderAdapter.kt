package ch.fwvraura.kitchendisplay

import android.graphics.Color
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.kitchendisplay.models.Order
import ch.fwvraura.kitchendisplay.models.OrderItem
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView

class OrderAdapter(
    private val currentStation: () -> String,
    private val onCompleteClick: (Order) -> Unit
) : RecyclerView.Adapter<OrderAdapter.OrderViewHolder>() {

    private var orders = listOf<Order>()

    fun submitList(newOrders: List<Order>) {
        val diffResult = DiffUtil.calculateDiff(object : DiffUtil.Callback() {
            override fun getOldListSize() = orders.size
            override fun getNewListSize() = newOrders.size
            override fun areItemsTheSame(oldPos: Int, newPos: Int) =
                orders[oldPos].id == newOrders[newPos].id
            override fun areContentsTheSame(oldPos: Int, newPos: Int) =
                orders[oldPos] == newOrders[newPos]
        })
        orders = newOrders
        diffResult.dispatchUpdatesTo(this)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): OrderViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_order, parent, false)
        return OrderViewHolder(view)
    }

    override fun onBindViewHolder(holder: OrderViewHolder, position: Int) {
        holder.bind(orders[position])
    }

    override fun getItemCount() = orders.size

    inner class OrderViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val card: MaterialCardView = itemView as MaterialCardView
        private val tableNumber: TextView = itemView.findViewById(R.id.tableNumber)
        private val orderTime: TextView = itemView.findViewById(R.id.orderTime)
        private val itemsContainer: LinearLayout = itemView.findViewById(R.id.itemsContainer)
        private val btnComplete: MaterialButton = itemView.findViewById(R.id.btnComplete)

        private val colorUrgent = ContextCompat.getColor(itemView.context, R.color.urgent)
        private val colorPrimary = ContextCompat.getColor(itemView.context, R.color.primary)
        private val colorBar = ContextCompat.getColor(itemView.context, R.color.bar_station)
        private val colorKitchen = ContextCompat.getColor(itemView.context, R.color.kitchen_station)
        private val colorWarning = ContextCompat.getColor(itemView.context, R.color.warning)
        private val colorTextPrimary = ContextCompat.getColor(itemView.context, R.color.text_primary)
        private val colorAccent = ContextCompat.getColor(itemView.context, R.color.accent)

        fun bind(order: Order) {
            val station = currentStation()

            // Table number
            tableNumber.text = if (order.tableNumber == 0) {
                "Theke"
            } else {
                "Tisch ${order.tableNumber}"
            }

            // Time elapsed
            val minutes = order.getMinutesElapsed()
            orderTime.text = "${minutes} min"

            // Card border color based on urgency
            card.strokeColor = if (order.isUrgent()) colorUrgent else colorPrimary

            // Items
            itemsContainer.removeAllViews()
            val items = order.getItemsForStation(station)
            for (item in items) {
                addItemView(item)
            }

            // Complete button
            btnComplete.setOnClickListener {
                onCompleteClick(order)
            }
        }

        private fun addItemView(item: OrderItem) {
            val itemView = LayoutInflater.from(itemsContainer.context)
                .inflate(R.layout.item_order_item, itemsContainer, false)

            val quantity: TextView = itemView.findViewById(R.id.quantity)
            val itemName: TextView = itemView.findViewById(R.id.itemName)
            val stationBadge: TextView = itemView.findViewById(R.id.stationBadge)
            val notes: TextView = itemView.findViewById(R.id.notes)

            quantity.text = "${item.quantity}x"
            quantity.setTextColor(colorAccent)

            itemName.text = item.itemName
            itemName.setTextColor(colorTextPrimary)

            // Station badge
            stationBadge.text = if (item.isBar) "Bar" else "Küche"
            stationBadge.setBackgroundColor(if (item.isBar) colorBar else colorKitchen)

            // Notes
            if (!item.notes.isNullOrBlank()) {
                notes.visibility = View.VISIBLE
                notes.text = item.notes
                if (item.hasAllergyWarning()) {
                    notes.setTextColor(colorUrgent)
                } else {
                    notes.setTextColor(colorWarning)
                }
            } else {
                notes.visibility = View.GONE
            }

            itemsContainer.addView(itemView)
        }
    }
}
