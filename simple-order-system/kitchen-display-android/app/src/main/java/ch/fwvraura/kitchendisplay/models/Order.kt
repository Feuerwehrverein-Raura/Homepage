package ch.fwvraura.kitchendisplay.models

import com.google.gson.annotations.SerializedName
import java.text.SimpleDateFormat
import java.util.*

data class Order(
    val id: Int,
    @SerializedName("table_number")
    val tableNumber: Int,
    val status: String?,
    val total: Double?,
    @SerializedName("payment_method")
    val paymentMethod: String?,
    @SerializedName("created_at")
    val createdAt: String,
    val items: List<OrderItem>
) {
    companion object {
        private val dateFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }
    }

    fun getMinutesElapsed(): Int {
        return try {
            val orderTime = synchronized(dateFormat) {
                dateFormat.parse(createdAt.substringBefore('.'))
            }
            val now = Date()
            val diffMillis = now.time - (orderTime?.time ?: now.time)
            (diffMillis / 60000).toInt()
        } catch (e: Exception) {
            0
        }
    }

    fun isUrgent(): Boolean = getMinutesElapsed() > 10

    fun hasItemsForStation(station: String): Boolean {
        if (station == "all") return true
        return items.any { it.printerStation.equals(station, ignoreCase = true) }
    }

    fun getItemsForStation(station: String): List<OrderItem> {
        if (station == "all") return items
        return items.filter { it.printerStation.equals(station, ignoreCase = true) }
    }
}
