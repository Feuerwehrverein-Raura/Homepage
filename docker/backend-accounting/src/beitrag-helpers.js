/**
 * Helper-Funktionen fuer Mitgliedsbeitrags-Versand.
 *
 * Portiert aus docker/frontend-website/vorstand.html (~Zeile 6900-7937):
 * - buildSwissQRPayload: SPC-Format v0200 fuer Swiss QR-Bill
 * - buildQRReference / formatQRReference: Bank-Referenz auf 27 Stellen padden
 * - generateBeitragEmailHTML: A4-aehnlicher Brief fuer E-Mail-Versand
 *
 * Wird vom api-accounting send-email-bulk-Endpoint genutzt — damit Mobile
 * und Desktop Beitragsbriefe versenden koennen, ohne die ganze Render-
 * Logik clientseitig zu duplizieren.
 */

const QRCode = require('qrcode');

const BEITRAG_IBAN = 'CH6430769442492432001';

/** Pads die von der Bank gelieferte Ref-Nr. auf 27 Stellen (links mit 0). */
function buildQRReference(input) {
    const clean = (input || '').replace(/\D/g, '');
    return clean.padStart(27, '0');
}

/** Formatiert die 27-stellige QR-Referenz in 6 Gruppen "XX XXXXX XXXXX XXXXX XXXXX XXXXX". */
function formatQRReference(qrRef27) {
    const r = qrRef27.padStart(27, '0');
    return r.slice(0, 2) + ' ' + r.slice(2, 7) + ' ' + r.slice(7, 12) + ' ' +
        r.slice(12, 17) + ' ' + r.slice(17, 22) + ' ' + r.slice(22, 27);
}

/**
 * Baut den SPC-Payload fuer den Swiss QR-Bill (v0200).
 * Feldreihenfolge nach SIX Implementation Guidelines: 31 Zeilen.
 */
function buildSwissQRPayload({ iban, amount, reference, debtorName, debtorStreet, debtorPlz, debtorOrt, message }) {
    return [
        'SPC', '0200', '1',
        iban,
        // Creditor (Feuerwehrverein Raura)
        'S', 'Feuerwehrverein Raura', 'Marksteinweg 12', '', '4304', 'Giebenach', 'CH',
        // Ultimate Creditor (leer)
        '', '', '', '', '', '', '',
        // Betrag + Waehrung
        amount, 'CHF',
        // Ultimate Debtor
        'S', debtorName || '', debtorStreet || '', '', debtorPlz || '', debtorOrt || '', 'CH',
        // Zahlungsreferenz
        'QRR', reference, message || '',
        // Trailer
        'EPD'
    ].join('\n');
}

/** Generiert das QR-Code-Bild als Data-URI (PNG). */
async function renderQRDataUri(payload) {
    return await QRCode.toDataURL(payload, {
        errorCorrectionLevel: 'M',
        margin: 0,
        width: 600
    });
}

/** Kassier-Daten aus members-Liste extrahieren (analog vorstand.html getKassier). */
function getKassier(members) {
    const list = (members || []).filter(m => m.funktion && /kassier/i.test(m.funktion));
    if (list.length === 0) return null;
    const k = list[0];
    return {
        vorname: k.vorname || '',
        nachname: k.nachname || '',
        kurzName: `${(k.vorname || '').charAt(0)}. ${k.nachname || ''}`.trim(),
        strasse: k.strasse || '',
        plz: k.plz || '',
        ort: k.ort || '',
        telefon: k.telefon || '',
        mobile: k.mobile || k.telefon || ''
    };
}

function getAbsenderLine(kassier) {
    if (!kassier || !kassier.strasse) return 'Kassier des Feuerwehrverein Raura';
    return `${kassier.kurzName}, ${kassier.strasse}, ${kassier.plz} ${kassier.ort}`;
}

function getKassierFooter(kassier) {
    if (!kassier) return { left: 'Kassier des Feuerwehrverein Raura', right: '' };
    const nachVor = `${kassier.nachname} ${kassier.vorname}`.trim();
    const left = `Kassier: ${nachVor}, ${kassier.strasse}, ${kassier.plz} ${kassier.ort}` +
        (kassier.telefon ? ' Tel.' + kassier.telefon : '');
    const right = kassier.mobile ? `Nat. ${kassier.mobile}` : '';
    return { left, right };
}

function getKassierSignature(kassier) {
    return kassier?.kurzName || 'Kassier des Feuerwehrverein Raura';
}

/**
 * Generiert das HTML fuer den Beitragsbrief (E-Mail-Variante mit eingebettetem QR).
 *
 * @param member         Mitglied-Objekt mit vorname, nachname, strasse, plz, ort
 * @param payment        membership_fee_payments-Eintrag mit reference_nr, amount
 * @param settings       membership_fee_settings (year, amount, gv_date, due_date)
 * @param kassier        Kassier-Daten (siehe getKassier)
 * @param qrImgSrc       Data-URI des QR-Codes (vorgerendert)
 */
function generateBeitragEmailHTML({ member, payment, settings, kassier, qrImgSrc }) {
    const jahr = settings.year;
    const betrag = payment.amount || settings.amount;
    const betragFormatted = parseFloat(betrag).toFixed(2);
    const betragGanz = parseInt(betrag) || betrag;
    const refNr = payment.reference_nr || '';
    const qrRef27 = buildQRReference(refNr);
    const refFormatted = formatQRReference(qrRef27);
    const refShort = qrRef27.slice(-5);
    const name = `${member.nachname || ''} ${member.vorname || ''}`.trim();
    const datum = new Date().toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const gvDatum = settings.gv_date || '';
    const footer = getKassierFooter(kassier);

    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;font-size:11pt;line-height:1.4;color:#000;">
<div style="max-width:660px;margin:0 auto;padding:20px;">

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:15px;">
        <tr>
            <td width="120" valign="top">
                <img src="https://www.fwv-raura.ch/images/logo.png" alt="FWV Raura" width="110" style="display:block;">
            </td>
            <td valign="top" style="padding-left:15px;">
                <div style="font-size:20pt;font-weight:bold;line-height:1.2;">Feuerwehrverein Raura</div>
                <div style="font-size:20pt;font-weight:bold;line-height:1.2;">Kaiseraugst</div>
            </td>
        </tr>
    </table>

    <div style="font-size:8pt;color:#333;margin-bottom:5px;">${getAbsenderLine(kassier)}</div>

    <div style="text-align:right;margin-bottom:20px;">Giebenach, ${datum}</div>

    <div style="margin-bottom:12px;">Liebe Mitglieder</div>

    <div style="margin-bottom:8px;">
        Der Mitgliedsbeitrag ist wie gewohnt um diese Jahreszeit fällig.
    </div>
    <div style="margin-bottom:8px;">
        ${gvDatum ? `Die Generalversammlung vom ${gvDatum} hat beschlossen, den Beitrag auf` : 'Der Beitrag betraegt'}
        &nbsp;&nbsp;<strong>Fr. ${betragFormatted}</strong>&nbsp;&nbsp; pro Mitglied${gvDatum ? ' zu belassen' : ''}.
    </div>
    <div style="margin-bottom:12px;">
        Mir obliegt es nun traditionsgemäss Euch um die Entrichtung dieses Beitrages
        anzugehen. Ich danke Euch herzlich für eine baldige Überweisung mit beiliegendem
        Einzahlungsschein, Ref. Nr. ${refShort}
    </div>
    <div style="margin-bottom:18px;">
        Mitgliederbeitrag ${jahr}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;sFr. ${betragGanz}.-
    </div>

    <div style="margin-bottom:12px;">Mit freundlichen Grüssen</div>
    <div>
        <strong><em>Feuerwehrverein Raura, Kaiseraugst</em></strong><br>
        <em>der Kassier</em><br><br>
        ${getKassierSignature(kassier)}
    </div>

    <div style="text-align:center;font-size:7pt;color:#555;margin:25px 0 5px 0;">
        &#9660; &#9660; &#9660;&nbsp; Vor der Einzahlung abzutrennen &nbsp;&#9660; &#9660; &#9660;
    </div>
    <hr style="border:none;border-top:1px dashed #000;margin-bottom:10px;">

    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:8pt;line-height:1.4;">
        <tr>
            <td width="200" valign="top" style="border-right:1px dashed #ccc;padding-right:10px;">
                <div style="font-size:10pt;font-weight:bold;margin-bottom:8px;">Empfangsschein</div>
                <div style="font-size:6pt;font-weight:bold;margin-bottom:2px;">Konto / Zahlbar an</div>
                <div style="font-size:7pt;margin-bottom:6px;">
                    CH64 3076 9442 4924 3200 1<br>
                    Feuerwehrverein Raura<br>
                    Marksteinweg 12<br>
                    4304 Giebenach
                </div>
                <div style="font-size:6pt;font-weight:bold;margin-bottom:2px;">Referenz</div>
                <div style="font-size:7pt;margin-bottom:6px;">${refFormatted}</div>
                <div style="font-size:6pt;font-weight:bold;margin-bottom:2px;">Zahlbar durch (Name/Adresse)</div>
                <div style="border:1px solid #000;width:160px;height:50px;margin-bottom:8px;"></div>
                <table width="160"><tr>
                    <td><div style="font-size:6pt;font-weight:bold;">Währung</div><div>CHF</div></td>
                    <td align="right"><div style="font-size:6pt;font-weight:bold;">Betrag</div><div>${betragFormatted}</div></td>
                </tr></table>
                <div style="font-size:6pt;text-align:right;width:160px;margin-top:3px;">Annahmestelle</div>
            </td>

            <td width="180" valign="top" style="padding:0 10px;">
                <div style="font-size:10pt;font-weight:bold;margin-bottom:8px;">Zahlteil</div>
                ${qrImgSrc ? `<img src="${qrImgSrc}" alt="QR-Code" width="150" height="150" style="display:block;margin-bottom:8px;">` : '<div style="width:150px;height:150px;background:#f0f0f0;margin-bottom:8px;text-align:center;line-height:150px;font-size:7pt;color:#999;">QR-Code</div>'}
                <table width="160"><tr>
                    <td><div style="font-size:6pt;font-weight:bold;">Währung</div><div>CHF</div></td>
                    <td align="right"><div style="font-size:6pt;font-weight:bold;">Betrag</div><div>${betragFormatted}</div></td>
                </tr></table>
            </td>

            <td valign="top" style="padding-left:10px;">
                <div style="font-size:6pt;font-weight:bold;margin-bottom:2px;">Konto / Zahlbar an</div>
                <div style="margin-bottom:8px;">
                    CH64 3076 9442 4924 3200 1<br>
                    Feuerwehrverein Raura<br>
                    Marksteinweg 12<br>
                    4304 Giebenach
                </div>
                <div style="font-size:6pt;font-weight:bold;margin-bottom:2px;">Referenz</div>
                <div style="margin-bottom:8px;">${refFormatted}</div>
                <div style="font-size:6pt;font-weight:bold;margin-bottom:2px;">Zusätzliche Informationen</div>
                <div style="margin-bottom:2px;">Mitgliederbeitrag ${jahr}</div>
                <div style="margin-bottom:8px;">Ref. ${refShort} - ${name}</div>
                <div style="font-size:6pt;font-weight:bold;margin-bottom:2px;">Zahlbar durch (Name/Adresse)</div>
                <div style="border:1px solid #000;width:100%;height:60px;"></div>
            </td>
        </tr>
    </table>

    <div style="font-size:7pt;color:#555;margin-top:10px;">
        ${footer.left}${footer.right ? ' &nbsp; · &nbsp; ' + footer.right : ''}
    </div>

</div>
</body></html>`;
}

/**
 * Generiert das HTML-A4-Layout fuer den Beitragsbrief (Pingen-kompatibel).
 *
 * Strikte Pingen-Zonen:
 *  - Adressfenster: X=118mm Y=60mm W=85mm H=25.5mm
 *  - Frankierbereich: X=116mm Y=40mm W=89.5mm H=47.5mm (keine Inhalte)
 *  - 5mm Randsperre rundum (keine Inhalte)
 *
 * Layout 1:1 portiert aus #brief-a4-template in vorstand.html (~Zeile 2558+).
 */
function generateBeitragLetterHTML({ member, payment, settings, kassier, qrImgSrc }) {
    const jahr = settings.year;
    const betrag = payment.amount || settings.amount;
    const betragFormatted = parseFloat(betrag).toFixed(2);
    const betragGanz = parseInt(betrag) || betrag;
    const refNr = payment.reference_nr || '';
    const qrRef27 = buildQRReference(refNr);
    const refFormatted = formatQRReference(qrRef27);
    const refShort = qrRef27.slice(-5);
    const name = `${member.nachname || ''} ${member.vorname || ''}`.trim();
    const datum = new Date().toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const gvDatum = settings.gv_date || '';
    const footer = getKassierFooter(kassier);

    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>@page{size:A4;margin:0}body{margin:0;padding:0}</style>
</head>
<body>
<div style="width:210mm;height:297mm;padding:0;font-family:Arial,Helvetica,sans-serif;font-size:11pt;line-height:1.5;position:relative;box-sizing:border-box;background:white;">

    <!-- Briefkopf: Logo links, Titel rechts -->
    <div style="position:absolute;top:15mm;left:25mm;width:35mm;">
        <img src="https://www.fwv-raura.ch/images/logo.png" alt="FWV Raura" style="width:35mm;height:auto;">
    </div>
    <div style="position:absolute;top:15mm;left:118mm;">
        <div style="font-size:20pt;font-weight:bold;line-height:1.2;">Feuerwehrverein Raura</div>
        <div style="font-size:20pt;font-weight:bold;line-height:1.2;">Kaiseraugst</div>
    </div>

    <!-- Absender oberhalb Frankierbereich (Y<40mm) -->
    <div style="position:absolute;top:35mm;left:118mm;font-size:8pt;color:#333;">
        ${getAbsenderLine(kassier)}
    </div>

    <!-- Empfaenger im Adressfenster (Swiss Standard X=118mm, Y=60mm, W=85mm, H=25.5mm) -->
    <div style="position:absolute;top:60mm;left:118mm;width:85mm;height:25.5mm;">
        <span style="display:block;font-size:11pt;">${name}</span>
        <span style="display:block;font-size:11pt;">${member.strasse || ''}</span>
        <span style="display:block;font-size:11pt;">${[member.plz, member.ort].filter(Boolean).join(' ')}</span>
    </div>

    <!-- Datum rechtsbuendig -->
    <div style="position:absolute;top:87mm;right:25mm;text-align:right;">
        Giebenach, ${datum}
    </div>

    <!-- Briefinhalt: 97mm bis ~185mm -->
    <div style="position:absolute;top:97mm;left:25mm;right:25mm;font-size:11pt;line-height:1.4;">

        <div style="margin-bottom:4mm;">Liebe Mitglieder</div>

        <div style="margin-bottom:2mm;">
            Der Mitgliedsbeitrag ist wie gewohnt um diese Jahreszeit fällig.
        </div>
        <div style="margin-bottom:2mm;">
            ${gvDatum ? `Die Generalversammlung vom <strong>${gvDatum}</strong> hat beschlossen, den Beitrag auf den` : 'Der Beitrag betraegt'}
            bewährten &nbsp;&nbsp;&nbsp;&nbsp;<strong>Fr. ${betragFormatted}</strong>&nbsp;&nbsp;&nbsp;&nbsp; pro Mitglied${gvDatum ? ' zu belassen' : ''}.
        </div>

        <div style="margin-bottom:3mm;">
            Mir obliegt es nun traditionsgemäss Euch um die Entrichtung dieses Beitrages
            anzugehen. Ich danke Euch herzlich für eine baldige Überweisung mit beiliegendem
            Einzahlungsschein, Ref. Nr. ${refShort}
        </div>

        <div style="margin-bottom:6mm;">
            Mitgliederbeitrag ${jahr}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;sFr. ${betragGanz}.-
        </div>

        <div style="margin-bottom:4mm;">Mit freundlichen Grüssen</div>

        <div style="margin-bottom:0;">
            <strong><em>Feuerwehrverein Raura, Kaiseraugst</em></strong><br>
            <em>der Kassier</em><br><br>
            ${getKassierSignature(kassier)}
        </div>
    </div>

    <!-- Scherenlinie 188mm -->
    <div style="position:absolute;top:188mm;left:0;right:0;text-align:center;font-size:7pt;color:#555;letter-spacing:0.5mm;">
        &#9660; &#9660; &#9660;&nbsp; Vor der Einzahlung abzutrennen / A détacher avant le versement / Da staccare prima del versamento &nbsp;&#9660; &#9660; &#9660;
    </div>

    <!-- QR-Rechnung ab 192mm -->
    <div style="border-top:1px dashed #000;padding-top:1mm;position:absolute;top:192mm;left:0;right:0;bottom:0;padding-left:5mm;padding-right:5mm;">

        <div style="display:flex;font-size:8pt;line-height:1.4;">
            <!-- Empfangsschein -->
            <div style="width:62mm;border-right:1px dashed #ccc;padding-right:3mm;">
                <div style="font-size:10pt;font-weight:bold;margin-bottom:3mm;">Empfangsschein</div>
                <div style="font-size:6pt;font-weight:bold;margin-bottom:1mm;">Konto / Zahlbar an</div>
                <div style="font-size:7pt;margin-bottom:2mm;">
                    CH64 3076 9442 4924 3200 1<br>
                    Feuerwehrverein Raura<br>
                    Marksteinweg 12<br>
                    4304 Giebenach
                </div>
                <div style="font-size:6pt;font-weight:bold;margin-bottom:1mm;">Referenz</div>
                <div style="font-size:7pt;margin-bottom:2mm;">${refFormatted}</div>
                <div style="font-size:6pt;font-weight:bold;margin-bottom:1mm;">Zahlbar durch (Name/Adresse)</div>
                <div style="border:1px solid #000;width:50mm;height:15mm;margin-bottom:3mm;"></div>
                <div style="display:flex;justify-content:space-between;width:50mm;">
                    <div><div style="font-size:6pt;font-weight:bold;">Währung</div><div style="font-size:8pt;">CHF</div></div>
                    <div><div style="font-size:6pt;font-weight:bold;">Betrag</div><div style="font-size:8pt;">${betragFormatted}</div></div>
                </div>
                <div style="font-size:6pt;text-align:right;margin-top:1mm;width:50mm;">Annahmestelle</div>
            </div>

            <!-- Zahlteil mit QR -->
            <div style="width:51mm;padding:0 3mm;">
                <div style="font-size:10pt;font-weight:bold;margin-bottom:3mm;">Zahlteil</div>
                ${qrImgSrc
                    ? `<img src="${qrImgSrc}" style="width:40mm;height:40mm;display:block;margin-bottom:3mm;">`
                    : '<div style="width:40mm;height:40mm;background:#f9f9f9;margin-bottom:3mm;display:flex;align-items:center;justify-content:center;font-size:7pt;color:#999;">QR-Fehler</div>'}
                <div style="display:flex;justify-content:space-between;width:46mm;">
                    <div><div style="font-size:6pt;font-weight:bold;">Währung</div><div style="font-size:8pt;">CHF</div></div>
                    <div><div style="font-size:6pt;font-weight:bold;">Betrag</div><div style="font-size:8pt;">${betragFormatted}</div></div>
                </div>
            </div>

            <!-- Konto rechts -->
            <div style="flex:1;padding-left:3mm;">
                <div style="font-size:6pt;font-weight:bold;margin-bottom:1mm;">Konto / Zahlbar an</div>
                <div style="font-size:8pt;margin-bottom:3mm;">
                    CH64 3076 9442 4924 3200 1<br>
                    Feuerwehrverein Raura<br>
                    Marksteinweg 12<br>
                    4304 Giebenach
                </div>
                <div style="font-size:6pt;font-weight:bold;margin-bottom:1mm;">Referenz</div>
                <div style="font-size:8pt;margin-bottom:3mm;">${refFormatted}</div>
                <div style="font-size:6pt;font-weight:bold;margin-bottom:1mm;">Zusätzliche Informationen</div>
                <div style="font-size:8pt;margin-bottom:1mm;">Mitgliederbeitrag ${jahr}</div>
                <div style="font-size:8pt;margin-bottom:3mm;">Ref. ${refShort} - ${name}</div>
                <div style="font-size:6pt;font-weight:bold;margin-bottom:1mm;">Zahlbar durch (Name/Adresse)</div>
                <div style="border:1px solid #000;width:100%;height:18mm;margin-bottom:1mm;"></div>
            </div>
        </div>

        <!-- Footer Kassier-Info -->
        <div style="display:flex;justify-content:space-between;font-size:7pt;color:#555;margin-top:3mm;padding:0 5mm;">
            <div>${footer.left}</div>
            <div>${footer.right}</div>
        </div>
    </div>
</div>
</body></html>`;
}

/** Holt + rendert QR fuer eine Zahlung als Pingen-A4-Brief — fertiges HTML zurueck. */
async function buildBeitragLetterForPayment({ member, payment, settings, kassier }) {
    const refNr = payment.reference_nr || '';
    const qrRef27 = buildQRReference(refNr);
    const betrag = payment.amount || settings.amount;
    const betragFormatted = parseFloat(betrag).toFixed(2);
    const refShort = qrRef27.slice(-5);
    const name = `${member.nachname || ''} ${member.vorname || ''}`.trim();

    let qrImgSrc = '';
    try {
        const payload = buildSwissQRPayload({
            iban: BEITRAG_IBAN,
            amount: betragFormatted,
            reference: qrRef27,
            debtorName: name,
            debtorStreet: member.strasse || '',
            debtorPlz: member.plz || '',
            debtorOrt: member.ort || '',
            message: `Mitgliederbeitrag ${settings.year}//Ref. ${refShort} - ${name}`
        });
        qrImgSrc = await renderQRDataUri(payload);
    } catch (e) {
        console.error('QR-Code-Rendering fehlgeschlagen:', e.message);
    }

    return generateBeitragLetterHTML({ member, payment, settings, kassier, qrImgSrc });
}

/** Holt + rendert QR fuer eine Zahlung — gibt das fertige HTML zurueck. */
async function buildBeitragEmailForPayment({ member, payment, settings, kassier }) {
    const refNr = payment.reference_nr || '';
    const qrRef27 = buildQRReference(refNr);
    const betrag = payment.amount || settings.amount;
    const betragFormatted = parseFloat(betrag).toFixed(2);
    const refShort = qrRef27.slice(-5);
    const name = `${member.nachname || ''} ${member.vorname || ''}`.trim();

    let qrImgSrc = '';
    try {
        const payload = buildSwissQRPayload({
            iban: BEITRAG_IBAN,
            amount: betragFormatted,
            reference: qrRef27,
            debtorName: name,
            debtorStreet: member.strasse || '',
            debtorPlz: member.plz || '',
            debtorOrt: member.ort || '',
            message: `Mitgliederbeitrag ${settings.year}//Ref. ${refShort} - ${name}`
        });
        qrImgSrc = await renderQRDataUri(payload);
    } catch (e) {
        console.error('QR-Code-Rendering fehlgeschlagen:', e.message);
    }

    return generateBeitragEmailHTML({ member, payment, settings, kassier, qrImgSrc });
}

module.exports = {
    BEITRAG_IBAN,
    buildQRReference,
    formatQRReference,
    buildSwissQRPayload,
    renderQRDataUri,
    getKassier,
    buildBeitragEmailForPayment,
    buildBeitragLetterForPayment
};
