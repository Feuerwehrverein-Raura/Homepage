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
    val printerStation: String = "bar",
    var completed: Boolean = false,
    @SerializedName("completed_at")
    val completedAt: String? = null
) {
    val isBar: Boolean get() = printerStation.equals("bar", ignoreCase = true)
    val isKitchen: Boolean get() = printerStation.equals("kitchen", ignoreCase = true)

    fun hasAllergyWarning(): Boolean {
        val notesLower = notes?.lowercase() ?: return false
        return notesLower.contains("allergi") ||
               notesLower.contains("laktose") ||
               notesLower.contains("gluten") ||
               notesLower.contains("nuss") ||
               notesLower.contains("vegan")
    }
}
