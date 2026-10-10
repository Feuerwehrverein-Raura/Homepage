import XCTest
@testable import FWVMembers

/// Prueft, dass die App den Arbeitsplan-Vertrag des Backends versteht.
///
/// Die Fixture ist docker/backend-events/test/fixtures/arbeitsplan.json —
/// dieselbe Datei, gegen die auch der Backend-Test laeuft.
final class ArbeitsplanContractTests: XCTestCase {
    private var plan: Arbeitsplan!

    override func setUpWithError() throws {
        let url = try XCTUnwrap(
            Bundle(for: Self.self).url(forResource: "arbeitsplan", withExtension: "json"),
            "Fixture arbeitsplan.json fehlt im Test-Bundle"
        )
        let data = try Data(contentsOf: url)
        // Derselbe Decoder wie im APIClient.
        plan = try APIClient.makeDecoder().decode(Arbeitsplan.self, from: data)
    }

    func testKopf() {
        XCTAssertEqual(plan.verein, "Feuerwehrverein Raura, Kaiseraugst")
        XCTAssertEqual(plan.titel, "Arbeitsplan Chilbi")
        XCTAssertEqual(plan.anlass, "Chilbi")
    }

    func testBereicheInReihenfolge() {
        XCTAssertEqual(plan.bereiche, ["Allgemein", "Bar", "Grill"])
    }

    func testTage() throws {
        XCTAssertEqual(plan.tage.count, 2)
        XCTAssertEqual(plan.tage.map(\.datum), ["2026-10-17", "2026-10-18"])
        XCTAssertEqual(plan.tage.map(\.bezeichnung),
                       ["Samstag, 17.10.2026", "Sonntag, 18.10.2026"])
        XCTAssertEqual(plan.tage.map { $0.zeilen.count }, [2, 1])
        XCTAssertEqual(plan.tage[0].zeilen.map(\.zeit), ["10:00-14:00", "18:00-22:00"])
        XCTAssertEqual(plan.tage[1].zeilen.map(\.zeit), ["10:00-14:00"])
    }

    func testZellenLaufenParallelZuBereichen() {
        for tag in plan.tage {
            for zeile in tag.zeilen {
                XCTAssertEqual(zeile.zellen.count, plan.bereiche.count)
            }
        }
    }

    func testNullZellenBleibenNil() {
        let sa = plan.tage[0].zeilen
        XCTAssertNil(sa[0].zellen[0])
        XCTAssertNil(sa[0].zellen[1])
        XCTAssertNotNil(sa[0].zellen[2])
        XCTAssertNil(sa[1].zellen[0])
        XCTAssertNotNil(sa[1].zellen[1])
        XCTAssertNil(sa[1].zellen[2])
        let so = plan.tage[1].zeilen
        XCTAssertNotNil(so[0].zellen[0])
        XCTAssertNil(so[0].zellen[1])
        XCTAssertNil(so[0].zellen[2])
    }

    func testLeereSchicht() throws {
        let zelle = try XCTUnwrap(plan.tage[0].zeilen[0].zellen[2])
        XCTAssertEqual(zelle.besetzt, [])
        XCTAssertEqual(zelle.gebraucht, 1)
        XCTAssertEqual(zelle.offen, 1)
    }

    func testTeilweiseBesetzt() throws {
        let zelle = try XCTUnwrap(plan.tage[0].zeilen[1].zellen[1])
        XCTAssertEqual(zelle.besetzt, ["Anna A"])
        XCTAssertEqual(zelle.gebraucht, 2)
        XCTAssertEqual(zelle.offen, 1)
    }

    func testUeberbucht() throws {
        let zelle = try XCTUnwrap(plan.tage[1].zeilen[0].zellen[0])
        XCTAssertEqual(zelle.besetzt, ["Bea B", "Cem C"])
        XCTAssertEqual(zelle.gebraucht, 1)
        XCTAssertEqual(zelle.offen, 0)
    }

    // MARK: - Was die Tabelle zeichnet

    func testZelleAtIndex() {
        let zeile = plan.tage[0].zeilen[1]
        XCTAssertNil(zeile.zelle(at: 0))
        XCTAssertNotNil(zeile.zelle(at: 1))
        XCTAssertNil(zeile.zelle(at: 2))
        // Fehlende Eintraege gelten als "keine Schicht".
        XCTAssertNil(zeile.zelle(at: 3))
        XCTAssertNil(zeile.zelle(at: -1))
    }

    func testLinien() {
        XCTAssertEqual(plan.tage[0].zeilen[0].zelle(at: 2)?.linien, [.offen])
        XCTAssertEqual(plan.tage[0].zeilen[1].zelle(at: 1)?.linien,
                       [.name("Anna A"), .offen])
        // Ueberbucht: alle Namen, kein Strich.
        XCTAssertEqual(plan.tage[1].zeilen[0].zelle(at: 0)?.linien,
                       [.name("Bea B"), .name("Cem C")])
    }

    func testLinienOhneAngaben() throws {
        let leer = try APIClient.makeDecoder()
            .decode(Arbeitsplan.Zelle.self, from: Data("{}".utf8))
        XCTAssertEqual(leer.linien, [])
        let negativ = try APIClient.makeDecoder()
            .decode(Arbeitsplan.Zelle.self, from: Data(#"{"offen": -2}"#.utf8))
        XCTAssertEqual(negativ.linien, [])
    }
}
