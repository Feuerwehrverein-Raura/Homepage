-- FWV Raura Database Schema
-- ============================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- MEMBERS SCHEMA
-- ============================================

CREATE TABLE members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Persönliche Daten
    anrede VARCHAR(10),
    vorname VARCHAR(100) NOT NULL,
    nachname VARCHAR(100) NOT NULL,
    geschlecht CHAR(1),
    geburtstag DATE,

    -- Adresse
    strasse VARCHAR(200),
    adresszusatz VARCHAR(100),
    plz VARCHAR(10),
    ort VARCHAR(100),

    -- Kontakt
    telefon VARCHAR(50),
    mobile VARCHAR(50),
    email VARCHAR(200),
    versand_email VARCHAR(200),

    -- Mitgliedschaft
    status VARCHAR(50) DEFAULT 'Aktivmitglied',
    funktion VARCHAR(100),
    eintrittsdatum DATE,
    austrittsdatum DATE,

    -- Finanzen
    iban VARCHAR(50),

    -- Zustellung
    zustellung_email BOOLEAN DEFAULT true,
    zustellung_post BOOLEAN DEFAULT false,

    -- Meta
    bemerkungen TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    permissions JSONB DEFAULT '[]'
);

CREATE TABLE member_roles (
    member_id UUID REFERENCES members(id) ON DELETE CASCADE,
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (member_id, role_id)
);

-- Default Roles
INSERT INTO roles (name, description, permissions) VALUES
('admin', 'Administrator', '["*"]'),
('vorstand', 'Vorstandsmitglied', '["members:read", "members:write", "events:*", "dispatch:*"]'),
('kassier', 'Kassier', '["members:read", "accounting:*"]'),
('mitglied', 'Normales Mitglied', '["members:read:self", "events:read", "events:register"]');

-- ============================================
-- EVENTS SCHEMA
-- ============================================

CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Basis
    slug VARCHAR(100) UNIQUE NOT NULL,
    title VARCHAR(200) NOT NULL,
    subtitle VARCHAR(300),
    description TEXT,

    -- Datum/Zeit
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP,

    -- Ort
    location VARCHAR(200),

    -- Organisation
    organizer_id UUID REFERENCES members(id),
    category VARCHAR(50),

    -- Einstellungen
    registration_required BOOLEAN DEFAULT false,
    registration_deadline TIMESTAMP,
    max_participants INTEGER,
    cost VARCHAR(100),

    -- Status
    status VARCHAR(20) DEFAULT 'planned',

    -- Meta
    image_url VARCHAR(500),
    tags TEXT[],
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE shifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,

    name VARCHAR(200) NOT NULL,
    description TEXT,
    date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    needed INTEGER DEFAULT 2,

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE registrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    member_id UUID REFERENCES members(id) ON DELETE SET NULL,

    -- Für Nicht-Mitglieder
    guest_name VARCHAR(200),
    guest_email VARCHAR(200),

    -- Schichten
    shift_ids UUID[],

    -- Status
    status VARCHAR(20) DEFAULT 'pending',
    notes TEXT,

    created_at TIMESTAMP DEFAULT NOW(),
    confirmed_at TIMESTAMP
);

-- ============================================
-- ACCOUNTING SCHEMA
-- ============================================

CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    number VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    type VARCHAR(20) NOT NULL, -- 'asset', 'liability', 'income', 'expense'
    parent_id UUID REFERENCES accounts(id),
    description TEXT,
    is_active BOOLEAN DEFAULT true
);

CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    description TEXT NOT NULL,

    -- Buchung
    debit_account_id UUID REFERENCES accounts(id),
    credit_account_id UUID REFERENCES accounts(id),
    amount DECIMAL(10,2) NOT NULL,

    -- Referenz
    member_id UUID REFERENCES members(id),
    event_id UUID REFERENCES events(id),
    invoice_id UUID,

    -- Meta
    receipt_url VARCHAR(500),
    created_by UUID REFERENCES members(id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    number VARCHAR(50) UNIQUE NOT NULL,

    -- Empfänger
    member_id UUID REFERENCES members(id),
    recipient_name VARCHAR(200),
    recipient_address TEXT,

    -- Beträge
    subtotal DECIMAL(10,2),
    tax DECIMAL(10,2) DEFAULT 0,
    total DECIMAL(10,2) NOT NULL,

    -- Status
    status VARCHAR(20) DEFAULT 'draft',
    issued_date DATE,
    due_date DATE,
    paid_date DATE,

    -- Details
    items JSONB,
    notes TEXT,

    created_at TIMESTAMP DEFAULT NOW()
);

-- Default Kontenplan (Schweizer KMU)
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
-- DISPATCH SCHEMA
-- ============================================

CREATE TABLE dispatch_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL, -- 'email', 'letter', 'sms'
    subject VARCHAR(300),
    body TEXT NOT NULL,
    variables TEXT[],
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE dispatch_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Typ
    type VARCHAR(20) NOT NULL,
    template_id UUID REFERENCES dispatch_templates(id),

    -- Empfänger
    member_id UUID REFERENCES members(id),
    recipient_email VARCHAR(200),
    recipient_address TEXT,

    -- Inhalt
    subject VARCHAR(300),
    body TEXT,

    -- Status
    status VARCHAR(20) DEFAULT 'pending',
    external_id VARCHAR(100), -- Pingen ID, etc.
    error_message TEXT,

    -- Referenz
    event_id UUID REFERENCES events(id),
    invoice_id UUID REFERENCES invoices(id),

    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Default Templates
INSERT INTO dispatch_templates (name, type, subject, body, variables) VALUES
('Event Einladung', 'email', 'Einladung: {{event_title}}',
 'Liebe/r {{anrede}} {{nachname}}\n\nWir laden Sie herzlich ein zu:\n\n{{event_title}}\nDatum: {{event_date}}\nOrt: {{event_location}}\n\nMit freundlichen Grüssen\nFeuerwehrverein Raura',
 ARRAY['anrede', 'nachname', 'event_title', 'event_date', 'event_location']),

('Schicht Erinnerung', 'email', 'Erinnerung: Ihre Schicht am {{shift_date}}',
 'Liebe/r {{anrede}} {{nachname}}\n\nDies ist eine Erinnerung an Ihre Schicht:\n\n{{shift_name}}\nDatum: {{shift_date}}\nZeit: {{shift_time}}\n\nBitte seien Sie pünktlich.\n\nMit freundlichen Grüssen\nFeuerwehrverein Raura',
 ARRAY['anrede', 'nachname', 'shift_name', 'shift_date', 'shift_time']);

-- ============================================
-- NEWSLETTER SCHEMA
-- ============================================

CREATE TABLE newsletter_subscribers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(200) UNIQUE NOT NULL,
    token VARCHAR(100) UNIQUE NOT NULL,
    confirmed BOOLEAN DEFAULT false,
    confirmed_at TIMESTAMP,
    unsubscribed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_newsletter_email ON newsletter_subscribers(email);
CREATE INDEX idx_newsletter_token ON newsletter_subscribers(token);

-- ============================================
-- AUDIT LOG
-- ============================================

CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Aktion
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,

    -- Änderungen
    old_values JSONB,
    new_values JSONB,

    -- Benutzer
    user_id UUID REFERENCES members(id),
    ip_address VARCHAR(50),

    created_at TIMESTAMP DEFAULT NOW()
);

-- Index für schnelle Suche
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_members_status ON members(status);
CREATE INDEX idx_events_date ON events(start_date);
CREATE INDEX idx_transactions_date ON transactions(date);
