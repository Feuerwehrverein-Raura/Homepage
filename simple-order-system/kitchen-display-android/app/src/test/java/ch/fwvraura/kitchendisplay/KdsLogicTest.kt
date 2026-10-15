package ch.fwvraura.kitchendisplay

import ch.fwvraura.kitchendisplay.models.Order
import ch.fwvraura.kitchendisplay.models.WebSocketMessage
import com.google.gson.Gson
import org.junit.Assert.*
import org.junit.Test

class KdsLogicTest {

    // {"id": "pos-shared", "exp": 2000000000}
    private val token = "eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ICJwb3Mtc2hhcmVkIiwgImV4cCI6IDIwMDAwMDAwMDB9.sig"
    private val expMs = 2_000_000_000_000L
    private val day = 24L * 60 * 60 * 1000

    @Test
    fun liestAblaufAusDemToken() {
        assertEquals(expMs, TokenManager.expiryMillis(token))
        assertNull(TokenManager.expiryMillis("kein.jwt"))
        assertNull(TokenManager.expiryMillis("x"))
    }

    @Test
    fun gueltigBisZumAblauf() {
        assertTrue(TokenManager.isValid(token, expMs - 1))
        assertFalse(TokenManager.isValid(token, expMs + 1))
        assertFalse(TokenManager.isValid(null))
        assertFalse(TokenManager.isValid(""))
    }

    @Test
    fun erneuernNachEinemTag() {
        // frisch (30 Tage Rest): nicht erneuern
        assertFalse(TokenManager.needsRefresh(token, expMs - 30 * day))
        // einen Tag alt (29 Tage Rest minus etwas): erneuern
        assertTrue(TokenManager.needsRefresh(token, expMs - 29 * day + 1000))
        assertTrue(TokenManager.needsRefresh(token, expMs - day))
    }

    @Test
    fun base64urlOhnePadding() {
        assertEquals("ab?", String(TokenManager.decodeBase64Url("YWI_")))
        assertEquals("a", String(TokenManager.decodeBase64Url("YQ")))
    }

    @Test
    fun restversucheAusServertext() {
        assertEquals(2, AuthService.remainingAttempts("Falsches Passwort. Noch 2 Versuche übrig."))
        assertEquals(1, AuthService.remainingAttempts("Falsches Passwort. Noch 1 Versuche übrig."))
        assertNull(AuthService.remainingAttempts("IP für 24 Stunden gesperrt nach zu vielen fehlgeschlagenen Versuchen."))
        assertNull(AuthService.remainingAttempts(null))
    }

    @Test
    fun versionsvergleich() {
        assertTrue(UpdateChecker.isNewerVersion("3.0", "2.6.1"))
        assertTrue(UpdateChecker.isNewerVersion("2.6.1", "2.6"))
        assertFalse(UpdateChecker.isNewerVersion("2.6", "2.6.0"))
        assertFalse(UpdateChecker.isNewerVersion("2.10", "10.0"))
        assertTrue(UpdateChecker.isNewerVersion("2.10", "2.9"))
    }

    @Test
    fun tagsNachVersionSortiert() {
        val refs = listOf(
            "refs/tags/kds-v0.5", "refs/tags/kds-v2.6", "refs/tags/kds-v2.10",
            "refs/tags/kds-v3.0", "refs/tags/kds-v2.6.1", "refs/tags/members-v1.0"
        )
        assertEquals(
            listOf("kds-v3.0", "kds-v2.10", "kds-v2.6.1", "kds-v2.6", "kds-v0.5"),
            UpdateChecker.sortTags(refs)
        )
    }

    @Test
    fun bestellungWieSieDerServerHeuteLiefert() {
        // Auszug aus GET /api/orders (order-backend): Zahlen als Strings (numeric),
        // neue Felder event_id/event_titel/paid_amount, items null ohne Positionen.
        val json = """[
          {"id": 7, "table_number": 4, "status": "pending", "total": "12.50",
           "payment_method": null, "created_at": "2026-10-15T16:00:00.000Z",
           "event_id": "00000000-0000-0000-0000-e00000000001", "event_titel": "Chilbi",
           "paid_amount": "0",
           "items": [
             {"id": 1, "item_name": "Bratwurst", "quantity": 2, "price": "6.25", "notes": null,
              "printer_station": "kitchen", "paid": false, "paid_at": null, "completed": false, "completed_at": null},
             {"id": 2, "item_name": "Bier", "quantity": 1, "price": "5.00", "notes": "",
              "printer_station": "bar", "paid": false, "paid_at": null, "completed": true, "completed_at": "2026-10-15T16:01:00.000Z"}
           ]},
          {"id": 8, "table_number": 0, "status": "paid", "total": "0", "created_at": null, "items": null}
        ]"""
        val orders = Gson().fromJson(json, Array<Order>::class.java).toList()
        assertEquals(2, orders.size)
        val o = orders[0]
        assertEquals(12.5, o.total!!, 0.001)
        assertTrue(o.hasItemsForStation("kitchen"))
        assertFalse(o.hasItemsForStation("bar")) // Bier schon erledigt
        assertEquals(1, o.getItemsForStation("bar").size)
        assertTrue(orders[1].items.isEmpty())
        assertFalse(orders[1].hasItemsForStation("all"))
        assertEquals(0, orders[1].getMinutesElapsed())
    }

    @Test
    fun itemsCompletedMitOrderIdAlsText() {
        // Der Server schickt order_id hier als Text (aus der URL)
        val msg = Gson().fromJson(
            """{"type":"items_completed","order_id":"7","item_ids":[1,2]}""",
            WebSocketMessage::class.java
        )
        assertEquals(7, msg.orderId)
        assertEquals(listOf(1, 2), msg.itemIds)
    }
}
