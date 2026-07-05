// Brief-Generierung fuer den Post-Versand (/dispatch/send-post).
// 1:1-Port aus der Web-Version (docker/frontend-website/vorstand.html), damit
// Desktop-Briefe exakt dem offiziellen Layout entsprechen. Das HTML wird
// serverseitig (Puppeteer) zu PDF gerendert und via Pingen verschickt — daher
// gilt die Desktop-CSP hier NICHT (Logo laedt der Server).

import type { Member } from "@/lib/types/member";

/** {{platzhalter}} im Brief-/Mailtext durch Mitgliedsdaten ersetzen. */
export function replacePlaceholders(text: string, member: Member): string {
  if (!text) return "";
  return text
    .replace(/\{\{anrede\}\}/g, member.anrede || "")
    .replace(/\{\{vorname\}\}/g, member.vorname || "")
    .replace(/\{\{nachname\}\}/g, member.nachname || "")
    .replace(/\{\{strasse\}\}/g, member.strasse || "")
    .replace(/\{\{plz\}\}/g, member.plz || "")
    .replace(/\{\{ort\}\}/g, member.ort || "")
    .replace(/\{\{email\}\}/g, member.email || "");
}

/** Deutsche Empfaenger: PLZ beginnt mit "de" oder ist 5-stellig. */
export function isGermanRecipient(member: Member): boolean {
  const plz = (member?.plz ? String(member.plz) : "").trim();
  return /^de/i.test(plz) || /^\d{5}/.test(plz);
}

/**
 * Adresszeilen fuers Fensterkuvert. Fuer DE wird ein evtl. "DE-"-Praefix aus
 * der PLZ entfernt und eine eigene "Deutschland"-Zeile ergaenzt — so erkennt
 * Pingen aus dem PDF-Text-Layer das Zielland korrekt (country bleibt CH).
 */
export function letterAddressLines(member: Member): string[] {
  const name = `${member.vorname || ""} ${member.nachname || ""}`.trim();
  const strasse = member.strasse || "";
  const plzClean = String(member.plz || "").trim().replace(/^de[-\s]?/i, "");
  const plzOrt = `${plzClean} ${member.ort || ""}`.trim();
  const lines = [name, strasse];
  if (member.adresszusatz) lines.push(member.adresszusatz);
  lines.push(plzOrt);
  if (isGermanRecipient(member)) lines.push("Deutschland");
  return lines;
}

function letterAddressBlockHtml(member: Member): string {
  return letterAddressLines(member)
    .map((l) => `<div>${l}</div>`)
    .join("\n        ");
}

/** Zielland fuer Pingen — explizit gesetzt (kein Text-Raten mehr). */
export function recipientCountry(member: Member): "DE" | "CH" {
  return isGermanRecipient(member) ? "DE" : "CH";
}

/**
 * Positionierung des Empfaenger-Adressblocks im Fensterkuvert:
 * DE = Fenster LINKS (DIN 5008, ~20mm von links), CH = Fenster RECHTS
 * (Schweizer Standard, 118mm) — deckungsgleich mit der serverseitigen
 * addAddressToPdf-Logik. Pingen bekommt zusaetzlich address_position + country.
 */
export function recipientWindowCss(member: Member): string {
  return isGermanRecipient(member)
    ? "top: 55mm; left: 20mm; width: 85mm; max-height: 30mm;"
    : "top: 60mm; left: 118mm; width: 85.5mm; max-height: 25.5mm;";
}

/** Absenderzeile aus dem aktuellen Aktuar (Fallback ohne Adresse). */
export function getAktuarAbsenderLine(members: Member[]): string {
  const a = members.find((m) => m.funktion && /aktuar/i.test(m.funktion));
  if (!a || !a.strasse) return "Aktuar des Feuerwehrverein Raura";
  const kurzName = `${(a.vorname || "").charAt(0)}. ${a.nachname || ""}`.trim();
  return `${kurzName}, ${a.strasse}, ${a.plz || ""} ${a.ort || ""}`.trim();
}

/**
 * EINHEITLICHE Brief-Vorlage (Basis: Event-Einladungsbrief). Da Pingen alle Briefe
 * identisch annimmt, nutzen Standard- UND Event-Brief dieselbe Shell:
 * - 15mm-Oberrand-Layout (per pdf_margin {top:'15mm', bottom:'20mm'} an send-post),
 *   damit auch Folgeseiten nicht in Pingens Sperrzone laufen.
 * - Kopf absolut positioniert (Logo links, Titel/Absender rechts, Datum rechts).
 * - Body im normalen Textfluss -> sauberer Seitenumbruch bei langem Inhalt.
 * - Adressfenster: DE LINKS (DIN 5008, ~20mm), CH RECHTS (Schweizer Standard, 118mm).
 * Kopf-Koordinaten sind um 15mm nach oben verschoben (wegen des 15mm-Oberrands),
 * damit das Adressfenster exakt bei 60mm/118mm (CH) bzw. links (DE) ab Blattrand landet.
 */
export function buildLetterShell(
  member: Member,
  senderLine: string,
  bodyContentHtml: string
): string {
  const datum = new Date().toLocaleDateString("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const addrCss = isGermanRecipient(member)
    ? "top:40mm;left:20mm;"
    : "top:45mm;left:118mm;";
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  @page { size: A4; }
  body { margin: 0; padding: 0; background: white; font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.4; color: #000; }
  /* Sauberer Seitenumbruch bei langem Inhalt: keine Schusterjungen/Hurenkinder,
     Ueberschriften nicht allein am Seitenende, Tabellen/Schlussformel zusammenhalten. */
  .letter-body p { margin: 0.5em 0; orphans: 3; widows: 3; }
  .letter-body h1, .letter-body h2, .letter-body h3 { margin: 0.5em 0 0.3em 0; page-break-after: avoid; }
  .letter-body table, .letter-body tr { page-break-inside: avoid; }
  .letter-closing { page-break-inside: avoid; }
</style></head>
<body>
<div style="position:relative;height:85mm;">
    <div style="position:absolute;top:0;left:25mm;width:35mm;">
        <img src="https://www.fwv-raura.ch/images/logo.png" alt="FWV Raura" style="width:35mm;height:auto;display:block;">
    </div>
    <div style="position:absolute;top:0;left:118mm;">
        <div style="font-size:20pt;font-weight:bold;line-height:1.2;">Feuerwehrverein Raura</div>
        <div style="font-size:20pt;font-weight:bold;line-height:1.2;">Kaiseraugst</div>
    </div>
    <div style="position:absolute;top:20mm;left:118mm;font-size:8pt;color:#333;">${senderLine}</div>
    <div style="position:absolute;${addrCss}width:85mm;">
        ${letterAddressBlockHtml(member)}
    </div>
    <div style="position:absolute;top:77mm;right:25mm;text-align:right;">Kaiseraugst, ${datum}</div>
</div>
<div class="letter-body" style="padding:0 25mm 5mm 25mm;">${bodyContentHtml}</div>
</body></html>`;
}

/** Standard-Post-Brief: einheitliche Vorlage + Betreff/Body/Schluss. */
export function generateDispatchLetterHTML(
  bodyHtml: string,
  subject: string,
  member: Member,
  senderLine: string
): string {
  const body = replacePlaceholders(bodyHtml || "", member);
  const bodyContent = `${
    subject
      ? `<div style="font-weight:bold;font-size:13pt;">${subject}</div><hr style="border:none;border-top:1px solid #000;margin:4mm 0 6mm 0;">`
      : ""
  }<div>${body}</div>
    <div class="letter-closing" style="margin-top:10mm;">
        Mit freundlichen Grüssen<br><br>
        <strong><em>Feuerwehrverein Raura, Kaiseraugst</em></strong><br>
        <em>Der Vorstand</em>
    </div>`;
  return buildLetterShell(member, senderLine, bodyContent);
}

/**
 * Deckblatt fuer den PDF-Brief-Versand (/dispatch/send-pdf-post): Logo, Titel,
 * Absenderzeile, Empfaenger im CH-Fenster, Betreff + Beilage-Hinweis. Das
 * eigentliche Dokument (hochgeladenes PDF) wird serverseitig angehaengt.
 */
export function generatePdfCoverHTML(
  subject: string,
  member: Member,
  senderLine: string
): string {
  const datum = new Date().toLocaleDateString("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const anrede = member.anrede === "Frau" ? "Liebe" : "Lieber";
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>@page { size: A4; margin: 0; } body { margin: 0; padding: 0; }</style></head>
<body>
<div style="width: 210mm; height: 297mm; position: relative; box-sizing: border-box; background: white; font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.4; color: #000;">
    <div style="position: absolute; top: 15mm; left: 25mm; width: 35mm;">
        <img src="https://www.fwv-raura.ch/images/logo.png" alt="FWV Raura" style="width: 35mm; height: auto; display: block;">
    </div>
    <div style="position: absolute; top: 15mm; left: 118mm;">
        <div style="font-size: 20pt; font-weight: bold; line-height: 1.2;">Feuerwehrverein Raura</div>
        <div style="font-size: 20pt; font-weight: bold; line-height: 1.2;">Kaiseraugst</div>
    </div>
    <div style="position: absolute; top: 35mm; left: 118mm; font-size: 8pt; color: #333;">${senderLine}</div>
    <div style="position: absolute; ${recipientWindowCss(member)}">
        ${letterAddressBlockHtml(member)}
    </div>
    <div style="position: absolute; top: 97mm; right: 25mm; text-align: right;">Kaiseraugst, ${datum}</div>
    <div style="position: absolute; top: 110mm; left: 25mm; right: 25mm;">
        <div style="font-weight: bold; font-size: 14pt; margin-bottom: 3mm;">${subject || ""}</div>
        <hr style="border: none; border-top: 1.5px solid #cc0000; margin: 4mm 0 8mm 0;">
        <div style="font-size: 11pt; color: #333;">
            <p>${anrede} ${member.vorname || "{{vorname}}"},</p>
            <p>Beiliegend erhältst du das Dokument zum oben genannten Betreff.</p>
        </div>
        <div style="margin-top: 15mm;">
            Mit freundlichen Grüssen<br><br>
            <strong><em>Feuerwehrverein Raura, Kaiseraugst</em></strong><br>
            <em>Der Vorstand</em>
        </div>
        <div style="margin-top: 15mm; padding-top: 5mm; border-top: 1px solid #ddd; font-size: 9pt; color: #666;">
            Beilage: 1 Dokument
        </div>
    </div>
</div>
</body></html>`;
}

/** Plaintext-Body (Zeilen) in einfaches HTML fuer den Brief wandeln. */
export function bodyTextToHtml(text: string): string {
  return (text || "")
    .split("\n")
    .map((l) => `<p>${l || "&nbsp;"}</p>`)
    .join("");
}
