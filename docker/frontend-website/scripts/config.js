/**
 * DEUTSCH: Zentrale Konfiguration für den Feuerwehrverein Raura Kaiseraugst
 *
 * DEUTSCH: Enthält alle Vereinsdaten: Vorstandskontakte, E-Mail-Adressen, Systemeinstellungen.
 * DEUTSCH: Wird sowohl im Browser (Frontend) als auch in Node.js (Scripts) verwendet.
 * DEUTSCH: Vorstandsdaten werden dynamisch aus Markdown-Dateien (vorstand/*.md) geladen.
 */

const FWV_CONFIG = {
    // DEUTSCH: === VEREINSINFOS — Name und Website ===
    verein: {
        name: "Feuerwehrverein Raura",
        ort: "Kaiseraugst",
        vollname: "Feuerwehrverein Raura Kaiseraugst",
        website: "https://feuerwehrverien-raura.github.io/Homepage/"
    },

    // DEUTSCH: === VORSTANDSKONTAKTE ===
    // DEUTSCH: Werden dynamisch aus vorstand/*.md Dateien geladen (siehe loadFromVorstandFiles)
    // DEUTSCH: Die Werte hier sind Fallbacks falls die Dateien nicht geladen werden können
    kontakte: {
        praesident: {
            name: "René Käslin",
            email: "praesident@fwv-raura.ch",
            phone: "+41 61 813 03 16",
            position: "Präsident"
        },
        aktuar: {
            name: "Stefan Müller", 
            email: "aktuar@fwv-raura.ch",
            phone: "+41 76 519 99 70",
            position: "Aktuar"
        },
        kassier: {
            name: "Giuseppe Costanza",
            email: "kassier@fwv-raura.ch",
            phone: "+41 79 501 71 20",
            position: "Kassier"
        },
        materialwart: {
            name: "Edi Grossenbacher",
            email: "materialwart@fwv-raura.ch",
            phone: "+41 79 302 71 35", 
            position: "Materialwart"
        },
        beisitzer: {
            name: "Beisitzer",
            email: "beisitzer@fwv-raura.ch",
            position: "Beisitzer"
        },

        // DEUTSCH: Allgemeine Kontaktadressen (nicht personengebunden)
        info: {
            name: "Info",
            email: "info@fwv-raura.ch",
            description: "Allgemeine Anfragen"
        },
        webmaster: {
            name: "Stefan Müller",
            email: "aktuar@fwv-raura.ch",
            description: "Website & IT"
        }
    },

    // DEUTSCH: === STANDARD-ORGANISATOREN — Werden bei neuen Events vorgeschlagen ===
    defaultOrganizers: {
        chilbi: {
            name: "Stefan Müller",
            email: "aktuar@fwv-raura.ch"
        },
        generalEvent: {
            name: "René Käslin", 
            email: "praesident@fwv-raura.ch"
        }
    },

    // DEUTSCH: === SYSTEM-EINSTELLUNGEN — Zeitzone, Sprache, Kalender, Springer ===
    system: {
        defaultTimezone: "Europe/Zurich",
        defaultLanguage: "de-DE",
        
        // DEUTSCH: Kalender-Einstellungen (für ICS-Export)
        calendar: {
            prodId: "-//Feuerwehrverein Raura Kaiseraugst//Vereinskalender//DE",
            calendarName: "Feuerwehrverein Raura Kaiseraugst",
            calendarDescription: "Termine und Veranstaltungen des Feuerwehrvereins Raura Kaiseraugst"
        },

        // DEUTSCH: Springer-System — Ersatzperson bei kurzfristigen Ausfällen in Schichten
        springer: {
            hauptspringer: "Stefan Müller (Aktuar)",
            email: "aktuar@fwv-raura.ch",
            verfuegbarkeit: "Verfügbar bei kurzfristigen Ausfällen"
        }
    },

    // DEUTSCH: === HILFSFUNKTIONEN — E-Mail/Name/Kontakt nach Rolle abrufen ===

    // DEUTSCH: Gibt die E-Mail-Adresse einer Rolle zurück (z.B. getEmail('aktuar') → 'aktuar@fwv-raura.ch')
    getEmail: function(role) {
        const parts = role.split('.');
        let obj = this.kontakte;
        
        for (const part of parts) {
            if (obj[part]) {
                obj = obj[part];
            } else {
                console.warn(`Config: Role '${role}' not found`);
                return this.kontakte.info.email; // Fallback
            }
        }
        
        return obj.email || this.kontakte.info.email;
    },

    // DEUTSCH: Gibt den Namen einer Rolle zurück (z.B. getName('kassier') → 'Giuseppe Costanza')
    getName: function(role) {
        const parts = role.split('.');
        let obj = this.kontakte;
        
        for (const part of parts) {
            if (obj[part]) {
                obj = obj[part];
            } else {
                console.warn(`Config: Role '${role}' not found`);
                return this.kontakte.info.name; // Fallback
            }
        }
        
        return obj.name || this.kontakte.info.name;
    },

    // DEUTSCH: Gibt das komplette Kontakt-Objekt einer Rolle zurück (name, email, phone etc.)
    getContact: function(role) {
        const parts = role.split('.');
        let obj = this.kontakte;
        
        for (const part of parts) {
            if (obj[part]) {
                obj = obj[part];
            } else {
                console.warn(`Config: Role '${role}' not found`);
                return this.kontakte.info; // Fallback
            }
        }
        
        return obj;
    },

    // DEUTSCH: Löst E-Mail-Aliase auf (Legacy-Weiterleitungen für alte Adressen)
    resolveEmail: function(email) {
        if (email === "aktuar@fwv-raura.ch") {
            return this.kontakte.aktuar.email; // Zur neuen Aktuar-E-Mail weiterleiten
        }
        if (email === "kontakt@fwv-raura.ch") {
            return this.kontakte.info.email;
        }
        return email; // Keine Weiterleitung nötig
    },

    // DEUTSCH: Gibt alle E-Mail-Adressen als Array zurück (für Übersichten)
    getAllEmails: function() {
        const emails = [];
        for (const [key, contact] of Object.entries(this.kontakte)) {
            emails.push({
                role: key,
                name: contact.name,
                email: contact.email,
                emailAlt: contact.emailAlt || null
            });
        }
        return emails;
    },

    // DEUTSCH: === DYNAMISCHES LADEN — Vorstandsdaten aus Markdown-Dateien ===

    // DEUTSCH: Lädt Vorstandsdaten aus vorstand/*.md per fetch (nur im Browser)
    async loadFromVorstandFiles() {
        if (typeof window === 'undefined') {
            console.warn('⚠️ loadFromVorstandFiles() nur im Browser verfügbar');
            return false;
        }

        const vorstandPositions = ['praesident', 'aktuar', 'kassier', 'materialwart', 'beisitzer'];
        let loadedCount = 0;

        for (const position of vorstandPositions) {
            try {
                const response = await fetch(`vorstand/${position}.md`);
                if (!response.ok) {
                    console.warn(`⚠️ Konnte ${position}.md nicht laden: ${response.status}`);
                    continue;
                }

                const content = await response.text();
                const data = this.parseVorstandMarkdown(content);
                
                if (data && data.email) {
                    // Aktualisiere die Kontaktdaten
                    this.kontakte[position] = {
                        ...this.kontakte[position], // Behalte Fallback-Werte
                        ...data // Überschreibe mit Daten aus Markdown
                    };
                    loadedCount++;
                    console.log(`✅ ${position}: ${data.name} (${data.email})`);
                } else {
                    console.warn(`⚠️ Unvollständige Daten in ${position}.md`);
                }
            } catch (error) {
                console.error(`❌ Fehler beim Laden von ${position}.md:`, error);
            }
        }

        console.log(`📊 ${loadedCount}/${vorstandPositions.length} Vorstandsdateien erfolgreich geladen`);
        return loadedCount > 0;
    },

    // DEUTSCH: Lädt Vorstandsdaten synchron aus dem Dateisystem (nur in Node.js/Scripts)
    loadFromVorstandFilesSync() {
        if (typeof require === 'undefined') {
            console.warn('⚠️ loadFromVorstandFilesSync() nur in Node.js verfügbar');
            return false;
        }

        const fs = require('fs');
        const path = require('path');
        const vorstandDir = path.join(__dirname, '..', 'vorstand');
        
        if (!fs.existsSync(vorstandDir)) {
            console.warn('⚠️ Vorstand-Verzeichnis nicht gefunden');
            return false;
        }

        const vorstandPositions = ['praesident', 'aktuar', 'kassier', 'materialwart', 'beisitzer'];
        let loadedCount = 0;

        for (const position of vorstandPositions) {
            try {
                const filePath = path.join(vorstandDir, `${position}.md`);
                
                if (!fs.existsSync(filePath)) {
                    console.warn(`⚠️ ${position}.md nicht gefunden`);
                    continue;
                }

                const content = fs.readFileSync(filePath, 'utf8');
                const data = this.parseVorstandMarkdown(content);
                
                if (data && data.email) {
                    // Aktualisiere die Kontaktdaten
                    this.kontakte[position] = {
                        ...this.kontakte[position], // Behalte Fallback-Werte
                        ...data // Überschreibe mit Daten aus Markdown
                    };
                    loadedCount++;
                    console.log(`✅ ${position}: ${data.name} (${data.email})`);
                } else {
                    console.warn(`⚠️ Unvollständige Daten in ${position}.md`);
                }
            } catch (error) {
                console.error(`❌ Fehler beim Laden von ${position}.md:`, error);
            }
        }

        console.log(`📊 ${loadedCount}/${vorstandPositions.length} Vorstandsdateien erfolgreich geladen`);
        return loadedCount > 0;
    },

    // DEUTSCH: Parst YAML-Frontmatter aus Markdown-Dateien (--- key: value ---)
    parseVorstandMarkdown(content) {
        try {
            const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
            if (!frontmatterMatch) {
                console.warn('⚠️ Kein Frontmatter gefunden');
                return null;
            }

            const frontmatterStr = frontmatterMatch[1];
            const lines = frontmatterStr.split(/\r?\n/).filter(line => line.trim());
            const data = {};

            for (const line of lines) {
                const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
                if (match) {
                    const [, key, value] = match;
                    data[key] = value.trim().replace(/^["']|["']$/g, ''); // Entferne Anführungszeichen
                }
            }

            return data;
        } catch (error) {
            console.error('❌ Fehler beim Parsen von Vorstand-Markdown:', error);
            return null;
        }
    },

    // DEUTSCH: Automatisches Laden — erkennt Browser vs. Node.js und lädt entsprechend
    async autoLoadVorstand() {
        if (typeof window !== 'undefined') {
            console.log('🔄 Lade Vorstandsdaten aus Markdown-Dateien...');
            await this.loadFromVorstandFiles();
        } else {
            console.log('🔄 Lade Vorstandsdaten aus Markdown-Dateien (Node.js)...');
            this.loadFromVorstandFilesSync();
        }
    }
};

// DEUTSCH: Export für Node.js (damit Scripts wie generate-ics.js die Config importieren können)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FWV_CONFIG;
}

// DEUTSCH: Im Browser als globales window.FWV_CONFIG verfügbar machen + Vorstandsdaten automatisch laden
if (typeof window !== 'undefined') {
    window.FWV_CONFIG = FWV_CONFIG;
    
    // DEUTSCH: Vorstandsdaten automatisch laden sobald die Seite bereit ist
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            FWV_CONFIG.autoLoadVorstand();
        });
    } else {
        // DEUTSCH: DOM bereits geladen — sofort laden
        FWV_CONFIG.autoLoadVorstand();
    }
} else {
    // DEUTSCH: Node.js — lade sofort synchron beim require()
    FWV_CONFIG.autoLoadVorstand();
}
