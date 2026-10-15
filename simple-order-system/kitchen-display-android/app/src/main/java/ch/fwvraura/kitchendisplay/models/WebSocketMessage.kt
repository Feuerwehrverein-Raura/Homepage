package ch.fwvraura.kitchendisplay.models

import com.google.gson.annotations.SerializedName

/**
 * Nachrichten des order-backends ueber /ws:
 * new_order, order_completed, order_updated, items_completed, print_failed.
 */
data class WebSocketMessage(
    val type: String?,
    val order: Order?,
    @SerializedName("order_id")
    val orderId: Int?,
    val status: String?,
    @SerializedName("payment_method")
    val paymentMethod: String?,
    @SerializedName("item_ids")
    val itemIds: List<Int>?
)
