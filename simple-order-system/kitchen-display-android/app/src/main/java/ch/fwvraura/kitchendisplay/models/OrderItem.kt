package ch.fwvraura.kitchendisplay.models

import com.google.gson.annotations.SerializedName

data class OrderItem(
    val id: Int,
    @SerializedName("item_name")
    val itemName: String,
    val quantity: Int,
    val price: Double,
    val notes: String?,
    @SerializedName("printer_station")
    val printerStation: String,
    var completed: Boolean = false,
    @SerializedName("completed_at")
    val completedAt: String? = null
) {
    val isBar: Boolean get() = printerStation == "bar"
    val isKitchen: Boolean get() = printerStation == "kitchen"

    fun hasAllergyWarning(): Boolean {
        val notesLower = notes?.lowercase() ?: return false
        return notesLower.contains("allergi") ||
               notesLower.contains("laktose") ||
               notesLower.contains("gluten") ||
               notesLower.contains("nuss") ||
               notesLower.contains("vegan")
    }
}
