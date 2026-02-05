-- DEUTSCH: Initiales Datenbankschema für den Feuerwehrverein Raura
-- DEUTSCH: Wird beim ersten Start von PostgreSQL automatisch ausgeführt (docker-entrypoint-initdb.d)
-- DEUTSCH: Erstellt alle Tabellen: Mitglieder, Events, Buchhaltung, Versand, Newsletter, Audit, PDF-Templates
-- ============================================

-- DEUTSCH: UUID-Extension aktivieren — ermöglicht uuid_generate_v4() für Primärschlüssel
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- DEUTSCH: MITGLIEDER-TABELLEN — Verwaltung aller Vereinsmitglieder
-- ============================================

-- DEUTSCH: Haupttabelle für alle Mitglieder des Feuerwehrvereins
CREATE TABLE members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),   -- DEUTSCH: Eindeutige ID (UUID v4)

    -- DEUTSCH: Persönliche Daten
    anrede VARCHAR(10),
    vorname VARCHAR(100) NOT NULL,
    nachname VARCHAR(100) NOT NULL,
    geschlecht CHAR(1),
    geburtstag DATE,

    -- DEUTSCH: Adresse
    strasse VARCHAR(200),
    adresszusatz VARCHAR(100),
    plz VARCHAR(10),
    ort VARCHAR(100),

    -- DEUTSCH: Kontaktdaten
    telefon VARCHAR(50),
    mobile VARCHAR(50),
    email VARCHAR(200),
    versand_email VARCHAR(200),                          -- DEUTSCH: Alternative E-Mail für Vereinspost

    -- DEUTSCH: Mitgliedschaftsdaten
    status VARCHAR(50) DEFAULT 'Aktivmitglied',         -- DEUTSCH: Aktivmitglied, Ehrenmitglied, Passivmitglied, Ausgetreten
    funktion VARCHAR(100),
    eintrittsdatum DATE,
    austrittsdatum DATE,

    -- DEUTSCH: Finanzen
    iban VARCHAR(50),                                    -- DEUTSCH: Bankverbindung des Mitglieds (für Rückzahlungen)

    -- DEUTSCH: Zustellungsart — wie das Mitglied Vereinspost erhalten möchte
    zustellung_email BOOLEAN DEFAULT true,               -- DEUTSCH: Erhält Post per E-Mail
    zustellung_post BOOLEAN DEFAULT false,               -- DEUTSCH: Erhält Post per Brief (Pingen)

    -- DEUTSCH: Metadaten
    bemerkungen TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- DEUTSCH: Rollentabelle — definiert Berechtigungsstufen (admin, vorstand, kassier, mitglied)
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    permissions JSONB DEFAULT '[]'                       -- DEUTSCH: JSON-Array mit Berechtigungen (z.B. ["members:read", "events:*"])
);

-- DEUTSCH: Verknüpfungstabelle — ordnet Mitgliedern ihre Rollen zu (n:m Beziehung)
CREATE TABLE member_roles (
    member_id UUID REFERENCES members(id) ON DELETE CASCADE,
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (member_id, role_id)
);

-- DEUTSCH: Standard-Rollen einfügen
INSERT INTO roles (name, description, permissions) VALUES
('admin', 'Administrator', '["*"]'),
('vorstand', 'Vorstandsmitglied', '["members:read", "members:write", "events:*", "dispatch:*"]'),
('kassier', 'Kassier', '["members:read", "accounting:*"]'),
('mitglied', 'Normales Mitglied', '["members:read:self", "events:read", "events:register"]');

-- ============================================
-- DEUTSCH: EVENTS-TABELLEN — Veranstaltungen, Schichten, Anmeldungen
-- ============================================

-- DEUTSCH: Events-Tabelle — alle Veranstaltungen des Vereins (Feste, Übungen, GV etc.)
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- DEUTSCH: Basisdaten
    slug VARCHAR(100) UNIQUE NOT NULL,                   -- DEUTSCH: URL-freundlicher Name (z.B. "fasnacht-2026")
    title VARCHAR(200) NOT NULL,
    subtitle VARCHAR(300),
    description TEXT,

    -- DEUTSCH: Datum/Zeit
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP,

    -- DEUTSCH: Ort
    location VARCHAR(200),

    -- DEUTSCH: Organisation
    organizer_id UUID REFERENCES members(id),            -- DEUTSCH: Verantwortliches Mitglied
    category VARCHAR(50),                                -- DEUTSCH: Kategorie (z.B. Fest, Übung, GV)

    -- DEUTSCH: Anmeldeeinstellungen
    registration_required BOOLEAN DEFAULT false,         -- DEUTSCH: Müssen sich Teilnehmer anmelden?
    registration_deadline TIMESTAMP,
    max_participants INTEGER,
    cost VARCHAR(100),

    -- DEUTSCH: Status des Events (planned, active, cancelled, completed)
    status VARCHAR(20) DEFAULT 'planned',

    -- DEUTSCH: Metadaten
    image_url VARCHAR(500),
    tags TEXT[],                                         -- DEUTSCH: Schlagwörter als Array
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- DEUTSCH: Schichten-Tabelle — Arbeitseinsätze innerhalb eines Events (z.B. Bar, Küche, Aufbau)
CREATE TABLE shifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,  -- DEUTSCH: Gehört zu diesem Event

    name VARCHAR(200) NOT NULL,                              -- DEUTSCH: Name der Schicht (z.B. "Bar Abend")
    description TEXT,
    date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    needed INTEGER DEFAULT 2,                               -- DEUTSCH: Anzahl benötigter Helfer
    bereich VARCHAR(50) DEFAULT 'Allgemein',                 -- DEUTSCH: Arbeitsbereich (Bar, Küche, Kasse etc.)

    created_at TIMESTAMP DEFAULT NOW()
);

-- DEUTSCH: Anmeldungen — Mitglieder melden sich für Events/Schichten an
CREATE TABLE registrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    member_id UUID REFERENCES members(id) ON DELETE SET NULL,

    -- DEUTSCH: Für Nicht-Mitglieder (Gäste können sich auch anmelden)
    guest_name VARCHAR(200),
    guest_email VARCHAR(200),

    -- DEUTSCH: Gewählte Schichten (Array von Schicht-IDs)
    shift_ids UUID[],

    -- DEUTSCH: Status der Anmeldung (pending, confirmed, cancelled)
    status VARCHAR(20) DEFAULT 'pending',
    notes TEXT,

    created_at TIMESTAMP DEFAULT NOW(),
    confirmed_at TIMESTAMP
);

-- ============================================
-- DEUTSCH: BUCHHALTUNG — Kontenplan, Buchungen und Rechnungen (doppelte Buchführung)
-- ============================================

-- DEUTSCH: Kontenplan — Schweizer KMU-Kontenplan (Aktiven, Passiven, Ertrag, Aufwand)
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    number VARCHAR(20) UNIQUE NOT NULL,                   -- DEUTSCH: Kontonummer (z.B. 1000, 3000)
    name VARCHAR(200) NOT NULL,                          -- DEUTSCH: Kontobezeichnung
    type VARCHAR(20) NOT NULL,                           -- DEUTSCH: Kontotyp: asset (Aktiv), liability (Passiv), income (Ertrag), expense (Aufwand)
    parent_id UUID REFERENCES accounts(id),              -- DEUTSCH: Übergeordnetes Konto (für Hierarchie)
    description TEXT,
    is_active BOOLEAN DEFAULT true
);

-- DEUTSCH: Buchungen — jede Buchung hat ein Soll-Konto (Debit) und Haben-Konto (Credit)
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    description TEXT NOT NULL,

    -- DEUTSCH: Doppelte Buchführung: Soll (Debit) und Haben (Credit)
    debit_account_id UUID REFERENCES accounts(id),       -- DEUTSCH: Soll-Konto
    credit_account_id UUID REFERENCES accounts(id),      -- DEUTSCH: Haben-Konto
    amount DECIMAL(10,2) NOT NULL,                       -- DEUTSCH: Betrag in CHF

    -- DEUTSCH: Optionale Referenzen (welches Mitglied/Event betrifft die Buchung)
    member_id UUID REFERENCES members(id),
    event_id UUID REFERENCES events(id),
    invoice_id UUID,

    -- DEUTSCH: Metadaten
    receipt_url VARCHAR(500),                            -- DEUTSCH: Link zum Beleg/Quittung
    created_by UUID REFERENCES members(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- DEUTSCH: Rechnungen — generiert mit QR-IBAN, Format: YYYY-0001
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    number VARCHAR(50) UNIQUE NOT NULL,                  -- DEUTSCH: Rechnungsnummer (z.B. 2026-0001)

    -- DEUTSCH: Empfänger
    member_id UUID REFERENCES members(id),
    recipient_name VARCHAR(200),
    recipient_address TEXT,

    -- DEUTSCH: Beträge in CHF
    subtotal DECIMAL(10,2),
    tax DECIMAL(10,2) DEFAULT 0,                         -- DEUTSCH: MwSt (Vereine oft befreit)
    total DECIMAL(10,2) NOT NULL,

    -- DEUTSCH: Status der Rechnung (draft, issued, paid, cancelled)
    status VARCHAR(20) DEFAULT 'draft',
    issued_date DATE,
    due_date DATE,
    paid_date DATE,

    -- DEUTSCH: Rechnungsposten als JSON (Array von {description, quantity, price})
    items JSONB,
    notes TEXT,

    created_at TIMESTAMP DEFAULT NOW()
);

-- DEUTSCH: Standard-Kontenplan nach Schweizer KMU-Schema einfügen
INSERT INTO accounts (number, name, type) VALUES
('1000', 'Kasse', 'asset'),
('1020', 'Bankkonto', 'asset'),
('2000', 'Verbindlichkeiten', 'liability'),
('3000', 'Mitgliederbeiträge', 'income'),
('3100', 'Eventeinnahmen', 'income'),
('3200', 'Spenden', 'income'),
('4000', 'Materialaufwand', 'expense'),
('4100', 'Eventaufwand', 'expense'),
('4200', 'Verwaltungsaufwand', 'expense');

-- ============================================
-- DEUTSCH: VERSAND (Dispatch) — E-Mail-/Brief-Vorlagen und Versandprotokoll
-- ============================================

-- DEUTSCH: Versand-Vorlagen — vordefinierte E-Mail- und Brief-Templates mit Platzhaltern
CREATE TABLE dispatch_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL,                           -- DEUTSCH: Versandart: 'email', 'letter' (Brief), 'sms'
    subject VARCHAR(300),                                -- DEUTSCH: Betreff (mit Platzhaltern wie {{event_title}})
    body TEXT NOT NULL,                                  -- DEUTSCH: Inhalt/Body (mit Platzhaltern)
    variables TEXT[],                                    -- DEUTSCH: Verfügbare Platzhalter-Variablen
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- DEUTSCH: Versandprotokoll — protokolliert jeden versendeten Brief/E-Mail mit Status
CREATE TABLE dispatch_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- DEUTSCH: Typ des Versands (email, letter, sms)
    type VARCHAR(20) NOT NULL,
    template_id UUID REFERENCES dispatch_templates(id),

    -- DEUTSCH: Empfänger
    member_id UUID REFERENCES members(id),
    recipient_email VARCHAR(200),
    recipient_address TEXT,                               -- DEUTSCH: Postadresse (bei Briefen)

    -- DEUTSCH: Inhalt
    subject VARCHAR(300),
    body TEXT,

    -- DEUTSCH: Status des Versands (pending, sent, delivered, failed)
    status VARCHAR(20) DEFAULT 'pending',
    external_id VARCHAR(100),                            -- DEUTSCH: Externe ID (z.B. Pingen Brief-ID)
    error_message TEXT,

    -- DEUTSCH: Optionale Referenzen (welches Event/Rechnung betrifft den Versand)
    event_id UUID REFERENCES events(id),
    invoice_id UUID REFERENCES invoices(id),

    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- DEUTSCH: Standard-Versandvorlagen einfügen (Event-Einladung und Schicht-Erinnerung)
INSERT INTO dispatch_templates (name, type, subject, body, variables) VALUES
('Event Einladung', 'email', 'Einladung: {{event_title}}',
 'Liebe/r {{anrede}} {{nachname}}\n\nWir laden Sie herzlich ein zu:\n\n{{event_title}}\nDatum: {{event_date}}\nOrt: {{event_location}}\n\nMit freundlichen Grüssen\nFeuerwehrverein Raura',
 ARRAY['anrede', 'nachname', 'event_title', 'event_date', 'event_location']),

('Schicht Erinnerung', 'email', 'Erinnerung: Ihre Schicht am {{shift_date}}',
 'Liebe/r {{anrede}} {{nachname}}\n\nDies ist eine Erinnerung an Ihre Schicht:\n\n{{shift_name}}\nDatum: {{shift_date}}\nZeit: {{shift_time}}\n\nBitte seien Sie pünktlich.\n\nMit freundlichen Grüssen\nFeuerwehrverein Raura',
 ARRAY['anrede', 'nachname', 'shift_name', 'shift_date', 'shift_time']);

-- ============================================
-- DEUTSCH: NEWSLETTER — Abonnenten mit Double-Opt-In Bestätigung
-- ============================================

-- DEUTSCH: Newsletter-Abonnenten — unabhängig von Mitgliedschaft (auch Externe)
CREATE TABLE newsletter_subscribers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(200) UNIQUE NOT NULL,
    token VARCHAR(100) UNIQUE NOT NULL,                  -- DEUTSCH: Bestätigungstoken für Double-Opt-In
    confirmed BOOLEAN DEFAULT false,                     -- DEUTSCH: true = E-Mail bestätigt
    confirmed_at TIMESTAMP,
    unsubscribed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- DEUTSCH: Indizes für schnelle Suche nach E-Mail und Token
CREATE INDEX idx_newsletter_email ON newsletter_subscribers(email);
CREATE INDEX idx_newsletter_token ON newsletter_subscribers(token);

-- ============================================
-- DEUTSCH: MITGLIEDER-ANTRÄGE — Neue Mitgliedschaftsanfragen (pending → approved/rejected)
-- ============================================

-- DEUTSCH: Offene Mitglieder-Anträge — Interessenten melden sich über die Website an
CREATE TABLE member_registrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Persönliche Daten
    vorname VARCHAR(100) NOT NULL,
    nachname VARCHAR(100) NOT NULL,
    strasse VARCHAR(200),
    plz VARCHAR(10),
    ort VARCHAR(100),
    telefon VARCHAR(50),
    mobile VARCHAR(50),
    email VARCHAR(200) NOT NULL,

    -- DEUTSCH: Bisheriger Feuerwehr-Status des Antragstellers
    feuerwehr_status VARCHAR(50),                        -- DEUTSCH: 'active' (aktiv), 'former' (ehemalig), 'no' (nie)

    -- DEUTSCH: Gewünschte Korrespondenzart
    korrespondenz_methode VARCHAR(50),                   -- DEUTSCH: 'email' oder 'post'
    korrespondenz_adresse TEXT,

    -- DEUTSCH: Bearbeitungsstatus (pending → approved/rejected durch Vorstand)
    status VARCHAR(20) DEFAULT 'pending',                -- DEUTSCH: pending, approved, rejected
    processed_by VARCHAR(200),                           -- DEUTSCH: E-Mail des Vorstandsmitglieds das entschieden hat
    processed_at TIMESTAMP,
    rejection_reason TEXT,

    -- DEUTSCH: Referenz zum erstellten Mitglied (wird gesetzt wenn Antrag genehmigt wird)
    member_id UUID REFERENCES members(id),

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_registrations_status ON member_registrations(status);
CREATE INDEX idx_registrations_email ON member_registrations(email);

-- ============================================
-- DEUTSCH: AUDIT-LOG — Protokolliert alle wichtigen Aktionen (Änderungen, Logins, Löschungen)
-- ============================================

-- DEUTSCH: Audit-Tabelle — wer hat wann was geändert (für Nachvollziehbarkeit)
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- DEUTSCH: Was wurde gemacht (CREATE, UPDATE, DELETE, LOGIN etc.)
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,                    -- DEUTSCH: Betroffener Typ (member, event, invoice etc.)
    entity_id UUID,

    -- DEUTSCH: Vorher/Nachher-Werte für Nachvollziehbarkeit
    old_values JSONB,                                    -- DEUTSCH: Alte Werte (vor Änderung)
    new_values JSONB,                                    -- DEUTSCH: Neue Werte (nach Änderung)

    -- DEUTSCH: Wer hat die Aktion ausgeführt
    user_id UUID REFERENCES members(id),
    ip_address VARCHAR(50),

    created_at TIMESTAMP DEFAULT NOW()
);

-- DEUTSCH: Indizes für schnelle Suche im Audit-Log und häufige Abfragen
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_members_status ON members(status);       -- DEUTSCH: Mitglieder nach Status filtern
CREATE INDEX idx_events_date ON events(start_date);       -- DEUTSCH: Events nach Datum sortieren
CREATE INDEX idx_transactions_date ON transactions(date); -- DEUTSCH: Buchungen nach Datum sortieren

-- ============================================
-- DEUTSCH: PDF-TEMPLATES — Vorlagen für PDF-Generierung mit pdfme-Library
-- ============================================

-- DEUTSCH: PDF-Vorlagen — z.B. für Rechnungen, Arbeitspläne, Mitgliederlisten
CREATE TABLE pdf_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- DEUTSCH: Identifikation
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,                   -- DEUTSCH: URL-freundlicher Name
    description TEXT,
    category VARCHAR(50),                                -- DEUTSCH: Kategorie: 'rechnung', 'arbeitsplan', 'mitgliederliste', 'brief'

    -- DEUTSCH: pdfme Template-Schema als JSON (definiert Layout, Felder, Positionen)
    template_schema JSONB NOT NULL,

    -- DEUTSCH: Basis-PDF als Base64 (optionaler Hintergrund, z.B. Briefpapier)
    base_pdf TEXT,

    -- DEUTSCH: Verfügbare Platzhalter-Variablen (z.B. {{name}}, {{betrag}})
    variables TEXT[],

    -- DEUTSCH: Status
    is_default BOOLEAN DEFAULT false,                    -- DEUTSCH: Standard-Template für diese Kategorie
    is_active BOOLEAN DEFAULT true,

    -- Meta
    created_by UUID REFERENCES members(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_pdf_templates_slug ON pdf_templates(slug);
CREATE INDEX idx_pdf_templates_category ON pdf_templates(category);

-- ============================================
-- DEUTSCH: VEREINS-EINSTELLUNGEN — Konfigurierbare Werte (Name, IBAN, Farben etc.)
-- ============================================

-- DEUTSCH: Key-Value-Speicher für Vereinseinstellungen (werden im Frontend/Backend verwendet)
CREATE TABLE organisation_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(100) UNIQUE NOT NULL,                    -- DEUTSCH: Einstellungsname (z.B. 'org_name', 'bank_iban')
    value TEXT,                                          -- DEUTSCH: Wert als Text
    value_json JSONB,                                    -- DEUTSCH: Wert als JSON (für komplexe Einstellungen)
    description TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- DEUTSCH: Standard-Vereinseinstellungen einfügen
INSERT INTO organisation_settings (key, value, description) VALUES
('org_name', 'Feuerwehrverein Raura', 'Name der Organisation'),
('org_address', 'Ruswil', 'Adresse'),
('org_plz', '6017', 'PLZ'),
('org_ort', 'Ruswil', 'Ort'),
('org_email', 'info@fwv-raura.ch', 'E-Mail'),
('org_website', 'www.fwv-raura.ch', 'Website'),
('org_phone', '', 'Telefon'),
('bank_name', 'Raiffeisenbank', 'Bank Name'),
('bank_iban', 'CH93 0076 2011 6238 5295 7', 'IBAN'),
('bank_qr_iban', '', 'QR-IBAN für QR-Rechnungen'),
('primary_color', '#dc2626', 'Primärfarbe (Hex)'),
('secondary_color', '#1f2937', 'Sekundärfarbe (Hex)');
