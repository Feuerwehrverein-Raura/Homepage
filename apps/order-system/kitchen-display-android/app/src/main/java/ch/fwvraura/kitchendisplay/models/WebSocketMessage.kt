package ch.fwvraura.kitchendisplay.models

import com.google.gson.annotations.SerializedName

data class WebSocketMessage(
    val type: String,
    val order: Order?,
    @SerializedName("order_id")
    val orderId: Int?,
    val status: String?,
    @SerializedName("payment_method")
    val paymentMethod: String?
)
