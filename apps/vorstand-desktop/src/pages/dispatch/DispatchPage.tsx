import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { formatSwissDateTime } from "@/lib/utils/date";
import * as dispatchApi from "@/lib/api/dispatch";
import * as membersApi from "@/lib/api/members";
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
  const [mode, setMode] = useState<"email" | "smart">("email");
  const [members, setMembers] = useState<Member[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
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

  const handleSend = async () => {
    if (selectedMembers.length === 0) {
      setError("Bitte mindestens einen Empfaenger auswaehlen");
      return;
    }
    setSending(true);
    setError(null);
    setResult(null);
    try {
      if (mode === "smart") {
        const res = await dispatchApi.smartDispatch({
          templateGroup: selectedTemplate || "default",
          memberIds: selectedMembers,
          staging,
        });
        setResult(
          `Smart Dispatch: ${res.summary?.email || 0} E-Mails, ${res.summary?.briefCh || 0} Briefe CH, ${res.summary?.briefDe || 0} Briefe DE, ${res.summary?.skipped || 0} uebersprungen`
        );
      } else {
        const res = await dispatchApi.sendBulkEmail({
          memberIds: selectedMembers,
          templateId: selectedTemplate || undefined,
          subject,
          body,
        });
        setResult(`${res.sent || 0} E-Mails gesendet, ${res.failed || 0} fehlgeschlagen`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Senden");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Mode Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode("email")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium",
            mode === "email" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
          )}
        >
          <Mail className="h-4 w-4" />
          E-Mail
        </button>
        <button
          onClick={() => setMode("smart")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium",
            mode === "smart" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
          )}
        >
          <Zap className="h-4 w-4" />
          Smart Dispatch
        </button>
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

      {/* Email fields (only for email mode) */}
      {mode === "email" && (
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

      {/* Staging toggle for smart dispatch */}
      {mode === "smart" && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={staging}
            onChange={(e) => setStaging(e.target.checked)}
            className="rounded border-input"
          />
          <span className="text-sm">Staging-Modus (keine echten Briefe)</span>
        </label>
      )}

      {/* Member Selection */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium">
            Empfaenger ({selectedMembers.length} ausgewaehlt)
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedMembers(members.map((m) => m.id))}
              className="text-xs text-primary hover:underline"
            >
              Alle
            </button>
            <button
              onClick={() => setSelectedMembers([])}
              className="text-xs text-muted-foreground hover:underline"
            >
              Keine
            </button>
          </div>
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
