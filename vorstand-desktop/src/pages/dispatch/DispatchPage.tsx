import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { formatSwissDateTime } from "@/lib/utils/date";
import * as dispatchApi from "@/lib/api/dispatch";
import * as membersApi from "@/lib/api/members";
import {
  generateDispatchLetterHTML,
  getAktuarAbsenderLine,
  bodyTextToHtml,
} from "@/lib/dispatch-letter";
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
} from "lucide-react";

type Tab = "send" | "templates" | "pingen" | "log";

export function DispatchPage() {
  const [activeTab, setActiveTab] = useState<Tab>("send");

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "send", label: "Senden", icon: Send },
    { key: "templates", label: "Vorlagen", icon: FileText },
    { key: "pingen", label: "Post (Pingen)", icon: Mail },
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
      {activeTab === "log" && <LogTab />}
    </div>
  );
}

/* ========== Send Tab ========== */
function SendTab() {
  const [mode, setMode] = useState<"email" | "post" | "auto" | "smart">("email");
  const [members, setMembers] = useState<Member[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [recipientType, setRecipientType] = useState<"selected" | "all" | "filter">("selected");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterEmailPref, setFilterEmailPref] = useState(false);
  const [filterPostPref, setFilterPostPref] = useState(false);
  const [emailPreferenceOnly, setEmailPreferenceOnly] = useState(false);
  const [postPreferenceOnly, setPostPreferenceOnly] = useState(false);
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
    try {
      if (doEmail && emailR.length > 0) {
        const res = await dispatchApi.sendBulkEmail({
          memberIds: emailR.map((m) => m.id),
          templateId: selectedTemplate || undefined,
          subject,
          body,
        });
        parts.push(
          `${res.sent || 0} E-Mails gesendet${res.failed ? `, ${res.failed} fehlgeschlagen` : ""}`
        );
      }
      if (doPost && postR.length > 0) {
        const senderLine = getAktuarAbsenderLine(members);
        const sourceHtml = bodyTextToHtml(body);
        let ok = 0;
        let fail = 0;
        for (let i = 0; i < postR.length; i++) {
          const m = postR[i];
          const letterHtml = generateDispatchLetterHTML(
            sourceHtml,
            subject,
            m,
            senderLine
          );
          try {
            await dispatchApi.sendPost({
              html: letterHtml,
              recipient: {
                name: `${m.vorname} ${m.nachname}`.trim(),
                street: m.strasse,
                zip: m.plz,
                city: m.ort,
                country: "CH",
              },
              member_id: m.id,
              subject: subject || "Brief",
              staging,
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

  return (
    <div className="space-y-4">
      {/* Versandart */}
      <div className="flex flex-wrap gap-2">
        {([
          ["email", "E-Mail", Mail],
          ["post", "Post", FileText],
          ["auto", "Auto (E-Mail + Post)", Send],
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
          <div>
            <label className="block text-sm font-medium mb-1">Nachricht</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            />
          </div>
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

      <button
        onClick={handleSend}
        disabled={sending}
        className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
      >
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Senden
      </button>
    </div>
  );
}

/* ========== Templates Tab ========== */
function TemplatesTab() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dispatchApi
      .getTemplates()
      .then(setTemplates)
      .catch((err) => setError(err instanceof Error ? err.message : "Fehler"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
        <AlertCircle className="h-4 w-4" />
        {error}
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p>Keine Vorlagen vorhanden</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left px-4 py-3 font-medium">Name</th>
            <th className="text-left px-4 py-3 font-medium">Typ</th>
            <th className="text-left px-4 py-3 font-medium">Betreff</th>
            <th className="text-left px-4 py-3 font-medium">Variablen</th>
          </tr>
        </thead>
        <tbody>
          {templates.map((t) => (
            <tr key={t.id} className="border-b last:border-0">
              <td className="px-4 py-3 font-medium">{t.name}</td>
              <td className="px-4 py-3 text-muted-foreground">{t.type}</td>
              <td className="px-4 py-3 text-muted-foreground">{t.subject}</td>
              <td className="px-4 py-3">
                {t.variables?.map((v) => (
                  <span
                    key={v}
                    className="inline-flex mr-1 px-1.5 py-0.5 rounded bg-muted text-xs"
                  >
                    {v}
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [acc, st, lt] = await Promise.all([
        dispatchApi.getPingenAccount(),
        dispatchApi.getPingenStats(),
        dispatchApi.getPingenLetters({ limit: 50 }),
      ]);
      setAccount(acc);
      setStats(st);
      setLetters(lt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
        <AlertCircle className="h-4 w-4" />
        {error}
        <button onClick={load} className="ml-auto text-xs underline">Erneut</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
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

      {/* Letters */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Briefe</h3>
          <button
            onClick={load}
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
                      <PingenStatusBadge status={l.status} />
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
