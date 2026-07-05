// Event-Einladungs-Generatoren (Brief fuer Post via Pingen + responsive E-Mail).
// 1:1-Port aus der Web-Version (docker/frontend-website/vorstand.html), damit die
// Desktop-Einladungen exakt dem offiziellen Layout entsprechen.
//
// Anders als in der Web-Version sind diese Funktionen SEITENEFFEKTFREI: sie greifen
// auf keine globalen Variablen (`members`, `qrcode`, DOM) zu. Alle aus dem frueheren
// `members`-Bestand bzw. der QR-Bibliothek stammenden Werte werden als EXPLIZITE
// Parameter uebergeben (senderLine, praesidentName, aktuarName, organizerName,
// organizerPhone, eventQrDataUrl). Der Aufrufer loest sie vorher auf.
//
// Das HTML wird serverseitig (Puppeteer -> PDF -> Pingen) bzw. per E-Mail gerendert;
// das Logo laedt der Server von www.fwv-raura.ch. Die Desktop-CSP gilt hier NICHT.

import type { Member } from "@/lib/types/member";
import {
  replacePlaceholders,
  buildLetterShell,
} from "@/lib/dispatch-letter";

/**
 * Die Event-Felder, die die Einladungs-Layouts tatsaechlich verwenden.
 *
 * Bewusst weiter (optional/nullable) getypt als src/lib/types/event.ts, damit ein
 * vollstaendiges `Event` direkt zuweisbar ist. ACHTUNG: `registration_required`
 * existiert im Web-`event`-Objekt (siehe Event-Anlage), fehlt aber aktuell im
 * Desktop-`Event`-Interface (src/lib/types/event.ts) — hier deshalb als optionales
 * Feld ergaenzt. Fehlt es zur Laufzeit, wird "Freiwillig" gerendert.
 */
export interface EventInvitationData {
  id: string;
  slug?: string | null;
  title?: string | null;
  subtitle?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  registration_deadline?: string | null;
  registration_required?: boolean | null;
  location?: string | null;
  cost?: string | null;
  description?: string | null;
}

/** Event-Datum im deutschen Langformat ("5. Juli 2026" bzw. "…, 14:30 Uhr"). */
export function formatEventDate(
  isoDate: string | null | undefined,
  includeTime = true,
): string {
  if (!isoDate) return "";
  const d = new Date(isoDate);
  const monate = [
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember",
  ];
  const datum = `${d.getDate()}. ${monate[d.getMonth()]} ${d.getFullYear()}`;
  if (!includeTime) return datum;
  const zeit = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${datum}, ${zeit} Uhr`;
}

/**
 * Ersetzt Event-spezifische Platzhalter im Text:
 * {{event_title}} {{event_date}} {{event_location}} {{organizer}} {{organizer_phone}}.
 *
 * `organizerName`/`organizerPhone` loest der Aufrufer auf (in der Web-Version macht
 * das `getEventOrganizer(event)` ueber den `members`-Bestand inkl. Aktuar-Fallback);
 * hier werden die fertig aufgeloesten Werte uebergeben.
 */
export function replaceEventPlaceholders(
  text: string,
  event: EventInvitationData,
  organizerName: string,
  organizerPhone: string,
): string {
  if (!text) return text;
  return text
    .replace(/\{\{event_title\}\}/g, event.title || "")
    .replace(/\{\{event_date\}\}/g, event.start_date ? formatEventDate(event.start_date) : "")
    .replace(/\{\{event_location\}\}/g, event.location || "")
    .replace(/\{\{organizer\}\}/g, organizerName)
    .replace(/\{\{organizer_phone\}\}/g, organizerPhone);
}

/** Oeffentliche Event-URL — Grundlage fuer den QR-Code (der Aufrufer rendert ihn). */
export function eventInvitationUrl(event: EventInvitationData): string {
  return `https://www.fwv-raura.ch/events.html?event=${event.slug || event.id}`;
}

/**
 * Event-Einladungs-Block (Titel, Tabelle Was/Wo/Wann/…, Unterschriften, QR).
 * Wird im Body sowohl von der Brief- als auch der E-Mail-Version verwendet.
 */
export function buildEventInvitationBody(
  event: EventInvitationData,
  introHtml: string,
  praesidentName: string,
  aktuarName: string,
  organizerName: string,
  organizerPhone: string,
  eventQrDataUrl?: string,
): string {
  // Event-Platzhalter im Intro-Text ersetzen
  const processedIntro = replaceEventPlaceholders(introHtml, event, organizerName, organizerPhone);
  const startDate = formatEventDate(event.start_date);
  const endDate = event.end_date ? formatEventDate(event.end_date) : "";
  const deadline = event.registration_deadline ? formatEventDate(event.registration_deadline) : "";
  const subtitle = event.subtitle || startDate;

  // QR-Code fuer Event-Link (vom Aufrufer aus eventInvitationUrl(event) erzeugt).
  const qrImg = eventQrDataUrl || "";

  // Tabellen-Zeilen (nur wenn Wert vorhanden)
  const rows = [
    `<tr><td style="font-weight:bold;padding:0.5mm 5mm 0.5mm 0;vertical-align:top;width:38mm;">Was:</td><td>${event.title || ""}</td></tr>`,
    event.location ? `<tr><td style="font-weight:bold;padding:0.5mm 5mm 0.5mm 0;vertical-align:top;">Wo:</td><td>${event.location}</td></tr>` : "",
    `<tr><td style="font-weight:bold;padding:0.5mm 5mm 0.5mm 0;vertical-align:top;">Wann:</td><td style="font-weight:bold;">${startDate}${endDate ? " – " + endDate : ""}</td></tr>`,
    `<tr><td style="font-weight:bold;padding:0.5mm 5mm 0.5mm 0;vertical-align:top;">Anmeldung:</td><td>${event.registration_required ? "Zwingend" : "Freiwillig"}</td></tr>`,
    deadline ? `<tr><td style="font-weight:bold;padding:0.5mm 5mm 0.5mm 0;vertical-align:top;color:#c00;">Anmeldeschluss:</td><td style="color:#c00;font-weight:bold;">${deadline}</td></tr>` : "",
    event.cost ? `<tr><td style="font-weight:bold;padding:0.5mm 5mm 0.5mm 0;vertical-align:top;">Kosten:</td><td>${event.cost}</td></tr>` : "",
  ].filter(Boolean).join("");

  // Event-Beschreibung als Absatz einfuegen (mit Zeilenumbruechen)
  const descriptionHtml = event.description
    ? `<div style="margin:0 0 3mm 0;white-space:pre-wrap;">${event.description}</div>`
    : "";

  return `
                <div style="font-size:13pt;font-weight:bold;text-decoration:underline;margin-bottom:1mm;">${event.title || ""}</div>
                <div style="font-size:10pt;margin-bottom:3mm;">${subtitle}</div>
                <hr style="border:none;border-top:1px solid #000;margin:0 0 3mm 0;">
                ${processedIntro ? `<div style="margin-bottom:3mm;">${processedIntro}</div>` : ""}
                ${descriptionHtml}
                <p style="margin:0 0 2mm 0;">Die wichtigsten Daten nochmals zusammengefasst:</p>
                <table style="margin:0 0 3mm 0;border-collapse:collapse;">${rows}</table>
                <p style="margin:0;">Wir freuen uns über zahlreiches Erscheinen.</p>
                <p style="margin:0 0 3mm 0;">Im Namen des Vorstandes.</p>
                <p style="margin:0 0 6mm 0;">Mit freundlichen Grüssen</p>
                <table style="width:100%;border-collapse:collapse;page-break-inside:avoid;">
                    <tr>
                        <td style="vertical-align:top;width:50%;">
                            <div>${praesidentName || "Präsident FWV Raura"}</div>
                            <div>Präsident</div>
                        </td>
                        <td style="vertical-align:top;width:30%;">
                            <div>${aktuarName || "Aktuar FWV Raura"}</div>
                            <div>Aktuar</div>
                        </td>
                        <td style="vertical-align:top;width:20%;text-align:right;">
                            ${qrImg ? `<img src="${qrImg}" alt="QR-Code Event" style="width:25mm;height:25mm;">` : ""}
                        </td>
                    </tr>
                </table>`;
}

/**
 * Event-Einladung als A4-Brief (fuer Post via Pingen).
 *
 * Kopf-Koordinaten sind um 15mm nach oben verschoben, weil Puppeteer den Brief mit
 * 15mm Oberrand rendert -> das Adressfenster landet exakt bei 60mm/118mm ab Blattrand
 * (Pingen-Rechts-Zone), und auch Folgeseiten laufen nicht in die Sperrzone.
 *
 * @param senderLine      Absenderzeile (Aktuar) — entspricht getAktuarAbsenderLine().
 * @param praesidentName  Voller Name des Praesidenten fuer den Unterschriftenblock.
 * @param aktuarName      Voller Name des Aktuars fuer den Unterschriftenblock.
 * @param organizerName   Aufgeloester Organisator-Name fuer {{organizer}}.
 * @param organizerPhone  Organisator-Telefon fuer {{organizer_phone}}.
 * @param eventQrDataUrl  Vorgerenderter Event-QR als data:-URL (optional).
 */
export function generateEventInvitationLetterHTML(
  event: EventInvitationData,
  bodyHtml: string,
  member: Member,
  senderLine: string,
  praesidentName: string,
  aktuarName: string,
  organizerName: string,
  organizerPhone: string,
  eventQrDataUrl?: string,
): string {
  const intro = replacePlaceholders(bodyHtml || "", member);
  const bodyContent = buildEventInvitationBody(
    event,
    intro,
    praesidentName,
    aktuarName,
    organizerName,
    organizerPhone,
    eventQrDataUrl,
  );
  // Einheitliche Brief-Shell (Kopf/Adressfenster/Datum + 15mm-Oberrand) — identisch
  // zum Standard-Post-Brief, da Pingen alle Briefe gleich annimmt.
  return buildLetterShell(member, senderLine, bodyContent);
}

/**
 * Event-Einladung als E-Mail (responsives Layout, kein Adressfenster).
 *
 * @param member          Empfaenger fuer {{platzhalter}}-Ersetzung, oder null (Vorschau).
 * @param senderLine      Absenderzeile (Aktuar) — entspricht getAktuarAbsenderLine().
 * @param praesidentName  Voller Name des Praesidenten fuer den Unterschriftenblock.
 * @param aktuarName      Voller Name des Aktuars fuer den Unterschriftenblock.
 * @param organizerName   Aufgeloester Organisator-Name fuer {{organizer}}.
 * @param organizerPhone  Organisator-Telefon fuer {{organizer_phone}}.
 * @param eventQrDataUrl  Vorgerenderter Event-QR als data:-URL (optional).
 */
export function generateEventInvitationEmailHTML(
  event: EventInvitationData,
  bodyHtml: string,
  member: Member | null,
  senderLine: string,
  praesidentName: string,
  aktuarName: string,
  organizerName: string,
  organizerPhone: string,
  eventQrDataUrl?: string,
): string {
  const datum = new Date().toLocaleDateString("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const intro = member ? replacePlaceholders(bodyHtml || "", member) : bodyHtml || "";
  const bodyContent = buildEventInvitationBody(
    event,
    intro,
    praesidentName,
    aktuarName,
    organizerName,
    organizerPhone,
    eventQrDataUrl,
  );

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;font-size:11pt;line-height:1.4;color:#000;">
<div style="max-width:660px;margin:0 auto;padding:20px;background:white;">
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
    <div style="font-size:8pt;color:#333;margin-bottom:15px;">${senderLine}</div>
    <div style="text-align:right;margin-bottom:20px;">Kaiseraugst, ${datum}</div>
    ${bodyContent}
</div>
</body></html>`;
}
