package ch.fwvraura.vorstand.data.model

import com.google.gson.Gson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.BeforeClass
import org.junit.Test
import java.io.File

/**
 * Vertragstest: liest die gemeinsame Fixture des Backends
 * (docker/backend-events/test/fixtures/arbeitsplan.json) und prueft, dass
 * die App sie mit derselben Gson-Konfiguration wie Retrofit (ApiModule)
 * versteht und die Felder richtig zeichnet. Aendert das Backend das Format,
 * wird dieser Test rot.
 */
class ArbeitsplanContractTest {

    companion object {
        /** Wie in ApiModule: Gson() */
        private val gson: Gson = Gson()

        private lateinit var plan: Arbeitsplan

        /** Sucht die Fixture, indem vom Arbeitsverzeichnis aufwaerts gegangen wird. */
        private fun findFixture(): File {
            val rel = "docker/backend-events/test/fixtures/arbeitsplan.json"
            var dir: File? = File("").absoluteFile
            while (dir != null) {
                val f = File(dir, rel)
                if (f.isFile) return f
                dir = dir.parentFile
            }
            throw IllegalStateException("Fixture $rel nicht gefunden (ab ${File("").absolutePath})")
        }

        @BeforeClass
        @JvmStatic
        fun load() {
            plan = gson.fromJson(findFixture().readText(Charsets.UTF_8), Arbeitsplan::class.java)
        }
    }

    @Test
    fun kopf() {
        assertEquals("Feuerwehrverein Raura, Kaiseraugst", plan.verein)
        assertEquals("Arbeitsplan Chilbi", plan.titel)
        assertEquals("Chilbi", plan.anlass)
    }

    @Test
    fun bereicheInReihenfolge() {
        assertEquals(listOf("Allgemein", "Bar", "Grill"), plan.bereiche)
    }

    @Test
    fun tageUndZeilen() {
        val tage = plan.tage!!
        assertEquals(2, tage.size)
        assertEquals("2026-10-17", tage[0].datum)
        assertEquals("Samstag, 17.10.2026", tage[0].bezeichnung)
        assertEquals("Sonntag, 18.10.2026", tage[1].bezeichnung)
        assertEquals(2, tage[0].zeilen!!.size)
        assertEquals(1, tage[1].zeilen!!.size)
        assertEquals(listOf("10:00-14:00", "18:00-22:00"), tage[0].zeilen!!.map { it.zeit })
        // Jede Zeile hat genau ein Feld pro Bereich
        tage.flatMap { it.zeilen!! }.forEach { assertEquals(plan.bereiche!!.size, it.zellen!!.size) }
    }

    @Test
    fun leereFelderBleibenNull() {
        val sa = plan.tage!![0].zeilen!!
        val so = plan.tage!![1].zeilen!!
        assertNull(sa[0].zellen!![0])
        assertNull(sa[0].zellen!![1])
        assertNull(sa[1].zellen!![0])
        assertNull(sa[1].zellen!![2])
        assertNull(so[0].zellen!![1])
        assertNull(so[0].zellen!![2])
    }

    @Test
    fun besetztUndOffen() {
        val leer = plan.tage!![0].zeilen!![0].zellen!![2]
        assertNotNull(leer)
        assertEquals(emptyList<String>(), leer!!.besetzt)
        assertEquals(1, leer.gebraucht)
        assertEquals(1, leer.offen)

        val bar = plan.tage!![0].zeilen!![1].zellen!![1]!!
        assertEquals(listOf("Anna A"), bar.besetzt)
        assertEquals(2, bar.gebraucht)
        assertEquals(1, bar.offen)

        // Ueberbucht: mehr Helfer als gebraucht, offen 0
        val allgemein = plan.tage!![1].zeilen!![0].zellen!![0]!!
        assertEquals(listOf("Bea B", "Cem C"), allgemein.besetzt)
        assertEquals(1, allgemein.gebraucht)
        assertEquals(0, allgemein.offen)
    }

    @Test
    fun kartenNurMitSchicht() {
        val bereiche = plan.bereiche!!
        val sa = plan.tage!![0].zeilen!!
        val so = plan.tage!![1].zeilen!!

        assertEquals("10:00\u201314:00 Uhr", sa[0].zeitText())
        assertEquals(listOf(KartenEintrag("Grill", "", 1)), sa[0].karte(bereiche))

        assertEquals("18:00\u201322:00 Uhr", sa[1].zeitText())
        assertEquals(listOf(KartenEintrag("Bar", "Anna A", 1)), sa[1].karte(bereiche))

        // Ueberbucht: offen 0 -> kein "frei"
        val allgemein = so[0].karte(bereiche)
        assertEquals(listOf(KartenEintrag("Allgemein", "Bea B, Cem C", 0)), allgemein)
        assertNull(allgemein[0].freiText())
    }

    @Test
    fun freiText() {
        assertEquals("1 Platz frei", KartenEintrag("Bar", "", 1).freiText())
        assertEquals("3 Pl\u00e4tze frei", KartenEintrag("Bar", "", 3).freiText())
        assertNull(KartenEintrag("Bar", "", 0).freiText())
    }

    @Test
    fun karteOhneFelder() {
        assertEquals(emptyList<KartenEintrag>(), ArbeitsplanZeile().karte(listOf("Bar")))
        assertEquals(emptyList<KartenEintrag>(), ArbeitsplanZeile(zellen = listOf(null, null)).karte(listOf("Bar", "Grill")))
        assertEquals(0, ArbeitsplanZeile(zellen = listOf(ArbeitsplanZelle(offen = -1))).karte(listOf("Bar"))[0].offen)
    }

    @Test
    fun kuecheLesbar() {
        assertEquals("K\u00fcche", bereichAnzeige("Kueche"))
        assertEquals("K\u00fcche", bereichAnzeige("K\u00fcche"))
        assertEquals("Bar", bereichAnzeige("Bar"))
    }
}
