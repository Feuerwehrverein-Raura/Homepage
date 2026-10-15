-- Geraete der Mitglieder-App (Oktober 2026): welches Mitglied hat welche
-- App-Version auf welchem Geraet?
--
-- Die App meldet sich bei jedem Start (POST /members/me/geraet) und beim
-- Anmelden des Push-Tokens. geraet_id ist eine Zufallskennung, die die App
-- selbst erzeugt (dieselbe wie fcm_tokens.device_id) - keine Hardware-ID.
-- Keine IP, kein Standort.
--
-- api-members legt die Tabelle beim Start ebenfalls an (src/app-geraete.js,
-- SCHEMA_SQL) - beide mit IF NOT EXISTS, gleich gehalten.

CREATE TABLE IF NOT EXISTS app_geraete (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    geraet_id TEXT NOT NULL,
    plattform VARCHAR(20) NOT NULL,
    quelle VARCHAR(20) NOT NULL DEFAULT 'unbekannt',
    app_version VARCHAR(40),
    build_nummer INTEGER,
    os_version VARCHAR(100),
    geraet_modell VARCHAR(100),
    erstmals TIMESTAMP NOT NULL DEFAULT NOW(),
    zuletzt TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (member_id, geraet_id)
);

CREATE INDEX IF NOT EXISTS idx_app_geraete_member ON app_geraete(member_id);
