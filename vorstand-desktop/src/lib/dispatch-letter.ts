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

/** Absenderzeile aus dem aktuellen Aktuar (Fallback ohne Adresse). */
export function getAktuarAbsenderLine(members: Member[]): string {
  const a = members.find((m) => m.funktion && /aktuar/i.test(m.funktion));
  if (!a || !a.strasse) return "Aktuar des Feuerwehrverein Raura";
  const kurzName = `${(a.vorname || "").charAt(0)}. ${a.nachname || ""}`.trim();
  return `${kurzName}, ${a.strasse}, ${a.plz || ""} ${a.ort || ""}`.trim();
}

/**
 * Kompletter Brief im offiziellen Layout (Kopf mit Logo/Titel/Absender/
 * Empfaengeradresse im CH-Fenster + Datum, Betreff, Body, Schluss).
 * Pingen-konforme Massangaben (Adressfenster X=118mm, Y=60mm).
 */
export function generateDispatchLetterHTML(
  bodyHtml: string,
  subject: string,
  member: Member,
  senderLine: string
): string {
  const datum = new Date().toLocaleDateString("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const body = replacePlaceholders(bodyHtml || "", member);

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
/* Puppeteer: margin 0 top/sides, 20mm bottom (fuer Footer-Seitenzahlen) */
* { box-sizing: border-box; }
body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.4; color: #000; }
/* Seite-1-Header: volle 210mm Breite, absolut positionierte Elemente */
/* Schweizer Standard: Adressfenster X=118mm, Y=60mm */
.first-page-header {
    position: relative; width: 210mm; height: 110mm;
    page-break-inside: avoid; page-break-after: avoid;
}
/* Pingen-Vorgaben:
 * Randsperrbereich: 5mm rundum
 * Frankierbereich: X=116-205.5mm, Y=40-87.5mm (reserviert, KEINE Absenderzeile hier)
 * Adressbereich: X=118-203.5mm, Y=60-85.5mm (NUR Empfängeradresse)
 * Logo oben links (ausserhalb Frankierbereich X<116mm) */
.first-page-header .logo { position: absolute; top: 15mm; left: 20mm; width: 35mm; }
.first-page-header .logo img { width: 35mm; height: auto; display: block; }
/* Titel links oberhalb Frankierbereich (X<116mm und Y<40mm) */
.first-page-header .title { position: absolute; top: 15mm; left: 60mm; font-size: 20pt; font-weight: bold; line-height: 1.2; }
/* Absenderzeile: Y<40mm, links vom Frankierbereich (X<116mm) */
.first-page-header .sender { position: absolute; top: 35mm; left: 20mm; width: 90mm; font-size: 7pt; color: #555; border-bottom: 0.3pt solid #999; padding-bottom: 0.5mm; }
/* Empfängeradresse: EXAKT im Adressbereich X=118, Y=60, W=85.5, H=25.5 */
.first-page-header .recipient { position: absolute; top: 60mm; left: 118mm; width: 85.5mm; max-height: 25.5mm; overflow: hidden; }
/* Datum: unterhalb Frankierbereich (Y>87.5mm), rechts */
.first-page-header .date { position: absolute; top: 92mm; right: 20mm; text-align: right; }
/* Brieftext: 25mm links/rechts, 20mm Top-Margin auf Folgeseiten via @page */
.letter-body { padding: 0 25mm; }
.letter-body h1, .letter-body h2, .letter-body h3 { margin: 0.5em 0 0.3em 0; page-break-after: avoid; }
.letter-body p { margin: 0.5em 0; orphans: 3; widows: 3; }
.letter-closing { margin-top: 10mm; page-break-inside: avoid; }
@page :not(:first) { margin-top: 20mm; }
</style></head>
<body>
<div class="first-page-header">
    <div class="logo"><img src="https://www.fwv-raura.ch/images/logo.png" alt="FWV Raura"></div>
    <div class="title">Feuerwehrverein Raura<br>Kaiseraugst</div>
    <div class="sender">${senderLine}</div>
    <div class="recipient">
        ${letterAddressBlockHtml(member)}
    </div>
    <div class="date">Kaiseraugst, ${datum}</div>
</div>
<div class="letter-body">
    ${subject ? `<div style="font-weight: bold; font-size: 13pt;">${subject}</div><hr style="border: none; border-top: 1px solid #000; margin: 4mm 0 6mm 0;">` : ""}
    <div>${body}</div>
    <div class="letter-closing">
        Mit freundlichen Grüssen<br><br>
        <strong><em>Feuerwehrverein Raura, Kaiseraugst</em></strong><br>
        <em>Der Vorstand</em>
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
