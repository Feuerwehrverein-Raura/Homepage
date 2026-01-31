import React, { useEffect, useRef, useState } from 'react'
import { Designer } from '@pdfme/ui'
import { generate } from '@pdfme/generator'
import { text, image, barcodes } from '@pdfme/schemas'
import { BLANK_PDF } from '@pdfme/common'

const API_BASE = 'https://api.fwv-raura.ch'

// Default A4 Brief Template
// WICHTIG: Swiss Post Standard (SN 010130) - Adressfeld RECHTS für C5/C6 Fensterkuvert
const getDefaultTemplate = () => ({
  basePdf: BLANK_PDF,
  schemas: [
    {
      // Absender oben links
      absender: {
        type: 'text',
        position: { x: 25, y: 15 },
        width: 75,
        height: 25,
        fontSize: 9,
        lineHeight: 1.2,
      },
      // Absender-Rückadresse (kleine Schrift über Adressfeld)
      absender_zeile: {
        type: 'text',
        position: { x: 118, y: 48 },
        width: 85,
        height: 5,
        fontSize: 7,
        fontColor: '#666666',
      },
      // Empfänger-Adresse (Swiss Post Position: RECHTS im Sichtfenster)
      // SN 010130: x=118mm, y=54mm, 85×31mm (Adresszone)
      empfaenger: {
        type: 'text',
        position: { x: 118, y: 54 },
        width: 85,
        height: 31,
        fontSize: 11,
        lineHeight: 1.3,
      },
      // Ort und Datum (rechts, unter Adressbereich)
      ort_datum: {
        type: 'text',
        position: { x: 118, y: 92 },
        width: 85,
        height: 8,
        fontSize: 10,
        alignment: 'right',
      },
      // Betreff (unterhalb Adressbereich)
      betreff: {
        type: 'text',
        position: { x: 25, y: 105 },
        width: 160,
        height: 10,
        fontSize: 12,
        fontWeight: 'bold',
      },
      // Anrede
      anrede: {
        type: 'text',
        position: { x: 25, y: 120 },
        width: 160,
        height: 8,
        fontSize: 11,
      },
      // Inhalt
      inhalt: {
        type: 'text',
        position: { x: 25, y: 133 },
        width: 160,
        height: 95,
        fontSize: 11,
        lineHeight: 1.4,
      },
      // Grussformel
      gruss: {
        type: 'text',
        position: { x: 25, y: 235 },
        width: 160,
        height: 25,
        fontSize: 11,
        lineHeight: 1.4,
      },
      // Fusszeile
      fusszeile: {
        type: 'text',
        position: { x: 25, y: 280 },
        width: 160,
        height: 8,
        fontSize: 8,
        alignment: 'center',
        fontColor: '#666666',
      },
    },
  ],
})

// Rechnungs-Template mit QR-Bereich
// WICHTIG: Swiss Post Standard (SN 010130) - Adressfeld RECHTS für C5/C6 Fensterkuvert
const getInvoiceTemplate = () => ({
  basePdf: BLANK_PDF,
  schemas: [
    {
      // Logo oben links
      logo: {
        type: 'image',
        position: { x: 25, y: 10 },
        width: 35,
        height: 18,
      },
      // Absender oben links (unter Logo)
      absender: {
        type: 'text',
        position: { x: 25, y: 30 },
        width: 75,
        height: 18,
        fontSize: 9,
        lineHeight: 1.2,
      },
      // Absender-Rückadresse (kleine Schrift über Adressfeld)
      absender_zeile: {
        type: 'text',
        position: { x: 118, y: 48 },
        width: 85,
        height: 5,
        fontSize: 7,
        fontColor: '#666666',
      },
      // Empfänger-Adresse (Swiss Post Position: RECHTS im Sichtfenster)
      empfaenger: {
        type: 'text',
        position: { x: 118, y: 54 },
        width: 85,
        height: 31,
        fontSize: 11,
        lineHeight: 1.3,
      },
      // Titel - unterhalb Adressbereich
      titel: {
        type: 'text',
        position: { x: 25, y: 95 },
        width: 160,
        height: 10,
        fontSize: 14,
        fontWeight: 'bold',
      },
      // Rechnungsnummer & Datum
      rechnung_info: {
        type: 'text',
        position: { x: 25, y: 108 },
        width: 160,
        height: 15,
        fontSize: 10,
        lineHeight: 1.4,
      },
      // Rechnungstext
      text: {
        type: 'text',
        position: { x: 25, y: 128 },
        width: 160,
        height: 45,
        fontSize: 11,
        lineHeight: 1.4,
      },
      // Betrag gross
      betrag: {
        type: 'text',
        position: { x: 130, y: 175 },
        width: 55,
        height: 12,
        fontSize: 16,
        fontWeight: 'bold',
        alignment: 'right',
      },
      // QR-Code Bereich (wird vom Backend mit swissqrbill gefüllt)
      qr_code: {
        type: 'image',
        position: { x: 25, y: 195 },
        width: 46,
        height: 46,
      },
      // Zahlungsinformationen
      zahlungsinfo: {
        type: 'text',
        position: { x: 80, y: 195 },
        width: 105,
        height: 45,
        fontSize: 9,
        lineHeight: 1.3,
      },
      // Fusszeile
      fusszeile: {
        type: 'text',
        position: { x: 25, y: 280 },
        width: 160,
        height: 8,
        fontSize: 8,
        alignment: 'center',
        fontColor: '#666666',
      },
    },
  ],
})

// Layout-Template für dynamische PDFs (Telefonliste, Arbeitsplan, etc.)
const getLayoutTemplate = () => ({
  basePdf: BLANK_PDF,
  schemas: [
    {
      // === HEADER ZONE ===
      // Logo oben links
      logo: {
        type: 'image',
        position: { x: 20, y: 10 },
        width: 30,
        height: 15,
      },
      // Organisation oben rechts
      organisation: {
        type: 'text',
        position: { x: 130, y: 10 },
        width: 60,
        height: 20,
        fontSize: 9,
        alignment: 'right',
        lineHeight: 1.2,
      },
      // Dokumenttitel
      titel: {
        type: 'text',
        position: { x: 20, y: 35 },
        width: 170,
        height: 12,
        fontSize: 16,
        fontWeight: 'bold',
      },
      // Untertitel/Datum
      untertitel: {
        type: 'text',
        position: { x: 20, y: 48 },
        width: 170,
        height: 8,
        fontSize: 10,
        fontColor: '#666666',
      },
      // Header-Linie (als dünnes Rechteck dargestellt)
      header_linie: {
        type: 'text',
        position: { x: 20, y: 58 },
        width: 170,
        height: 1,
        backgroundColor: '#cc0000',
      },

      // === CONTENT ZONE MARKER ===
      // Diese Felder markieren wo der dynamische Inhalt beginnt/endet
      // Sie werden im finalen PDF nicht gerendert, nur als Referenz
      content_start_y: {
        type: 'text',
        position: { x: 20, y: 65 },
        width: 5,
        height: 5,
        fontSize: 6,
        fontColor: '#cccccc',
      },
      content_end_y: {
        type: 'text',
        position: { x: 20, y: 270 },
        width: 5,
        height: 5,
        fontSize: 6,
        fontColor: '#cccccc',
      },

      // === FOOTER ZONE ===
      // Trennlinie Footer
      footer_linie: {
        type: 'text',
        position: { x: 20, y: 275 },
        width: 170,
        height: 1,
        backgroundColor: '#cc0000',
      },
      // Fusszeile
      fusszeile: {
        type: 'text',
        position: { x: 20, y: 280 },
        width: 130,
        height: 8,
        fontSize: 7,
        fontColor: '#666666',
      },
      // Seitenzahl
      seitenzahl: {
        type: 'text',
        position: { x: 170, y: 280 },
        width: 20,
        height: 8,
        fontSize: 7,
        alignment: 'right',
        fontColor: '#666666',
      },
    },
  ],
  // Zusätzliche Layout-Einstellungen (werden im Backend ausgewertet)
  layoutSettings: {
    headerHeight: 60,      // mm - Höhe des Header-Bereichs
    footerHeight: 22,      // mm - Höhe des Footer-Bereichs
    contentMarginLeft: 20, // mm
    contentMarginRight: 20,// mm
    primaryColor: '#cc0000',
    fontFamily: 'Helvetica',
    tableFontSize: 9,
    tableHeaderBold: true,
  },
})

// Mitgliederbeitrag-Template (Rechnung mit QR-Bill für Mitgliederbeiträge)
// WICHTIG: Swiss Post Standard (SN 010130) - Adressfeld RECHTS für C5/C6 Fensterkuvert
const getMitgliederbeitragTemplate = () => ({
  basePdf: BLANK_PDF,
  schemas: [
    {
      // Absender-Rückadresse (kleine Schrift über Adressfeld)
      absender_zeile: {
        type: 'text',
        position: { x: 118, y: 48 },
        width: 85,
        height: 5,
        fontSize: 7,
        fontColor: '#666666',
      },
      // Empfänger-Adresse (Swiss Post Position: RECHTS im Sichtfenster)
      // SN 010130: x=118mm, y=54mm, 85.5×31.5mm (Adresszone)
      empfaenger: {
        type: 'text',
        position: { x: 118, y: 54 },
        width: 85,
        height: 31,
        fontSize: 11,
        lineHeight: 1.3,
      },
      // Absender-Details oben links
      absender_name: {
        type: 'text',
        position: { x: 25, y: 15 },
        width: 75,
        height: 6,
        fontSize: 10,
        fontWeight: 'bold',
      },
      absender_adresse: {
        type: 'text',
        position: { x: 25, y: 21 },
        width: 75,
        height: 12,
        fontSize: 10,
        lineHeight: 1.2,
      },
      // Titel (z.B. "Mitgliederbeitrag 2026") - unterhalb Adressbereich
      titel: {
        type: 'text',
        position: { x: 25, y: 95 },
        width: 160,
        height: 10,
        fontSize: 14,
        fontWeight: 'bold',
      },
      // Rechnungsnummer
      rechnungsnummer: {
        type: 'text',
        position: { x: 25, y: 107 },
        width: 80,
        height: 6,
        fontSize: 10,
      },
      // Datum
      datum: {
        type: 'text',
        position: { x: 25, y: 113 },
        width: 80,
        height: 6,
        fontSize: 10,
      },
      // Rechnungstext
      text: {
        type: 'text',
        position: { x: 25, y: 125 },
        width: 160,
        height: 35,
        fontSize: 11,
        lineHeight: 1.4,
      },
      // Betrag (gross, rechts)
      betrag: {
        type: 'text',
        position: { x: 118, y: 165 },
        width: 70,
        height: 10,
        fontSize: 14,
        fontWeight: 'bold',
        alignment: 'right',
      },
      // Footer (über QR-Bill - QR-Bill beginnt bei y=192mm)
      footer: {
        type: 'text',
        position: { x: 50, y: 182 },
        width: 110,
        height: 6,
        fontSize: 8,
        alignment: 'center',
        fontColor: '#666666',
      },
      // QR-Bill wird vom Backend angehängt (untere 105mm)
    },
  ],
})

// Arbeitsplan-Template
const getArbeitsplanTemplate = () => ({
  basePdf: BLANK_PDF,
  schemas: [
    {
      // Logo oben links
      logo: {
        type: 'image',
        position: { x: 15, y: 10 },
        width: 25,
        height: 12,
      },
      // Organisation oben rechts
      organisation: {
        type: 'text',
        position: { x: 140, y: 10 },
        width: 55,
        height: 15,
        fontSize: 9,
        alignment: 'right',
        lineHeight: 1.2,
      },
      // Haupttitel
      titel: {
        type: 'text',
        position: { x: 15, y: 28 },
        width: 180,
        height: 10,
        fontSize: 18,
        fontWeight: 'bold',
        alignment: 'center',
      },
      // Event-Name
      event_name: {
        type: 'text',
        position: { x: 15, y: 40 },
        width: 180,
        height: 8,
        fontSize: 14,
        alignment: 'center',
      },
      // Datum
      datum: {
        type: 'text',
        position: { x: 15, y: 50 },
        width: 180,
        height: 6,
        fontSize: 12,
        alignment: 'center',
        fontColor: '#666666',
      },
      // Header-Linie
      header_linie: {
        type: 'text',
        position: { x: 15, y: 60 },
        width: 180,
        height: 1,
        backgroundColor: '#cc0000',
      },
      // Schichten werden dynamisch vom Backend generiert (ab Y=65)
      // Footer
      footer: {
        type: 'text',
        position: { x: 15, y: 280 },
        width: 180,
        height: 6,
        fontSize: 7,
        alignment: 'center',
        fontColor: '#666666',
      },
    },
  ],
  layoutSettings: {
    headerHeight: 65,
    footerHeight: 15,
    contentMarginLeft: 15,
    contentMarginRight: 15,
    primaryColor: '#cc0000',
    tableFontSize: 9,
    tableHeaderBold: true,
  },
})

// Telefonliste-Template
const getTelefonlisteTemplate = () => ({
  basePdf: BLANK_PDF,
  schemas: [
    {
      // Logo oben links
      logo: {
        type: 'image',
        position: { x: 15, y: 10 },
        width: 25,
        height: 12,
      },
      // Organisation oben rechts
      organisation: {
        type: 'text',
        position: { x: 140, y: 10 },
        width: 55,
        height: 15,
        fontSize: 9,
        alignment: 'right',
        lineHeight: 1.2,
      },
      // Haupttitel
      titel: {
        type: 'text',
        position: { x: 15, y: 28 },
        width: 180,
        height: 10,
        fontSize: 16,
        fontWeight: 'bold',
        alignment: 'center',
      },
      // Stand-Datum
      datum: {
        type: 'text',
        position: { x: 15, y: 40 },
        width: 180,
        height: 6,
        fontSize: 10,
        alignment: 'center',
        fontColor: '#666666',
      },
      // Header-Linie
      header_linie: {
        type: 'text',
        position: { x: 15, y: 50 },
        width: 180,
        height: 1,
        backgroundColor: '#cc0000',
      },
      // Mitglieder-Liste wird dynamisch vom Backend generiert (ab Y=55)
      // Footer
      footer: {
        type: 'text',
        position: { x: 15, y: 280 },
        width: 140,
        height: 6,
        fontSize: 7,
        fontColor: '#666666',
      },
      // Seitenzahl
      seitenzahl: {
        type: 'text',
        position: { x: 170, y: 280 },
        width: 25,
        height: 6,
        fontSize: 7,
        alignment: 'right',
        fontColor: '#666666',
      },
    },
  ],
  layoutSettings: {
    headerHeight: 55,
    footerHeight: 15,
    contentMarginLeft: 15,
    contentMarginRight: 15,
    primaryColor: '#cc0000',
    tableFontSize: 9,
    tableHeaderBold: true,
    columns: ['Name', 'Funktion', 'Telefon', 'E-Mail'],
  },
})

// Mahnbrief-Template
// WICHTIG: Swiss Post Standard (SN 010130) - Adressfeld RECHTS für C5/C6 Fensterkuvert
const getMahnbriefTemplate = () => ({
  basePdf: BLANK_PDF,
  schemas: [
    {
      // Absender oben links
      absender: {
        type: 'text',
        position: { x: 25, y: 15 },
        width: 75,
        height: 18,
        fontSize: 10,
        lineHeight: 1.2,
      },
      // Absender-Rückadresse (kleine Schrift über Adressfeld)
      absender_zeile: {
        type: 'text',
        position: { x: 118, y: 48 },
        width: 85,
        height: 5,
        fontSize: 7,
        fontColor: '#666666',
      },
      // Empfänger-Adresse (Swiss Post Position: RECHTS im Sichtfenster)
      empfaenger: {
        type: 'text',
        position: { x: 118, y: 54 },
        width: 85,
        height: 31,
        fontSize: 11,
        lineHeight: 1.3,
      },
      // Mahnstufe (rot, rechts) - unterhalb Adressbereich
      mahnstufe: {
        type: 'text',
        position: { x: 150, y: 95 },
        width: 40,
        height: 8,
        fontSize: 12,
        fontWeight: 'bold',
        alignment: 'right',
        fontColor: '#dc2626',
      },
      // Titel - unterhalb Adressbereich
      titel: {
        type: 'text',
        position: { x: 25, y: 95 },
        width: 120,
        height: 10,
        fontSize: 14,
        fontWeight: 'bold',
      },
      // Rechnungsreferenz
      referenz: {
        type: 'text',
        position: { x: 25, y: 107 },
        width: 160,
        height: 10,
        fontSize: 10,
        lineHeight: 1.3,
      },
      // Mahntext
      text: {
        type: 'text',
        position: { x: 25, y: 125 },
        width: 160,
        height: 50,
        fontSize: 11,
        lineHeight: 1.4,
      },
      // Offener Betrag (gross)
      offener_betrag: {
        type: 'text',
        position: { x: 118, y: 180 },
        width: 70,
        height: 10,
        fontSize: 14,
        fontWeight: 'bold',
        alignment: 'right',
      },
      // Frist
      frist: {
        type: 'text',
        position: { x: 25, y: 195 },
        width: 160,
        height: 8,
        fontSize: 11,
        fontWeight: 'bold',
        fontColor: '#dc2626',
      },
      // Gruss
      gruss: {
        type: 'text',
        position: { x: 25, y: 215 },
        width: 160,
        height: 25,
        fontSize: 11,
        lineHeight: 1.4,
      },
      // Footer
      footer: {
        type: 'text',
        position: { x: 25, y: 280 },
        width: 160,
        height: 6,
        fontSize: 8,
        alignment: 'center',
        fontColor: '#666666',
      },
    },
  ],
})

// Sample inputs for preview
const getSampleInputs = (category) => {
  if (category === 'layout') {
    return [{
      logo: '',
      organisation: 'Feuerwehrverein Raura\n6017 Ruswil',
      titel: 'Beispiel-Dokument',
      untertitel: `Stand: ${new Date().toLocaleDateString('de-CH')}`,
      header_linie: '',
      content_start_y: '▼',
      content_end_y: '▲',
      footer_linie: '',
      fusszeile: 'Feuerwehrverein Raura | www.fwv-raura.ch',
      seitenzahl: 'Seite 1',
    }]
  }
  if (category === 'rechnung') {
    return [{
      logo: '',
      absender: 'Feuerwehrverein Raura\nMusterstrasse 1\n6017 Ruswil',
      absender_zeile: 'FWV Raura · Musterstrasse 1 · 6017 Ruswil',
      empfaenger: 'Max Mustermann\nBeispielweg 42\n6000 Luzern',
      titel: 'Mitgliederbeitrag 2026',
      rechnung_info: 'Rechnungsnummer: 2026-001\nDatum: 30.01.2026',
      text: 'Wir erlauben uns, Ihnen den Mitgliederbeitrag für das Jahr 2026 in Rechnung zu stellen.\n\nBitte überweisen Sie den Betrag innert 30 Tagen.',
      betrag: 'CHF 50.00',
      qr_code: '',
      zahlungsinfo: 'Konto: CH93 0076 2011 6238 5295 7\nZahlbar innert 30 Tagen\nReferenz: RF26 0001',
      fusszeile: 'Feuerwehrverein Raura | www.fwv-raura.ch | info@fwv-raura.ch',
    }]
  }
  if (category === 'mitgliederbeitrag') {
    return [{
      absender_name: 'Feuerwehrverein Raura',
      absender_adresse: 'Musterstrasse 1\n6017 Ruswil',
      absender_zeile: 'FWV Raura · Musterstrasse 1 · 6017 Ruswil',
      empfaenger: 'Max Mustermann\nBeispielweg 42\n6000 Luzern',
      titel: 'Mitgliederbeitrag 2026',
      rechnungsnummer: 'Rechnungsnummer: RF26-000001',
      datum: `Datum: ${new Date().toLocaleDateString('de-CH')}`,
      text: 'Wir erlauben uns, Ihnen den Mitgliederbeitrag für das Jahr 2026 in Rechnung zu stellen.\n\nBitte überweisen Sie den Betrag innert 30 Tagen.',
      betrag: 'CHF 50.00',
      footer: 'Feuerwehrverein Raura | www.fwv-raura.ch | info@fwv-raura.ch',
    }]
  }
  if (category === 'arbeitsplan') {
    return [{
      logo: '',
      organisation: 'Feuerwehrverein Raura\n6017 Ruswil',
      titel: 'ARBEITSPLAN',
      event_name: 'Räbeliechtliumzug 2026',
      datum: 'Samstag, 9. November 2026',
      header_linie: '',
      footer: 'Feuerwehrverein Raura | Bei Fragen: info@fwv-raura.ch',
    }]
  }
  if (category === 'telefonliste') {
    return [{
      logo: '',
      organisation: 'Feuerwehrverein Raura\n6017 Ruswil',
      titel: 'Telefonliste Mitglieder',
      datum: `Stand: ${new Date().toLocaleDateString('de-CH')}`,
      header_linie: '',
      footer: 'Feuerwehrverein Raura | Nur für internen Gebrauch',
      seitenzahl: 'Seite 1/3',
    }]
  }
  if (category === 'mahnbrief') {
    return [{
      absender: 'Feuerwehrverein Raura\nMusterstrasse 1\n6017 Ruswil',
      absender_zeile: 'FWV Raura · Musterstrasse 1 · 6017 Ruswil',
      empfaenger: 'Max Mustermann\nBeispielweg 42\n6000 Luzern',
      mahnstufe: '2. Mahnung',
      titel: 'Zahlungserinnerung',
      referenz: 'Betr.: Rechnung RF26-000001 vom 15.01.2026\nUrsprünglicher Betrag: CHF 50.00',
      text: 'Trotz unserer Erinnerung vom 15.02.2026 haben wir bis heute keinen Zahlungseingang verzeichnen können.\n\nWir bitten Sie, den ausstehenden Betrag umgehend zu begleichen, um weitere Mahnkosten zu vermeiden.',
      offener_betrag: 'CHF 60.00',
      frist: 'Zahlungsfrist: 7 Tage',
      gruss: 'Freundliche Grüsse\n\nFeuerwehrverein Raura\nDer Kassier',
      footer: 'Feuerwehrverein Raura | www.fwv-raura.ch | info@fwv-raura.ch',
    }]
  }
  // Default: Brief
  return [{
    absender: 'Feuerwehrverein Raura\nMusterstrasse 1\n6017 Ruswil',
    absender_zeile: 'FWV Raura · Musterstrasse 1 · 6017 Ruswil',
    empfaenger: 'Max Mustermann\nBeispielweg 42\n6000 Luzern',
    ort_datum: 'Ruswil, 30. Januar 2026',
    betreff: 'Einladung zur Generalversammlung',
    anrede: 'Sehr geehrter Herr Mustermann',
    inhalt: 'Wir laden Sie herzlich zu unserer diesjährigen Generalversammlung ein.\n\nDie Versammlung findet am Samstag, 15. März 2026 um 19:00 Uhr im Vereinslokal statt.\n\nWir freuen uns auf Ihre Teilnahme.',
    gruss: 'Freundliche Grüsse\n\nFeuerwehrverein Raura\nDer Präsident',
    fusszeile: 'Feuerwehrverein Raura | www.fwv-raura.ch | info@fwv-raura.ch',
  }]
}

// Plugin configuration
const plugins = { text, image, ...barcodes }

// Pingen Address Zone Overlay Component
// Legt sich direkt über das PDF im Editor
function PingenOverlay({ country, designerRef }) {
  const [pageRect, setPageRect] = useState(null)

  useEffect(() => {
    const container = designerRef.current
    if (!container) return

    const findAndTrackPage = () => {
      const currentContainer = designerRef.current
      if (!currentContainer) return

      // pdfme rendert die PDF-Seite in verschiedenen Strukturen
      // Wir suchen nach dem Element das die A4-Seite darstellt
      let pageElement = null
      let bestMatch = null
      let bestScore = 0

      // Durchsuche alle Elemente
      const allElements = currentContainer.querySelectorAll('div, canvas')
      for (const el of allElements) {
        const rect = el.getBoundingClientRect()

        // Mindestgrösse prüfen
        if (rect.width < 200 || rect.height < 200) continue

        // A4 hat Verhältnis 210:297 = 0.707
        const ratio = rect.width / rect.height
        const isA4Ratio = ratio > 0.6 && ratio < 0.8

        if (!isA4Ratio) continue

        // Score basierend auf Grösse und wie nah am A4-Verhältnis
        const ratioScore = 1 - Math.abs(ratio - 0.707)
        const sizeScore = rect.width * rect.height / 1000000 // Grössere Elemente bevorzugen
        const score = ratioScore * 10 + sizeScore

        // Prüfe auch den Hintergrund
        const style = window.getComputedStyle(el)
        const bgColor = style.backgroundColor

        // Weisser oder heller Hintergrund gibt Bonuspunkte
        if (bgColor.includes('255, 255, 255') || bgColor === 'white' || bgColor === 'rgba(0, 0, 0, 0)') {
          if (score > bestScore) {
            bestScore = score
            bestMatch = el
          }
        }
      }

      // Fallback: Suche nach Canvas
      if (!bestMatch) {
        const canvas = currentContainer.querySelector('canvas')
        if (canvas) {
          const rect = canvas.getBoundingClientRect()
          if (rect.width > 200 && rect.height > 200) {
            bestMatch = canvas
          }
        }
      }

      // Zweiter Fallback: Grösstes A4-proportionales Element
      if (!bestMatch) {
        for (const el of allElements) {
          const rect = el.getBoundingClientRect()
          if (rect.width < 200 || rect.height < 200) continue
          const ratio = rect.width / rect.height
          if (ratio > 0.6 && ratio < 0.8) {
            const score = rect.width * rect.height
            if (score > bestScore) {
              bestScore = score
              bestMatch = el
            }
          }
        }
      }

      pageElement = bestMatch

      if (pageElement) {
        const rect = pageElement.getBoundingClientRect()
        const containerRect = currentContainer.getBoundingClientRect()

        setPageRect({
          left: rect.left - containerRect.left,
          top: rect.top - containerRect.top,
          width: rect.width,
          height: rect.height,
        })
      }
    }

    // Initial check mit Verzögerung (pdfme braucht Zeit zum Rendern)
    const timer = setTimeout(findAndTrackPage, 500)

    // Wiederhole regelmässig um Updates zu erfassen
    const retryTimer = setInterval(findAndTrackPage, 2000)

    // Beobachte Änderungen (Zoom, Resize)
    const observer = new MutationObserver(() => {
      setTimeout(findAndTrackPage, 200)
    })
    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'transform']
    })

    // Resize handler
    const resizeObserver = new ResizeObserver(() => {
      setTimeout(findAndTrackPage, 200)
    })
    resizeObserver.observe(container)

    // Scroll handler für den Designer-Bereich
    const handleScroll = () => setTimeout(findAndTrackPage, 100)
    container.addEventListener('scroll', handleScroll, true)

    return () => {
      clearTimeout(timer)
      clearInterval(retryTimer)
      observer.disconnect()
      resizeObserver.disconnect()
      container.removeEventListener('scroll', handleScroll, true)
    }
  }, [designerRef])

  if (!pageRect) return null

  // A4 Dimensionen: 210mm x 297mm
  // Separate Umrechnung für X (Breite) und Y (Höhe)
  const mmToPixelX = (mm) => (mm / 210) * pageRect.width
  const mmToPixelY = (mm) => (mm / 297) * pageRect.height

  // Schweizer Standard (SN 010130) - Fenster RECHTS
  // Adressfeld: x=118mm, y=54mm, 85x31mm (netto Schreibfeld)
  // Frankierzone: oben rechts (ca. 74x52mm für A-Post)
  const chZones = {
    // Frankierzone (Briefmarke/Stempel) - oben rechts, endet bei 200mm (10mm Rand)
    franking: { x: 126, y: 0, w: 74, h: 52 },
    // Adressfeld - rechts, ab 54mm von oben
    address: { x: 118, y: 54, w: 85, h: 31 },
  }

  // Deutscher Standard (DIN 5008) - Fenster LINKS
  // Adressfeld: x=20mm, y=45mm, 85x45mm
  const deZones = {
    // Frankierzone - oben rechts
    franking: { x: 126, y: 0, w: 74, h: 52 },
    // Adressfeld - links
    address: { x: 20, y: 45, w: 85, h: 45 },
  }

  const zones = country === 'ch' ? chZones : deZones
  const color = country === 'ch' ? 'red' : 'blue'

  return (
    <div
      className="absolute pointer-events-none z-40"
      style={{
        left: pageRect.left,
        top: pageRect.top,
        width: pageRect.width,
        height: pageRect.height,
      }}
    >
      {/* Frankierzone */}
      <div
        className={`absolute border-2 border-dashed border-orange-500`}
        style={{
          left: mmToPixelX(zones.franking.x),
          top: mmToPixelY(zones.franking.y),
          width: mmToPixelX(zones.franking.w),
          height: mmToPixelY(zones.franking.h),
          backgroundColor: 'rgba(255, 165, 0, 0.15)',
        }}
      >
        <span className="text-xs text-orange-600 bg-white px-1 rounded absolute top-0 left-0 font-medium">
          Frankierzone
        </span>
      </div>

      {/* Adressfeld */}
      <div
        className={`absolute border-2 border-dashed border-${color}-500`}
        style={{
          left: mmToPixelX(zones.address.x),
          top: mmToPixelY(zones.address.y),
          width: mmToPixelX(zones.address.w),
          height: mmToPixelY(zones.address.h),
          backgroundColor: color === 'red' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)',
          borderColor: color === 'red' ? '#ef4444' : '#3b82f6',
        }}
      >
        <span
          className="text-xs bg-white px-1 rounded absolute top-0 left-0 font-medium"
          style={{ color: color === 'red' ? '#ef4444' : '#3b82f6' }}
        >
          {country === 'ch' ? '🇨🇭' : '🇩🇪'} Adressfeld ({zones.address.w}×{zones.address.h}mm)
        </span>
        <span
          className="text-xs bg-white px-1 rounded absolute bottom-0 right-0"
          style={{ color: color === 'red' ? '#ef4444' : '#3b82f6' }}
        >
          x={zones.address.x}mm y={zones.address.y}mm
        </span>
      </div>

      {/* Info-Badge */}
      <div
        className="absolute bottom-2 left-2 bg-white rounded shadow px-2 py-1 text-xs pointer-events-auto"
        style={{ borderLeft: `3px solid ${color === 'red' ? '#ef4444' : '#3b82f6'}` }}
      >
        <strong>{country === 'ch' ? '🇨🇭 Swiss Post' : '🇩🇪 DIN 5008'}</strong>
        <span className="text-gray-500 ml-2">
          Fenster {country === 'ch' ? 'RECHTS' : 'LINKS'}
        </span>
      </div>
    </div>
  )
}

function App() {
  const designerRef = useRef(null)
  const designerInstance = useRef(null)
  const [templates, setTemplates] = useState([])
  const [currentTemplate, setCurrentTemplate] = useState(null)
  const [templateName, setTemplateName] = useState('')
  const [templateCategory, setTemplateCategory] = useState('brief')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [designerReady, setDesignerReady] = useState(false)
  const [showAddressOverlay, setShowAddressOverlay] = useState(null) // null, 'ch', 'de'

  // Helper to get cookie value
  const getCookie = (name) => {
    const value = `; ${document.cookie}`
    const parts = value.split(`; ${name}=`)
    if (parts.length === 2) return parts.pop().split(';').shift()
    return null
  }

  // Check authentication
  useEffect(() => {
    let token = localStorage.getItem('vorstand_token')

    // Check URL parameter (from redirect)
    if (!token) {
      const urlParams = new URLSearchParams(window.location.search)
      token = urlParams.get('token')
      if (token) {
        localStorage.setItem('vorstand_token', token)
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname)
      }
    }

    // Check cookie (cross-subdomain)
    if (!token) {
      token = getCookie('vorstand_token')
      if (token) {
        localStorage.setItem('vorstand_token', token)
      }
    }

    if (token) {
      fetch(`${API_BASE}/auth/vorstand/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          if (!res.ok) throw new Error('Not authenticated')
          return res.json()
        })
        .then((data) => {
          const hasAccess =
            data.role === 'admin' ||
            data.groups?.includes('vorstand') ||
            data.funktion?.toLowerCase().includes('social media')
          if (hasAccess) {
            setIsAuthenticated(true)
            setUser(data)
          }
          setLoading(false)
        })
        .catch(() => {
          // Token invalid/expired - clear it
          localStorage.removeItem('vorstand_token')
          document.cookie = 'vorstand_token=; domain=.fwv-raura.ch; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
          setLoading(false)
        })
    } else {
      setLoading(false)
    }
  }, [])

  // Load templates
  useEffect(() => {
    if (isAuthenticated) {
      loadTemplates()
    }
  }, [isAuthenticated])

  // Initialize pdfme Designer
  useEffect(() => {
    if (isAuthenticated && designerRef.current && !designerInstance.current) {
      try {
        const template = currentTemplate?.template_schema || getDefaultTemplate()

        designerInstance.current = new Designer({
          domContainer: designerRef.current,
          template,
          plugins,
        })
        setDesignerReady(true)
      } catch (err) {
        console.error('Designer init error:', err)
      }
    }

    return () => {
      if (designerInstance.current) {
        designerInstance.current.destroy()
        designerInstance.current = null
        setDesignerReady(false)
      }
    }
  }, [isAuthenticated])

  const loadTemplates = async () => {
    try {
      const token = localStorage.getItem('vorstand_token')
      const res = await fetch(`${API_BASE}/pdf-templates`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setTemplates(data)
      }
    } catch (err) {
      console.error('Error loading templates:', err)
    }
  }

  const loadTemplate = (template) => {
    setCurrentTemplate(template)
    setTemplateName(template.name)
    setTemplateCategory(template.category || 'brief')

    if (designerInstance.current && template.template_schema) {
      try {
        designerInstance.current.updateTemplate(template.template_schema)
      } catch (err) {
        console.error('Error loading template:', err)
      }
    }
  }

  const createNewTemplate = (category = 'brief') => {
    setCurrentTemplate(null)
    setTemplateName('')
    setTemplateCategory(category)

    let template
    switch (category) {
      case 'rechnung':
        template = getInvoiceTemplate()
        break
      case 'layout':
        template = getLayoutTemplate()
        break
      case 'mitgliederbeitrag':
        template = getMitgliederbeitragTemplate()
        break
      case 'arbeitsplan':
        template = getArbeitsplanTemplate()
        break
      case 'telefonliste':
        template = getTelefonlisteTemplate()
        break
      case 'mahnbrief':
        template = getMahnbriefTemplate()
        break
      default:
        template = getDefaultTemplate()
    }

    if (designerInstance.current) {
      try {
        designerInstance.current.updateTemplate(template)
      } catch (err) {
        console.error('Error creating template:', err)
      }
    }
  }

  const saveTemplate = async () => {
    if (!templateName.trim()) {
      alert('Bitte einen Namen eingeben')
      return
    }

    setSaving(true)
    try {
      const token = localStorage.getItem('vorstand_token')
      const templateSchema = designerInstance.current.getTemplate()

      const slug = templateName
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')

      // Extract variable names from schema
      const variables = []
      if (templateSchema.schemas) {
        templateSchema.schemas.forEach((page) => {
          Object.keys(page).forEach((fieldName) => {
            if (!variables.includes(fieldName)) {
              variables.push(fieldName)
            }
          })
        })
      }

      const body = {
        name: templateName,
        slug,
        category: templateCategory,
        template_schema: templateSchema,
        variables,
      }

      const url = currentTemplate
        ? `${API_BASE}/pdf-templates/${currentTemplate.id}`
        : `${API_BASE}/pdf-templates`

      const method = currentTemplate ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        const saved = await res.json()
        setCurrentTemplate(saved)
        loadTemplates()
        alert('Template gespeichert!')
      } else {
        const error = await res.json()
        throw new Error(error.error || 'Speichern fehlgeschlagen')
      }
    } catch (err) {
      alert('Fehler beim Speichern: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const deleteTemplate = async (id) => {
    if (!confirm('Template wirklich löschen?')) return

    try {
      const token = localStorage.getItem('vorstand_token')
      const res = await fetch(`${API_BASE}/pdf-templates/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (res.ok) {
        if (currentTemplate?.id === id) {
          createNewTemplate()
        }
        loadTemplates()
      }
    } catch (err) {
      alert('Fehler beim Löschen')
    }
  }

  const generatePreview = async () => {
    if (!designerInstance.current) return

    try {
      const template = designerInstance.current.getTemplate()
      const inputs = getSampleInputs(templateCategory)

      const pdf = await generate({
        template,
        inputs,
        plugins,
      })

      const blob = new Blob([pdf.buffer], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
    } catch (err) {
      console.error('Preview error:', err)
      alert('Fehler bei der Vorschau: ' + err.message)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-gray-600">Laden...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
          <div className="text-center mb-6">
            <img
              src="https://www.fwv-raura.ch/images/logo.png"
              alt="FWV Raura"
              className="h-16 mx-auto mb-4"
            />
            <h1 className="text-2xl font-bold text-gray-800">PDF-Designer</h1>
            <p className="text-gray-600 mt-2">Zugriff nur für Vorstand</p>
          </div>
          <a
            href={`https://www.fwv-raura.ch/vorstand.html?redirect=${encodeURIComponent(window.location.href)}`}
            className="block w-full bg-red-600 text-white text-center py-3 rounded-lg hover:bg-red-700 transition"
          >
            Zum Vorstand-Login
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <img
              src="https://www.fwv-raura.ch/images/logo.png"
              alt="FWV Raura"
              className="h-8"
            />
            <h1 className="text-xl font-bold text-gray-800">PDF-Designer</h1>
            <span className="text-xs text-gray-400 ml-2">v{import.meta.env.VITE_APP_VERSION || 'dev'}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">
              {user?.vorname || user?.name} {user?.nachname || ''}
            </span>
            <a
              href="https://www.fwv-raura.ch/vorstand.html"
              className="text-sm text-red-600 hover:text-red-700"
            >
              Zurück zum Vorstand
            </a>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-64px)]">
        {/* Sidebar */}
        <div className="w-72 bg-white border-r flex flex-col">
          {/* Template Info */}
          <div className="p-4 border-b">
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Template-Name
              </label>
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="z.B. Mitgliederbeitrag-Rechnung"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
            </div>
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Kategorie
              </label>
              <select
                value={templateCategory}
                onChange={(e) => {
                  setTemplateCategory(e.target.value)
                  if (!currentTemplate) {
                    createNewTemplate(e.target.value)
                  }
                }}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 text-sm"
              >
                <optgroup label="Dokumente">
                  <option value="brief">Brief</option>
                  <option value="mahnbrief">Mahnbrief</option>
                </optgroup>
                <optgroup label="Rechnungen">
                  <option value="mitgliederbeitrag">Mitgliederbeitrag</option>
                  <option value="rechnung">Generische Rechnung</option>
                </optgroup>
                <optgroup label="Listen & Pläne">
                  <option value="arbeitsplan">Arbeitsplan</option>
                  <option value="telefonliste">Telefonliste</option>
                  <option value="layout">Layout (Allgemein)</option>
                </optgroup>
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={saveTemplate}
                disabled={saving || !designerReady}
                className="flex-1 bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {saving ? 'Speichern...' : 'Speichern'}
              </button>
              <button
                onClick={generatePreview}
                disabled={!designerReady}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                title="Vorschau generieren"
              >
                📄
              </button>
            </div>

            {/* Pingen Address Zone Overlay Toggle */}
            <div className="mt-3 pt-3 border-t">
              <label className="block text-xs font-medium text-gray-600 mb-2">
                📬 Pingen Adresszone anzeigen
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAddressOverlay(showAddressOverlay === 'ch' ? null : 'ch')}
                  className={`flex-1 px-3 py-2 text-xs rounded-lg border transition ${
                    showAddressOverlay === 'ch'
                      ? 'bg-red-100 border-red-500 text-red-700'
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                  title="Schweizer Briefstandard: Adressfeld rechts"
                >
                  🇨🇭 Schweiz
                </button>
                <button
                  onClick={() => setShowAddressOverlay(showAddressOverlay === 'de' ? null : 'de')}
                  className={`flex-1 px-3 py-2 text-xs rounded-lg border transition ${
                    showAddressOverlay === 'de'
                      ? 'bg-blue-100 border-blue-500 text-blue-700'
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                  title="Deutscher Briefstandard (DIN 5008): Adressfeld links"
                >
                  🇩🇪 Deutschland
                </button>
              </div>
              {showAddressOverlay && (
                <div className="text-xs text-gray-500 mt-2 space-y-1">
                  <p className="flex items-center gap-1">
                    <span className="w-3 h-3 border border-orange-500 bg-orange-100 inline-block"></span>
                    <span>Frankierzone (Briefmarke/Stempel)</span>
                  </p>
                  <p className="flex items-center gap-1">
                    <span className={`w-3 h-3 border inline-block ${showAddressOverlay === 'ch' ? 'border-red-500 bg-red-100' : 'border-blue-500 bg-blue-100'}`}></span>
                    <span>Adressfeld für Pingen-Versand</span>
                  </p>
                  <p className="mt-1 text-gray-400">
                    {showAddressOverlay === 'ch'
                      ? 'CH: Adresse + Frankierung RECHTS'
                      : 'DE: Adresse + Frankierung LINKS'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Template List */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-700">Templates</h3>
                <button
                  onClick={() => createNewTemplate(templateCategory)}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  + Neu
                </button>
              </div>
              <div className="space-y-2">
                {templates.map((t) => (
                  <div
                    key={t.id}
                    className={`p-3 rounded-lg cursor-pointer border ${
                      currentTemplate?.id === t.id
                        ? 'border-red-500 bg-red-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                    onClick={() => loadTemplate(t)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-sm">{t.name}</div>
                        <div className="text-xs text-gray-500 capitalize">{t.category}</div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteTemplate(t.id)
                        }}
                        className="text-red-400 hover:text-red-600 p-1"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
                {templates.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-4">
                    Keine Templates vorhanden
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Variables Info */}
          <div className="p-4 border-t bg-gray-50 max-h-64 overflow-y-auto">
            <h4 className="text-xs font-semibold text-gray-600 mb-2">
              Verfügbare Variablen ({templateCategory})
            </h4>

            {templateCategory === 'brief' && (
              <div className="text-xs text-gray-500 space-y-1">
                <div className="grid grid-cols-2 gap-1">
                  <span>absender</span>
                  <span>absender_zeile</span>
                  <span>empfaenger</span>
                  <span>ort_datum</span>
                  <span>betreff</span>
                  <span>anrede</span>
                  <span>inhalt</span>
                  <span>gruss</span>
                  <span>fusszeile</span>
                </div>
                <p className="mt-2 text-gray-400">
                  Adresse rechts positioniert für Schweizer Fensterkuvert (SN 010130).
                </p>
              </div>
            )}

            {templateCategory === 'rechnung' && (
              <div className="text-xs text-gray-500 space-y-1">
                <div className="grid grid-cols-2 gap-1">
                  <span>logo</span>
                  <span>absender</span>
                  <span>absender_zeile</span>
                  <span>empfaenger</span>
                  <span>titel</span>
                  <span>rechnung_info</span>
                  <span>text</span>
                  <span>betrag</span>
                  <span>qr_code</span>
                  <span>zahlungsinfo</span>
                  <span>fusszeile</span>
                </div>
                <p className="mt-2 text-gray-400">
                  Adresse rechts (CH Fenster). QR-Code mit swissqrbill.
                </p>
              </div>
            )}

            {templateCategory === 'mitgliederbeitrag' && (
              <div className="text-xs text-gray-500 space-y-1">
                <div className="grid grid-cols-2 gap-1">
                  <span>absender_name</span>
                  <span>absender_adresse</span>
                  <span>absender_zeile</span>
                  <span>empfaenger</span>
                  <span>titel</span>
                  <span>rechnungsnummer</span>
                  <span>datum</span>
                  <span>text</span>
                  <span>betrag</span>
                  <span>footer</span>
                </div>
                <p className="mt-2 text-gray-400">
                  Adresse rechts (CH Fenster). QR-Bill unten (105mm).
                </p>
              </div>
            )}

            {templateCategory === 'arbeitsplan' && (
              <div className="text-xs text-gray-500 space-y-1">
                <div className="grid grid-cols-2 gap-1">
                  <span>logo</span>
                  <span>organisation</span>
                  <span>titel</span>
                  <span>event_name</span>
                  <span>datum</span>
                  <span>header_linie</span>
                  <span>footer</span>
                </div>
                <p className="mt-2 text-gray-400">
                  Schichten-Tabelle wird dynamisch vom Backend generiert.
                </p>
              </div>
            )}

            {templateCategory === 'telefonliste' && (
              <div className="text-xs text-gray-500 space-y-1">
                <div className="grid grid-cols-2 gap-1">
                  <span>logo</span>
                  <span>organisation</span>
                  <span>titel</span>
                  <span>datum</span>
                  <span>header_linie</span>
                  <span>footer</span>
                  <span>seitenzahl</span>
                </div>
                <p className="mt-2 text-gray-400">
                  Mitglieder-Tabelle wird dynamisch vom Backend generiert.
                </p>
              </div>
            )}

            {templateCategory === 'mahnbrief' && (
              <div className="text-xs text-gray-500 space-y-1">
                <div className="grid grid-cols-2 gap-1">
                  <span>absender</span>
                  <span>absender_zeile</span>
                  <span>empfaenger</span>
                  <span>mahnstufe</span>
                  <span>titel</span>
                  <span>referenz</span>
                  <span>text</span>
                  <span>offener_betrag</span>
                  <span>frist</span>
                  <span>gruss</span>
                  <span>footer</span>
                </div>
                <p className="mt-2 text-gray-400">
                  Adresse rechts (CH Fenster). Mahnstufe rot.
                </p>
              </div>
            )}

            {templateCategory === 'layout' && (
              <div className="text-xs text-gray-500 space-y-1">
                <div className="font-semibold text-gray-600 mb-1">Header:</div>
                <div className="grid grid-cols-2 gap-1 mb-2">
                  <span>logo</span>
                  <span>organisation</span>
                  <span>titel</span>
                  <span>untertitel</span>
                </div>
                <div className="font-semibold text-gray-600 mb-1">Footer:</div>
                <div className="grid grid-cols-2 gap-1 mb-2">
                  <span>fusszeile</span>
                  <span>seitenzahl</span>
                </div>
                <div className="font-semibold text-gray-600 mb-1">Content-Zone:</div>
                <div className="grid grid-cols-2 gap-1">
                  <span>content_start_y</span>
                  <span>content_end_y</span>
                </div>
                <p className="mt-2 text-gray-400">
                  Allgemeines Layout für dynamische Listen.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Designer Area */}
        <div className="flex-1 overflow-hidden bg-gray-200 relative">
          <div
            ref={designerRef}
            className="w-full h-full"
            style={{ minHeight: '100%' }}
          />

          {/* Pingen Address Zone Overlay - direkt über dem PDF */}
          {showAddressOverlay && (
            <PingenOverlay country={showAddressOverlay} designerRef={designerRef} />
          )}
        </div>
      </div>
    </div>
  )
}

export default App
