-- TWINT-QR pro Anlass fuer die Kasse (Oktober 2026)
--
-- Die Kasse (order.fwv-raura.ch) holt sich den QR-Code des Anlasses, der
-- gerade laeuft (api-events GET /events/kasse/aktuell). Hat ein Anlass
-- keinen eigenen, gilt der Vereins-Standard (twint-qr.png der Kasse).
--
-- Das Bild liegt als Base64 in der Datenbank (wie pdf_attachment), aber in
-- einer eigenen Tabelle, damit "SELECT e.*" kein Bild mitschleppt.
-- events.twint_qr_url zeigt auf den Abruf /events/<id>/twint-qr?v=<Zeit>.
--
-- api-events legt beides beim Start ebenfalls an (src/kasse-anlass.js,
-- SCHEMA_SQL) - beide mit IF NOT EXISTS, gleich gehalten.

ALTER TABLE events ADD COLUMN IF NOT EXISTS twint_qr_url TEXT;

CREATE TABLE IF NOT EXISTS event_twint_qr (
    event_id UUID PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
    content_type VARCHAR(40) NOT NULL,
    data TEXT NOT NULL,
    groesse INTEGER,
    hochgeladen_von VARCHAR(200),
    hochgeladen_am TIMESTAMP NOT NULL DEFAULT NOW()
);
