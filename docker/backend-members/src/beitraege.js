// Offene Mitgliederbeitraege im eigenen Profil (November 2026).
//
// GET /members/me/beitraege: die offenen Beitraege des angemeldeten
// Mitglieds (membership_fee_payments, Status 'offen') mit allem, was der
// Einzahlungsschein braucht - Konto, Referenz, Betrag, Mitteilung und den
// Inhalt des Swiss QR Codes. Die Mitglieder-App zeigt sie unter Profil an;
// wer bezahlt hat (Kassier markiert 'bezahlt'), sieht dort nichts mehr.
//
// Der QR-Inhalt ist derselbe wie auf dem Beitragsbrief
// (backend-accounting/src/beitrag-helpers.js, buildSwissQRPayload) - gleiche
// QR-IBAN, gleiche QR-Referenz, gleiche Mitteilung, damit die Bank die
// Zahlung genauso zuordnet. Aendert sich dort etwas, hier nachziehen.
//
// Ehrenmitglieder sind beitragsbefreit: fuer sie gibt es nie etwas.
// Beitraege ohne Referenznummer (Kassier hat sie noch nicht eingetragen)
// kommen ohne QR-Code mit - das Mitglied sieht, dass etwas offen ist.

const BEITRAG_IBAN = 'CH6430769442492432001';
const EMPFAENGER = {
    name: 'Feuerwehrverein Raura',
    strasse: 'Marksteinweg 12',
    plz: '4304',
    ort: 'Giebenach',
    land: 'CH'
};

/** Brauchbare Referenz: Ziffern vorhanden und nicht nur Nullen. */
function referenzGueltig(ref) {
    const ziffern = String(ref || '').replace(/\D/g, '');
    return ziffern.length > 0 && !/^0+$/.test(ziffern);
}

/** Bank-Referenz auf 27 Stellen (links mit 0). */
function referenz27(ref) {
    return String(ref || '').replace(/\D/g, '').padStart(27, '0');
}

/** "XX XXXXX XXXXX XXXXX XXXXX XXXXX". */
function referenzFormatiert(r27) {
    return [r27.slice(0, 2), r27.slice(2, 7), r27.slice(7, 12), r27.slice(12, 17),
        r27.slice(17, 22), r27.slice(22, 27)].join(' ');
}

function ibanText(iban) {
    return String(iban).replace(/(.{4})/g, '$1 ').trim();
}

function name(m) {
    return `${m.nachname || ''} ${m.vorname || ''}`.trim();
}

/** Mitteilung wie auf dem Brief. */
function mitteilung(jahr, r27, m) {
    return `Mitgliederbeitrag ${jahr}//Ref. ${r27.slice(-5)} - ${name(m)}`;
}

/** Inhalt des Swiss QR Codes (SPC 0200), Feldfolge wie buildSwissQRPayload. */
function qrInhalt({ betrag, r27, jahr, mitglied }) {
    const m = mitglied || {};
    return [
        'SPC', '0200', '1',
        BEITRAG_IBAN,
        'S', EMPFAENGER.name, EMPFAENGER.strasse, '', EMPFAENGER.plz, EMPFAENGER.ort, EMPFAENGER.land,
        '', '', '', '', '', '', '',
        betrag.toFixed(2), 'CHF',
        'S', name(m), m.strasse || '', '', m.plz || '', m.ort || '', 'CH',
        'QRR', r27, mitteilung(jahr, r27, m),
        'EPD'
    ].join('\n');
}

/** Eine Zeile aus membership_fee_payments (+ due_date) fuer die App. */
function beitragFuerApp(zeile, mitglied) {
    const jahr = Number(zeile.year);
    const betrag = Number.parseFloat(zeile.amount);
    const mitRef = referenzGueltig(zeile.reference_nr);
    const r27 = mitRef ? referenz27(zeile.reference_nr) : null;
    const faellig = zeile.due_date instanceof Date
        ? zeile.due_date.toISOString().slice(0, 10)
        : (zeile.due_date ? String(zeile.due_date).slice(0, 10) : null);
    return {
        id: zeile.id,
        jahr,
        betrag,
        waehrung: 'CHF',
        faellig,
        iban: ibanText(BEITRAG_IBAN),
        empfaenger: [EMPFAENGER.name, EMPFAENGER.strasse, `${EMPFAENGER.plz} ${EMPFAENGER.ort}`],
        referenz: r27 ? referenzFormatiert(r27) : null,
        mitteilung: r27 ? mitteilung(jahr, r27, mitglied) : `Mitgliederbeitrag ${jahr}`,
        qr_inhalt: r27 && Number.isFinite(betrag) && betrag > 0
            ? qrInhalt({ betrag, r27, jahr, mitglied })
            : null
    };
}

function beitraegeRouten(app, { pool, mitgliedAuth, mitgliedZurAnmeldung, log = () => {} }) {
    app.get('/members/me/beitraege', mitgliedAuth, async (req, res) => {
        try {
            const m = await mitgliedZurAnmeldung(req);
            if (!m) return res.status(404).json({ error: 'Mitglied nicht gefunden' });
            if ((m.status || '') === 'Ehrenmitglied') return res.json([]);
            let zeilen;
            try {
                zeilen = (await pool.query(`
                    SELECT p.id, p.year, p.amount, p.reference_nr, s.due_date
                    FROM membership_fee_payments p
                    LEFT JOIN membership_fee_settings s ON s.year = p.year
                    WHERE p.member_id = $1 AND p.status = 'offen'
                    ORDER BY p.year`, [m.id])).rows;
            } catch (e) {
                // Tabellen legt api-accounting an; fehlen sie, ist nichts offen.
                if (e.code === '42P01') return res.json([]);
                throw e;
            }
            res.json(zeilen.map(z => beitragFuerApp(z, m)));
        } catch (error) {
            log('Fehler', { error: error.message });
            res.status(500).json({ error: error.message });
        }
    });
}

module.exports = {
    BEITRAG_IBAN, referenzGueltig, referenz27, referenzFormatiert, qrInhalt, beitragFuerApp,
    beitraegeRouten,
};
