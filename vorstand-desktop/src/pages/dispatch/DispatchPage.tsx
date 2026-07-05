import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { formatSwissDateTime } from "@/lib/utils/date";
import * as dispatchApi from "@/lib/api/dispatch";
import * as membersApi from "@/lib/api/members";
import {
  generateDispatchLetterHTML,
  generatePdfCoverHTML,
  getAktuarAbsenderLine,
  bodyTextToHtml,
  recipientCountry,
} from "@/lib/dispatch-letter";
import {
  generateEventInvitationLetterHTML,
  generateEventInvitationEmailHTML,
} from "@/lib/event-invitation";
import * as eventsApi from "@/lib/api/events";
import type { Event } from "@/lib/types/event";
import { MassPdfPage } from "@/pages/masspdf/MassPdfPage";
import { ScheduledJobsPage } from "@/pages/scheduled-jobs/ScheduledJobsPage";
import { openFile } from "@/lib/pdf";
import type {
  EmailTemplate,
  PingenAccount,
  PingenStats,
  PingenLetter,
  DispatchLogEntry,
} from "@/lib/types/dispatch";
import type { Member } from "@/lib/types/member";
import {
  Send,
  FileText,
  Mail,
  Loader2,
  AlertCircle,
  RefreshCw,
  Zap,
  Plus,
  Save,
  Pencil,
  Trash2,
  Paperclip,
  Eye,
  FileUp,
  Clock,
} from "lucide-react";

type Tab = "send" | "templates" | "pingen" | "masspdf" | "scheduled" | "log";

// Datei als base64 (ohne data:-Prefix) lesen — fuer den PDF-Brief-Versand.
function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden"));
    reader.readAsDataURL(file);
  });
}

// PDF-Blob im Standard-Viewer des Systems oeffnen (via Rust-Command, weil
// <a download> im Tauri-Webview nicht funktioniert).
async function openPdfBlob(blob: Blob, filename: string) {
  await openFile(blob, filename);
}

// Vollname eines Mitglieds mit passender Funktion (z.B. Praesident/Aktuar).
function memberFullNameByRole(members: Member[], re: RegExp): string {
  const m = members.find((x) => x.funktion && re.test(x.funktion));
  return m ? `${m.vorname || ""} ${m.nachname || ""}`.trim() : "";
}

// Einheitlicher Seitenrand fuer Briefe (Event-Vorlage): 15mm oben (Folgeseiten bleiben
// aus Pingens Sperrzone), 20mm unten. Wird an /dispatch/send-post + Vorschau durchgereicht.
const LETTER_MARGIN = { top: "15mm", right: "0", bottom: "20mm", left: "0" };

export function DispatchPage() {
  const [activeTab, setActiveTab] = useState<Tab>("send");

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "send", label: "Senden", icon: Send },
    { key: "templates", label: "Vorlagen", icon: FileText },
    { key: "pingen", label: "Post (Pingen)", icon: Mail },
    { key: "masspdf", label: "Massen-PDF", icon: FileUp },
    { key: "scheduled", label: "Geplant", icon: Clock },
    { key: "log", label: "Verlauf", icon: RefreshCw },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Versand</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "send" && <SendTab />}
      {activeTab === "templates" && <TemplatesTab />}
      {activeTab === "pingen" && <PingenTab />}
      {activeTab === "masspdf" && <MassPdfPage />}
      {activeTab === "scheduled" && <ScheduledJobsPage />}
      {activeTab === "log" && <LogTab />}
    </div>
  );
}

/* ========== Send Tab ========== */
function SendTab() {
  const [mode, setMode] = useState<"email" | "post" | "auto" | "pdf-post" | "smart">("email");
  const [members, setMembers] = useState<Member[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [recipientType, setRecipientType] = useState<"selected" | "all" | "filter">("selected");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterEmailPref, setFilterEmailPref] = useState(false);
  const [filterPostPref, setFilterPostPref] = useState(false);
  const [emailPreferenceOnly, setEmailPreferenceOnly] = useState(false);
  const [postPreferenceOnly, setPostPreferenceOnly] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [staging, setStaging] = useState(true);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    membersApi.getMembers().then(setMembers).catch(() => {});
    dispatchApi.getTemplates().then(setTemplates).catch(() => {});
    eventsApi
      .getEvents()
      .then((evs) => setEvents(evs.filter((e) => (e.status || "") !== "cancelled")))
      .catch(() => {});
  }, []);

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    const tpl = templates.find((t) => t.id === templateId);
    if (tpl) {
      setSubject(tpl.subject);
      setBody(tpl.body);
    }
  };

  const toggleMember = (id: string) => {
    setSelectedMembers((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  // Verfuegbare Status-Werte fuer den Praeferenz-Filter
  const statusOptions = useMemo(
    () => Array.from(new Set(members.map((m) => m.status).filter(Boolean))) as string[],
    [members]
  );

  // Empfaenger je nach Auswahl-Modus: alle / Praeferenz-Filter / manuell
  const baseRecipients = useMemo(() => {
    if (recipientType === "all") return members;
    if (recipientType === "filter") {
      return members.filter((m) => {
        if (filterStatus && m.status !== filterStatus) return false;
        if (filterEmailPref && !m.zustellung_email) return false;
        if (filterPostPref && !m.zustellung_post) return false;
        return true;
      });
    }
    return members.filter((m) => selectedMembers.includes(m.id));
  }, [members, recipientType, filterStatus, filterEmailPref, filterPostPref, selectedMembers]);

  // Fuer E-Mail: nur mit Adresse, optional nur mit E-Mail-Zustellpraeferenz
  const emailRecipients = useMemo(
    () =>
      baseRecipients.filter(
        (m) => m.email && (!emailPreferenceOnly || m.zustellung_email)
      ),
    [baseRecipients, emailPreferenceOnly]
  );

  // Fuer Post: nur mit vollstaendiger Adresse, optional nur Post-Praeferenz
  const postRecipients = useMemo(
    () =>
      baseRecipients.filter(
        (m) =>
          m.strasse && m.plz && m.ort && (!postPreferenceOnly || m.zustellung_post)
      ),
    [baseRecipients, postPreferenceOnly]
  );

  const handleSend = async () => {
    // Smart Dispatch: serverseitige Aufteilung (unveraendert)
    if (mode === "smart") {
      if (baseRecipients.length === 0) {
        setError("Bitte Empfaenger auswaehlen");
        return;
      }
      if (
        !window.confirm(
          `Smart Dispatch an ${baseRecipients.length} Empfaenger (Aufteilung E-Mail/Post nach Praeferenz durch den Server)?`
        )
      )
        return;
      setSending(true);
      setError(null);
      setResult(null);
      try {
        const res = await dispatchApi.smartDispatch({
          templateGroup: selectedTemplate || "default",
          memberIds: baseRecipients.map((m) => m.id),
          staging,
        });
        setResult(
          `Smart Dispatch: ${res.summary?.email || 0} E-Mails, ${res.summary?.briefCh || 0} Briefe CH, ${res.summary?.briefDe || 0} Briefe DE, ${res.summary?.skipped || 0} uebersprungen`
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fehler beim Senden");
      } finally {
        setSending(false);
      }
      return;
    }

    // PDF-Brief: Deckblatt pro Empfaenger + hochgeladenes PDF -> Pingen
    if (mode === "pdf-post") {
      if (!pdfFile) {
        setError("Bitte ein PDF auswaehlen");
        return;
      }
      if (postRecipients.length === 0) {
        setError("Keine Post-Empfaenger (vollstaendige Adresse noetig)");
        return;
      }
      if (
        !window.confirm(
          `PDF-Brief an ${postRecipients.length} Empfaenger${postPreferenceOnly ? " mit Post-Praeferenz" : ""} senden (via Pingen${staging ? ", STAGING" : ""})?`
        )
      )
        return;
      setSending(true);
      setError(null);
      setResult(null);
      try {
        const pdfBase64 = await readFileBase64(pdfFile);
        const senderLine = getAktuarAbsenderLine(members);
        let ok = 0;
        let fail = 0;
        for (let i = 0; i < postRecipients.length; i++) {
          const m = postRecipients[i];
          try {
            await dispatchApi.sendPdfPost({
              cover_html: generatePdfCoverHTML(subject, m, senderLine),
              pdf_base64: pdfBase64,
              recipient: {
                name: `${m.vorname} ${m.nachname}`.trim(),
                street: m.strasse,
                zip: m.plz,
                city: m.ort,
                country: recipientCountry(m),
              },
              member_id: m.id,
              subject: subject || "Dokument",
              staging,
            });
            ok++;
          } catch {
            fail++;
          }
          setResult(`PDF-Briefe: ${i + 1}/${postRecipients.length} verarbeitet…`);
        }
        setResult(
          `${ok} PDF-Briefe gesendet${fail ? `, ${fail} fehlgeschlagen` : ""}${staging ? " (Staging)" : ""}`
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fehler beim Senden");
      } finally {
        setSending(false);
      }
      return;
    }

    // E-Mail / Post / Auto: clientseitige Aufteilung wie in der Web-Version
    const doEmail = mode === "email" || mode === "auto";
    const doPost = mode === "post" || mode === "auto";
    // Auto-Modus: strikt nach individueller Zustellpraeferenz aufteilen
    const emailR =
      mode === "auto"
        ? baseRecipients.filter((m) => m.email && m.zustellung_email)
        : emailRecipients;
    const postR =
      mode === "auto"
        ? baseRecipients.filter(
            (m) => m.strasse && m.plz && m.ort && m.zustellung_post
          )
        : postRecipients;

    if ((doEmail ? emailR.length : 0) + (doPost ? postR.length : 0) === 0) {
      setError("Keine passenden Empfaenger");
      return;
    }

    let confirmMsg: string;
    if (mode === "auto") {
      const covered = new Set([...emailR, ...postR].map((m) => m.id)).size;
      const skipped = baseRecipients.length - covered;
      confirmMsg =
        `Versand nach Zustellpraeferenz:\n- ${emailR.length} per E-Mail\n- ${postR.length} per Post (Brief via Pingen${staging ? ", STAGING" : ""})` +
        (skipped > 0 ? `\n- ${skipped} ohne Praeferenz/Adresse (uebersprungen)` : "");
    } else if (mode === "email") {
      confirmMsg = `E-Mail an ${emailR.length} Empfaenger${emailPreferenceOnly ? " mit E-Mail-Praeferenz" : ""} senden?`;
    } else {
      confirmMsg = `Brief an ${postR.length} Empfaenger${postPreferenceOnly ? " mit Post-Praeferenz" : ""} senden (via Pingen${staging ? ", STAGING" : ""})?`;
    }
    if (!window.confirm(confirmMsg)) return;

    setSending(true);
    setError(null);
    setResult(null);
    const parts: string[] = [];
    // Event-Einladung: eigenes Layout (Brief + E-Mail) statt Standard-Layout
    const eventObj = selectedEvent
      ? events.find((e) => e.id === selectedEvent) || null
      : null;
    const senderLine = getAktuarAbsenderLine(members);
    const praesidentName = memberFullNameByRole(members, /pr[aä]sident/i);
    const aktuarName = memberFullNameByRole(members, /aktuar/i);
    const organizerName = eventObj?.organizer_name || "";
    try {
      if (doEmail && emailR.length > 0) {
        const res = await dispatchApi.sendBulkEmail(
          eventObj
            ? {
                memberIds: emailR.map((m) => m.id),
                subject: subject || `Einladung: ${eventObj.title}`,
                html: generateEventInvitationEmailHTML(
                  eventObj,
                  bodyTextToHtml(body),
                  null,
                  senderLine,
                  praesidentName,
                  aktuarName,
                  organizerName,
                  ""
                ),
              }
            : {
                memberIds: emailR.map((m) => m.id),
                templateId: selectedTemplate || undefined,
                subject,
                body,
              }
        );
        parts.push(
          `${res.sent || 0} E-Mails gesendet${res.failed ? `, ${res.failed} fehlgeschlagen` : ""}`
        );
      }
      if (doPost && postR.length > 0) {
        const sourceHtml = bodyTextToHtml(body);
        let ok = 0;
        let fail = 0;
        for (let i = 0; i < postR.length; i++) {
          const m = postR[i];
          const letterHtml = eventObj
            ? generateEventInvitationLetterHTML(
                eventObj,
                sourceHtml,
                m,
                senderLine,
                praesidentName,
                aktuarName,
                organizerName,
                ""
              )
            : generateDispatchLetterHTML(sourceHtml, subject, m, senderLine);
          try {
            await dispatchApi.sendPost({
              html: letterHtml,
              recipient: {
                name: `${m.vorname} ${m.nachname}`.trim(),
                street: m.strasse,
                zip: m.plz,
                city: m.ort,
                country: recipientCountry(m),
              },
              member_id: m.id,
              subject: subject || "Brief",
              staging,
              pdf_margin: LETTER_MARGIN,
            });
            ok++;
          } catch {
            fail++;
          }
          setResult(`Briefe: ${i + 1}/${postR.length} verarbeitet…`);
        }
        parts.push(
          `${ok} Briefe gesendet${fail ? `, ${fail} fehlgeschlagen` : ""}${staging ? " (Staging)" : ""}`
        );
      }
      setResult(parts.join(" · ") || "Nichts gesendet");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Senden");
    } finally {
      setSending(false);
    }
  };

  // Vorschau: erzeugt das echte Brief-PDF fuer den ersten Post-Empfaenger.
  const handlePreview = async () => {
    const sample =
      mode === "auto"
        ? baseRecipients.find((m) => m.strasse && m.plz && m.ort && m.zustellung_post)
        : postRecipients[0];
    if (!sample) {
      setError("Kein Post-Empfaenger fuer die Vorschau");
      return;
    }
    setError(null);
    setPreviewing(true);
    try {
      const senderLine = getAktuarAbsenderLine(members);
      const html = generateDispatchLetterHTML(
        bodyTextToHtml(body),
        subject,
        sample,
        senderLine
      );
      const blob = await dispatchApi.previewLetterPdf(html, LETTER_MARGIN);
      await openPdfBlob(blob, `Vorschau_${sample.nachname || "Brief"}.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vorschau fehlgeschlagen");
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Versandart */}
      <div className="flex flex-wrap gap-2">
        {([
          ["email", "E-Mail", Mail],
          ["post", "Post", FileText],
          ["auto", "Auto (E-Mail + Post)", Send],
          ["pdf-post", "PDF-Brief", Paperclip],
          ["smart", "Smart", Zap],
        ] as const).map(([val, lbl, Icon]) => (
          <button
            key={val}
            onClick={() => setMode(val)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium",
              mode === val
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            )}
          >
            <Icon className="h-4 w-4" />
            {lbl}
          </button>
        ))}
      </div>

      {/* Template Selection */}
      <div>
        <label className="block text-sm font-medium mb-1">Vorlage</label>
        <select
          value={selectedTemplate}
          onChange={(e) => handleTemplateSelect(e.target.value)}
          className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Keine Vorlage</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {/* Event-Einladung (optional): eigenes Layout statt Standard */}
      {(mode === "email" || mode === "post" || mode === "auto") && (
        <div>
          <label className="block text-sm font-medium mb-1">Event-Einladung (optional)</label>
          <select
            value={selectedEvent}
            onChange={(e) => setSelectedEvent(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Keine – Standard-Layout</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.title}</option>
            ))}
          </select>
          {selectedEvent && (
            <p className="text-xs text-muted-foreground mt-1">
              Es wird das Event-Einladungs-Layout (Brief + E-Mail) verwendet.
            </p>
          )}
        </div>
      )}

      {/* Betreff + Nachricht: fuer E-Mail, Post und Auto (nicht Smart) */}
      {mode !== "smart" && (
        <>
          <div>
            <label className="block text-sm font-medium mb-1">Betreff</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {mode !== "pdf-post" && (
            <div>
              <label className="block text-sm font-medium mb-1">Nachricht</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={6}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              />
            </div>
          )}
          {mode === "pdf-post" && (
            <div>
              <label className="block text-sm font-medium mb-1">PDF-Dokument (wird als Beilage mitgeschickt)</label>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                className="block text-sm"
              />
              {pdfFile && <p className="text-xs text-muted-foreground mt-1">{pdfFile.name}</p>}
            </div>
          )}
        </>
      )}

      {/* Staging (Test): kein echter Brief-/Postversand — fuer Post/Auto/Smart */}
      {mode !== "email" && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={staging}
            onChange={(e) => setStaging(e.target.checked)}
            className="rounded border-input"
          />
          <span className="text-sm">Staging-Modus (Test, keine echten Briefe)</span>
        </label>
      )}

      {/* Empfaenger-Auswahl: Modus + Filter + Liste */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Empfaenger</label>
        <div className="flex gap-2">
          {([
            ["selected", "Ausgewaehlte"],
            ["all", "Alle"],
            ["filter", "Nach Praeferenz"],
          ] as const).map(([val, lbl]) => (
            <button
              key={val}
              onClick={() => setRecipientType(val)}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium",
                recipientType === val
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              )}
            >
              {lbl}
            </button>
          ))}
        </div>

        {recipientType === "filter" && (
          <div className="space-y-2 p-3 border rounded-md">
            <div className="flex items-center gap-2">
              <label className="text-sm w-16 text-muted-foreground">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="flex-1 px-2 py-1 text-sm rounded-md border border-input bg-background"
              >
                <option value="">Alle</option>
                {statusOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={filterEmailPref} onChange={(e) => setFilterEmailPref(e.target.checked)} className="rounded border-input" />
              nur E-Mail-Praeferenz (zustellung_email)
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={filterPostPref} onChange={(e) => setFilterPostPref(e.target.checked)} className="rounded border-input" />
              nur Post-Praeferenz (zustellung_post)
            </label>
          </div>
        )}

        {recipientType === "selected" && (
          <>
            <div className="flex justify-end gap-2">
              <button onClick={() => setSelectedMembers(members.map((m) => m.id))} className="text-xs text-primary hover:underline">Alle</button>
              <button onClick={() => setSelectedMembers([])} className="text-xs text-muted-foreground hover:underline">Keine</button>
            </div>
            <div className="border rounded-md max-h-48 overflow-y-auto">
              {members.map((m) => (
                <label
                  key={m.id}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted cursor-pointer text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selectedMembers.includes(m.id)}
                    onChange={() => toggleMember(m.id)}
                    className="rounded border-input"
                  />
                  {m.vorname} {m.nachname}
                  {m.email && <span className="text-xs text-muted-foreground ml-1">({m.email})</span>}
                </label>
              ))}
            </div>
          </>
        )}

        {mode === "email" && (
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={emailPreferenceOnly} onChange={(e) => setEmailPreferenceOnly(e.target.checked)} className="rounded border-input" />
            Nur an Empfaenger mit E-Mail-Zustellpraeferenz senden
          </label>
        )}

        {mode === "post" && (
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={postPreferenceOnly} onChange={(e) => setPostPreferenceOnly(e.target.checked)} className="rounded border-input" />
            Nur an Empfaenger mit Post-Zustellpraeferenz senden
          </label>
        )}

        <p className="text-xs text-muted-foreground">
          {mode === "email" &&
            `${emailRecipients.length} per E-Mail` +
              (baseRecipients.length !== emailRecipients.length
                ? ` (${baseRecipients.length - emailRecipients.length} ohne Adresse/Praeferenz uebersprungen)`
                : "")}
          {mode === "post" &&
            `${postRecipients.length} per Post` +
              (baseRecipients.length !== postRecipients.length
                ? ` (${baseRecipients.length - postRecipients.length} ohne Adresse/Praeferenz uebersprungen)`
                : "")}
          {mode === "auto" &&
            `${baseRecipients.filter((m) => m.email && m.zustellung_email).length} per E-Mail, ${baseRecipients.filter((m) => m.strasse && m.plz && m.ort && m.zustellung_post).length} per Post (nach Praeferenz)`}
          {mode === "smart" && `${baseRecipients.length} Empfaenger`}
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {result && (
        <div className="p-3 rounded-md bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400 text-sm">
          {result}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleSend}
          disabled={sending}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Senden
        </button>
        {(mode === "post" || mode === "auto") && (
          <button
            onClick={handlePreview}
            disabled={previewing}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 disabled:opacity-50"
            title="Brief-PDF fuer den ersten Post-Empfaenger als Vorschau laden"
          >
            {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
            Vorschau
          </button>
        )}
      </div>
    </div>
  );
}

/* ========== Templates Tab (CRUD) ========== */
interface TemplateForm {
  id: string | null;
  name: string;
  type: string;
  subject: string;
  body: string;
  variables: string;
}

function TemplatesTab() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateForm | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    dispatchApi
      .getTemplates()
      .then(setTemplates)
      .catch((err) => setError(err instanceof Error ? err.message : "Fehler"))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, []);

  const openNew = () =>
    setForm({ id: null, name: "", type: "email", subject: "", body: "", variables: "" });
  const openEdit = (t: EmailTemplate) =>
    setForm({
      id: t.id,
      name: t.name,
      type: t.type,
      subject: t.subject,
      body: t.body,
      variables: (t.variables || []).join(", "),
    });

  const handleSave = async () => {
    if (!form || !form.name.trim()) {
      setError("Name erforderlich");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      name: form.name.trim(),
      type: form.type.trim() || "email",
      subject: form.subject,
      body: form.body,
      variables: form.variables
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    };
    try {
      if (form.id) await dispatchApi.updateTemplate(form.id, payload);
      else await dispatchApi.createTemplate(payload);
      setForm(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (t: EmailTemplate) => {
    if (!window.confirm(`Vorlage "${t.name}" loeschen?`)) return;
    try {
      await dispatchApi.deleteTemplate(t.id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Loeschen fehlgeschlagen");
    }
  };

  const inputCls =
    "w-full px-2 py-1.5 text-sm rounded-md border border-input bg-background";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Vorlagen</h3>
        <button
          onClick={openNew}
          className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Neu
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {form && (
        <div className="space-y-3 p-4 border rounded-lg bg-card">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Typ</label>
              <input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="email / brief / ..." className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Betreff</label>
            <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Inhalt</label>
            <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={5} className={cn(inputCls, "resize-y")} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Variablen (kommagetrennt)</label>
            <input value={form.variables} onChange={(e) => setForm({ ...form, variables: e.target.value })} placeholder="vorname, nachname" className={inputCls} />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Speichern
            </button>
            <button onClick={() => setForm(null)} className="px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80">
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : templates.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Keine Vorlagen vorhanden</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Typ</th>
                <th className="text-left px-4 py-3 font-medium">Betreff</th>
                <th className="text-right px-4 py-3 font-medium">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{t.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.type}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.subject}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openEdit(t)} className="p-1 rounded hover:bg-muted" title="Bearbeiten">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(t)} className="p-1 rounded hover:bg-muted text-destructive" title="Loeschen">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ========== Pingen Tab ========== */
function PingenTab() {
  const [account, setAccount] = useState<PingenAccount | null>(null);
  const [stats, setStats] = useState<PingenStats | null>(null);
  const [letters, setLetters] = useState<PingenLetter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staging, setStaging] = useState(false);
  // Einzelbrief (manueller Versand an ein Mitglied)
  const [members, setMembers] = useState<Member[]>([]);
  const [singleMember, setSingleMember] = useState("");
  const [singleSubject, setSingleSubject] = useState("");
  const [singleBody, setSingleBody] = useState("");
  const [singleSending, setSingleSending] = useState(false);
  const [singleResult, setSingleResult] = useState<string | null>(null);
  // Webhooks (automatische Status-Updates)
  const [webhooks, setWebhooks] = useState<dispatchApi.PingenWebhook[]>([]);
  const [webhookBusy, setWebhookBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const load = async (stg = staging) => {
    setLoading(true);
    setError(null);
    try {
      const [acc, st, lt] = await Promise.all([
        dispatchApi.getPingenAccount(stg),
        dispatchApi.getPingenStats(),
        dispatchApi.getPingenLetters({ limit: 50 }),
      ]);
      setAccount(acc);
      setStats(st);
      setLetters(lt);
      void syncPending(lt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadWebhooks();
    membersApi.getMembers().then(setMembers).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleStaging = () => {
    const next = !staging;
    setStaging(next);
    load(next);
    loadWebhooks(next);
  };

  const loadWebhooks = async (stg = staging) => {
    try {
      setWebhooks(await dispatchApi.getPingenWebhooks(stg));
    } catch {
      setWebhooks([]);
    }
  };

  const handleRegisterWebhook = async () => {
    setWebhookBusy(true);
    setError(null);
    try {
      await dispatchApi.registerPingenWebhook(staging);
      await loadWebhooks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Webhook-Registrierung fehlgeschlagen");
    } finally {
      setWebhookBusy(false);
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    if (!window.confirm("Webhook loeschen?")) return;
    setWebhookBusy(true);
    try {
      await dispatchApi.deletePingenWebhook(id, staging);
      await loadWebhooks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Loeschen fehlgeschlagen");
    } finally {
      setWebhookBusy(false);
    }
  };

  const handleSingleSend = async () => {
    if (!singleMember) {
      setError("Bitte Mitglied auswaehlen");
      return;
    }
    setSingleSending(true);
    setError(null);
    setSingleResult(null);
    try {
      const res = await dispatchApi.sendPingenManual({
        memberId: singleMember,
        subject: singleSubject || "Brief",
        body: singleBody,
        staging,
      });
      setSingleResult(
        `Brief erstellt${res.letterId ? ` (${res.letterId})` : ""}${staging ? " – Staging" : ""}`
      );
      setSingleBody("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Versand fehlgeschlagen");
    } finally {
      setSingleSending(false);
    }
  };

  const refreshStatus = async (letterId: string) => {
    try {
      const s = await dispatchApi.getPingenLetterStatus(letterId);
      setLetters((prev) =>
        prev.map((l) => (l.id === letterId ? { ...l, status: s.status } : l))
      );
    } catch {
      // Status-Refresh still ignorieren
    }
  };

  // Offene Briefe beim Laden automatisch mit Pingen abgleichen (Live-Status),
  // da Pingen-Webhooks faktisch keine Events liefern.
  const syncPending = async (lts: PingenLetter[]) => {
    const finalStates = ["sent", "failed", "canceled", "cancelled", "delivered"];
    const pending = lts.filter(
      (l) => !finalStates.includes((l.status || "").toLowerCase())
    );
    if (pending.length === 0) return;
    setSyncing(true);
    try {
      for (const l of pending.slice(0, 30)) {
        await refreshStatus(l.id);
      }
    } finally {
      setSyncing(false);
    }
  };

  const inputCls =
    "w-full px-2 py-1.5 text-sm rounded-md border border-input bg-background";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Staging-Umschalter + Fehler */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={staging} onChange={toggleStaging} className="rounded border-input" />
          Staging-Konto anzeigen
        </label>
        <button onClick={() => load()} disabled={syncing} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">
          <RefreshCw className={cn("h-3 w-3", syncing && "animate-spin")} />
          {syncing ? "Synchronisiere Status…" : "Aktualisieren"}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Account & Stats */}
      <div className="grid grid-cols-2 gap-4">
        {account && (
          <div className="rounded-lg border bg-card p-4">
            <h3 className="font-semibold text-sm mb-3">Konto</h3>
            <p className="text-2xl font-bold">
              {account.balance.toFixed(2)} {account.currency}
            </p>
            {account.name && <p className="text-sm text-muted-foreground">{account.name}</p>}
            {account.isStaging && (
              <span className="inline-flex mt-2 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                Staging
              </span>
            )}
          </div>
        )}
        {stats && (
          <div className="rounded-lg border bg-card p-4">
            <h3 className="font-semibold text-sm mb-3">Statistiken</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-muted-foreground">Total:</span> {stats.total}</div>
              <div><span className="text-muted-foreground">Gesendet:</span> {stats.sent}</div>
              <div><span className="text-muted-foreground">Ausstehend:</span> {stats.pending}</div>
              <div><span className="text-muted-foreground">Fehlgeschlagen:</span> {stats.failed}</div>
              <div><span className="text-muted-foreground">7 Tage:</span> {stats.last7Days}</div>
              <div><span className="text-muted-foreground">30 Tage:</span> {stats.last30Days}</div>
            </div>
          </div>
        )}
      </div>

      {/* Einzelbrief senden (manuell an ein Mitglied) */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <h3 className="font-semibold text-sm">Einzelbrief senden</h3>
        <div className="grid grid-cols-2 gap-3">
          <select value={singleMember} onChange={(e) => setSingleMember(e.target.value)} className={inputCls}>
            <option value="">Mitglied waehlen…</option>
            {members
              .filter((m) => m.strasse && m.plz && m.ort)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.vorname} {m.nachname}
                </option>
              ))}
          </select>
          <input value={singleSubject} onChange={(e) => setSingleSubject(e.target.value)} placeholder="Betreff" className={inputCls} />
        </div>
        <textarea value={singleBody} onChange={(e) => setSingleBody(e.target.value)} rows={4} placeholder="Nachricht…" className={cn(inputCls, "resize-y")} />
        {singleResult && (
          <div className="p-2 rounded-md bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400 text-sm">
            {singleResult}
          </div>
        )}
        <button onClick={handleSingleSend} disabled={singleSending} className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
          {singleSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Brief senden{staging ? " (Staging)" : ""}
        </button>
      </div>

      {/* Webhooks (automatische Status-Updates) */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Webhooks (auto. Status-Updates)</h3>
          <button onClick={handleRegisterWebhook} disabled={webhookBusy} className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 disabled:opacity-50">
            <Plus className="h-4 w-4" /> Registrieren
          </button>
        </div>
        {webhooks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Kein Webhook registriert.</p>
        ) : (
          <ul className="space-y-1">
            {webhooks.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-2 text-sm border rounded px-3 py-1.5">
                <span className="truncate text-muted-foreground">{w.attributes?.url || w.id}</span>
                <button onClick={() => handleDeleteWebhook(w.id)} disabled={webhookBusy} className="p-1 rounded hover:bg-muted text-destructive shrink-0" title="Loeschen">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Letters */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Briefe</h3>
          <button
            onClick={() => load()}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="h-3 w-3" />
            Aktualisieren
          </button>
        </div>
        {letters.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">Keine Briefe</div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium">Betreff</th>
                  <th className="text-left px-4 py-3 font-medium">Empfaenger</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Datum</th>
                </tr>
              </thead>
              <tbody>
                {letters.map((l) => (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium">{l.subject}</td>
                    <td className="px-4 py-3 text-muted-foreground">{l.member_name || "-"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <PingenStatusBadge status={l.status} />
                        <button onClick={() => refreshStatus(l.id)} title="Status aktualisieren" className="p-0.5 rounded hover:bg-muted text-muted-foreground">
                          <RefreshCw className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatSwissDateTime(l.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function PingenStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    sent: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };
  return (
    <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-medium", colors[status] || "bg-muted text-muted-foreground")}>
      {status}
    </span>
  );
}

/* ========== Log Tab ========== */
function LogTab() {
  const [logs, setLogs] = useState<DispatchLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await dispatchApi.getDispatchLog({
        type: typeFilter || undefined,
        limit: 100,
      });
      setLogs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [typeFilter]);

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex gap-2">
        {["", "email", "pingen", "smart"].map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
              typeFilter === t
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            )}
          >
            {t || "Alle"}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && logs.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">Keine Eintraege</div>
      )}

      {!loading && logs.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium">Typ</th>
                <th className="text-left px-4 py-3 font-medium">Empfaenger</th>
                <th className="text-left px-4 py-3 font-medium">Betreff</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Datum</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded bg-muted text-xs font-medium">{l.type}</span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{l.member_name || "-"}</td>
                  <td className="px-4 py-3">{l.subject || "-"}</td>
                  <td className="px-4 py-3">
                    <LogStatusBadge status={l.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatSwissDateTime(l.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LogStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    sent: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    success: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    error: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };
  return (
    <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-medium", colors[status] || "bg-muted text-muted-foreground")}>
      {status}
    </span>
  );
}
