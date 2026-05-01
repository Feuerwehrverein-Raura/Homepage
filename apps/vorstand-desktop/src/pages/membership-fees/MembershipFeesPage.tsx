import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import * as feesApi from "@/lib/api/membership-fees";
import type {
  MembershipFeePayment,
  MembershipFeeSummary,
} from "@/lib/types/membership-fee";
import {
  Wallet,
  Loader2,
  AlertCircle,
  CheckCircle,
  RotateCcw,
  Search,
  Settings as SettingsIcon,
  PlayCircle,
  Mail,
  Send,
  MoreHorizontal,
  Clock,
} from "lucide-react";
import * as scheduledJobsApi from "@/lib/api/scheduled-jobs";
import { FeeSettingsDialog } from "./FeeSettingsDialog";

const statusFilters = [
  { value: "", label: "Alle" },
  { value: "offen", label: "Offen" },
  { value: "bezahlt", label: "Bezahlt" },
];

function formatChf(raw: string | null | undefined): string {
  const v = raw ? Number(raw) : 0;
  if (Number.isNaN(v)) return raw ?? "0";
  if (Number.isInteger(v)) return v.toLocaleString("de-CH");
  return v.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function MembershipFeesPage() {
  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(() => Array.from({ length: 5 }, (_, i) => currentYear - i), [currentYear]);

  const [year, setYear] = useState(currentYear);
  const [payments, setPayments] = useState<MembershipFeePayment[]>([]);
  const [summary, setSummary] = useState<MembershipFeeSummary | null>(null);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendingPost, setSendingPost] = useState(false);
  const [singleSendId, setSingleSendId] = useState<string | null>(null);
  const [singleMenuId, setSingleMenuId] = useState<string | null>(null);
  /** Lokal getrackte Ref-Drafts pro Zahlungs-ID — werden beim Blur gespeichert. */
  const [refDrafts, setRefDrafts] = useState<Record<string, string>>({});
  const [refSavingId, setRefSavingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [paymentsData, summaryData] = await Promise.all([
        feesApi.listPayments(year),
        feesApi.getSummary(year),
      ]);
      setPayments(paymentsData);
      setSummary(summaryData);
      // Drafts mit den frischen Server-Werten initialisieren
      const drafts: Record<string, string> = {};
      paymentsData.forEach((p) => { drafts[p.id] = p.reference_nr ?? ""; });
      setRefDrafts(drafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return payments.filter((p) => {
      if (filter && p.status !== filter) return false;
      if (!needle) return true;
      const fullName = `${p.vorname ?? ""} ${p.nachname ?? ""}`.toLowerCase();
      return fullName.includes(needle) || (p.email ?? "").toLowerCase().includes(needle);
    });
  }, [payments, filter, search]);

  const handleToggle = async (p: MembershipFeePayment) => {
    const isPaid = p.status === "bezahlt";
    const name = [p.vorname, p.nachname].filter(Boolean).join(" ") || "diese Zahlung";
    const confirmMsg = isPaid
      ? `Zahlung von ${name} auf "offen" zurücksetzen?`
      : `Zahlung von ${name} als bezahlt markieren?`;
    if (!confirm(confirmMsg)) return;

    setActionId(p.id);
    try {
      if (isPaid) await feesApi.markUnpaid(p.id);
      else await feesApi.markPaid(p.id, {});
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setActionId(null);
    }
  };

  const handleRefBlur = async (p: MembershipFeePayment) => {
    const value = (refDrafts[p.id] ?? "").trim();
    if (value === (p.reference_nr ?? "")) return; // unveraendert
    setRefSavingId(p.id);
    try {
      await feesApi.setReference(p.id, value);
      // Lokal sofort aktualisieren ohne reload
      setPayments((prev) => prev.map((x) => x.id === p.id ? { ...x, reference_nr: value } : x));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern der Referenz");
    } finally {
      setRefSavingId(null);
    }
  };

  const handleScheduleBulk = async (channel: "email" | "post") => {
    const channelLabel = channel === "email" ? "E-Mail" : "Brief";
    // Browser-prompt fuer ISO-DateTime — Default = morgen 09:00.
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    const tzOffset = -tomorrow.getTimezoneOffset();
    const pad = (n: number) => String(n).padStart(2, "0");
    const defaultLocal =
      `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T` +
      `${pad(tomorrow.getHours())}:${pad(tomorrow.getMinutes())}`;
    const input = prompt(
      `${channelLabel}-Versand für ${year} planen.\n\nWann soll gesendet werden? (Format YYYY-MM-DDTHH:MM, lokale Zeit)`,
      defaultLocal
    );
    if (!input) return;
    let scheduledAt: string;
    try {
      const d = new Date(input);
      if (isNaN(d.getTime())) throw new Error("Ungültiges Datum");
      // ISO mit Timezone-Offset bauen
      const sign = tzOffset >= 0 ? "+" : "-";
      const off = Math.abs(tzOffset);
      const tzStr = `${sign}${pad(Math.floor(off / 60))}:${pad(off % 60)}`;
      scheduledAt = input.length === 16 ? `${input}:00${tzStr}` : d.toISOString();
    } catch (err) {
      alert(`Ungültiges Datum: ${err instanceof Error ? err.message : ""}`);
      return;
    }
    try {
      await scheduledJobsApi.createJob({
        action: channel === "email" ? "membership_fees_email_bulk" : "membership_fees_post_bulk",
        payload: { year },
        label: `Beitrag ${channelLabel}-Versand ${year}`,
        scheduled_at: scheduledAt,
      });
      alert(`${channelLabel}-Versand für ${year} geplant.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Planen fehlgeschlagen");
    }
  };

  const handleSendSingle = async (p: MembershipFeePayment, channel: "email" | "post") => {
    setSingleMenuId(null);
    setSingleSendId(p.id);
    setError(null);
    try {
      await feesApi.sendSingle(p.id, channel);
      const name = [p.vorname, p.nachname].filter(Boolean).join(" ") || "Mitglied";
      const label = channel === "email" ? "E-Mail" : "Brief";
      alert(`${label} an ${name} versendet.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Versand fehlgeschlagen");
    } finally {
      setSingleSendId(null);
    }
  };

  const handleSendPostBulk = async () => {
    const candidates = payments.filter((p) =>
      p.status === "offen" &&
      (p.strasse ?? "").trim() !== "" &&
      (p.plz ?? "").trim() !== "" &&
      (p.ort ?? "").trim() !== "" &&
      (p.reference_nr ?? "").trim() !== "" &&
      p.member_status !== "Ehrenmitglied"
    );
    const withoutRef = payments.filter((p) =>
      p.status === "offen" &&
      p.member_status !== "Ehrenmitglied" &&
      (p.reference_nr ?? "").trim() === ""
    );
    if (candidates.length === 0) {
      alert(`Keine offenen Beiträge für Brief-Versand in ${year} (Filter: vollständige Adresse + Ref-Nr).`);
      return;
    }
    const warning = withoutRef.length > 0
      ? `\n\n⚠ ${withoutRef.length} weitere Mitglieder haben keine Referenznummer und werden NICHT versendet.`
      : "";
    const ok = confirm(
      `Brief-Versand via Pingen an ${candidates.length} Mitglieder?\n\n` +
      `Beitragsbrief für ${year} wird per Post an alle offenen Mitglieder mit Zustellpräferenz Post versendet. Ehrenmitglieder ausgenommen.${warning}\n\n` +
      `Kostenpunkt: ca. CHF 1.– pro Brief.`
    );
    if (!ok) return;

    setSendingPost(true);
    setError(null);
    try {
      const r = await feesApi.sendPostBulk(year);
      alert(
        `Brief-Versand abgeschlossen.\n\n` +
        `${r.success} versendet, ${r.failed} fehlgeschlagen (von ${r.candidates} Empfängern).`
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Brief-Versand");
    } finally {
      setSendingPost(false);
    }
  };

  const handleSendEmailBulk = async () => {
    const candidates = payments.filter((p) =>
      p.status === "offen" &&
      (p.email ?? "").trim() !== "" &&
      (p.reference_nr ?? "").trim() !== "" &&
      p.member_status !== "Ehrenmitglied"
    );
    const withoutRef = payments.filter((p) =>
      p.status === "offen" &&
      p.member_status !== "Ehrenmitglied" &&
      (p.reference_nr ?? "").trim() === ""
    );
    if (candidates.length === 0) {
      alert(`Keine offenen Beiträge mit E-Mail-Adresse und Referenznummer für ${year}.`);
      return;
    }
    const warning = withoutRef.length > 0
      ? `\n\n⚠ ${withoutRef.length} weitere Mitglieder haben keine Referenznummer und werden NICHT versendet (QR-Rechnung wäre unbrauchbar).`
      : "";
    const ok = confirm(
      `E-Mail an ${candidates.length} Mitglieder?\n\n` +
      `Beitragsbrief für ${year} wird per E-Mail an alle offenen Mitglieder mit Zustellpräferenz E-Mail versendet. Ehrenmitglieder ausgenommen.${warning}`
    );
    if (!ok) return;

    setSendingEmail(true);
    setError(null);
    try {
      const r = await feesApi.sendEmailBulk(year);
      alert(
        `E-Mail-Versand abgeschlossen.\n\n` +
        `${r.success} versendet, ${r.failed} fehlgeschlagen (von ${r.candidates} Empfängern).`
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim E-Mail-Versand");
    } finally {
      setSendingEmail(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const settings = await feesApi.getSettings(year);
      if (!settings || !settings.amount) {
        setError(`Für ${year} sind noch keine Beitragseinstellungen gespeichert. Zuerst über "Einstellungen" Betrag und Datum festlegen.`);
        return;
      }
      const ok = confirm(
        `Beitragslauf für ${year} erstellen?\n\n` +
        `Erstellt für jedes Aktiv-/Passivmitglied einen Eintrag mit CHF ${formatChf(settings.amount)}. ` +
        `Bestehende Einträge bleiben unverändert. Ehrenmitglieder werden ausgenommen.`
      );
      if (!ok) return;
      const r = await feesApi.generatePayments(year, settings.amount);
      alert(`${r.created} neu, ${r.skipped} bestehend (von ${r.total} Mitgliedern).`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Erstellen des Beitragslaufs");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Mitgliedsbeiträge</h1>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setSettingsOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-input bg-background text-sm hover:bg-accent"
          >
            <SettingsIcon className="h-4 w-4" />
            Einstellungen
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-input bg-background text-sm hover:bg-accent disabled:opacity-50"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PlayCircle className="h-4 w-4" />
            )}
            Beitragslauf
          </button>
          <button
            onClick={handleSendEmailBulk}
            disabled={sendingEmail}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-input bg-background text-sm hover:bg-accent disabled:opacity-50"
          >
            {sendingEmail ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            E-Mail-Versand
          </button>
          <button
            onClick={handleSendPostBulk}
            disabled={sendingPost}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
          >
            {sendingPost ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Brief-Versand
          </button>
          <div className="relative">
            <button
              onClick={() => {
                const choice = prompt('Welcher Versand soll geplant werden? "email" oder "post"', "email");
                if (choice === "email" || choice === "post") handleScheduleBulk(choice);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-input bg-background text-sm hover:bg-accent"
              title="Versand planen statt sofort senden"
            >
              <Clock className="h-4 w-4" />
              Planen
            </button>
          </div>
        </div>
      </div>

      {/* Jahr-Picker */}
      <div className="flex items-center gap-2 mb-4">
        <label className="text-sm text-muted-foreground">Jahr:</label>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="px-3 py-1.5 rounded-md border border-input bg-background text-sm"
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Stats */}
      {summary && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <StatCard label="Total" value={summary.total} sub={`CHF ${formatChf(summary.total_amount)}`} />
          <StatCard
            label="Bezahlt"
            value={summary.paid}
            sub={`CHF ${formatChf(summary.paid_amount)}`}
            tone="paid"
          />
          <StatCard
            label="Offen"
            value={summary.open}
            sub={`CHF ${formatChf(summary.open_amount)}`}
            tone="open"
          />
        </div>
      )}

      {/* Filter + Suche */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex gap-1">
          {statusFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                filter === f.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suche nach Name oder E-Mail"
            className="w-full pl-8 pr-3 py-1.5 rounded-md border border-input bg-background text-sm"
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 mb-4 rounded-md bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Wallet className="h-12 w-12 mb-3 opacity-30" />
          <p>Keine Beitragseinträge für dieses Jahr.</p>
        </div>
      )}

      {/* Tabelle */}
      {!loading && filtered.length > 0 && (
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Mitglied</th>
                <th className="text-left px-4 py-2 font-medium">Betrag</th>
                <th className="text-left px-4 py-2 font-medium">Referenz</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-left px-4 py-2 font-medium">Bezahlt am</th>
                <th className="text-right px-4 py-2 font-medium">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const isPaid = p.status === "bezahlt";
                const name = [p.nachname, p.vorname].filter(Boolean).join(", ") || "(unbekannt)";
                const paidDate = p.paid_date ? p.paid_date.substring(0, 10) : "—";
                return (
                  <tr key={p.id} className="border-t hover:bg-muted/20">
                    <td className="px-4 py-2">
                      <div className="font-medium">{name}</div>
                      {p.email && <div className="text-xs text-muted-foreground">{p.email}</div>}
                    </td>
                    <td className="px-4 py-2">CHF {formatChf(p.amount)}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={refDrafts[p.id] ?? ""}
                          onChange={(e) =>
                            setRefDrafts((d) => ({ ...d, [p.id]: e.target.value }))
                          }
                          onBlur={() => handleRefBlur(p)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                          disabled={isPaid}
                          placeholder="—"
                          className="w-44 font-mono text-xs px-2 py-1 rounded-md border border-input bg-background disabled:opacity-50"
                        />
                        {refSavingId === p.id && (
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <FeeStatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{paidDate}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => handleToggle(p)}
                          disabled={actionId === p.id}
                          className={cn(
                            "inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium",
                            isPaid
                              ? "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                              : "bg-green-600 text-white hover:bg-green-700",
                            "disabled:opacity-50"
                          )}
                        >
                          {actionId === p.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : isPaid ? (
                            <RotateCcw className="h-3 w-3" />
                          ) : (
                            <CheckCircle className="h-3 w-3" />
                          )}
                          {isPaid ? "Zurücksetzen" : "Bezahlt"}
                        </button>

                        {!isPaid && (p.reference_nr ?? "").trim() !== "" && (
                          <div className="relative">
                            <button
                              onClick={() => setSingleMenuId(singleMenuId === p.id ? null : p.id)}
                              disabled={singleSendId === p.id}
                              className="p-1 rounded-md hover:bg-accent disabled:opacity-50"
                              title="Einzelversand"
                            >
                              {singleSendId === p.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <MoreHorizontal className="h-4 w-4" />
                              )}
                            </button>
                            {singleMenuId === p.id && (
                              <>
                                <div
                                  className="fixed inset-0 z-10"
                                  onClick={() => setSingleMenuId(null)}
                                />
                                <div className="absolute right-0 mt-1 w-44 rounded-md border bg-popover shadow-md z-20 py-1 text-sm">
                                  <button
                                    onClick={() => handleSendSingle(p, "email")}
                                    disabled={!(p.email ?? "").trim()}
                                    className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <Mail className="h-3 w-3" />
                                    E-Mail senden
                                  </button>
                                  <button
                                    onClick={() => handleSendSingle(p, "post")}
                                    disabled={!(p.strasse ?? "").trim() || !(p.plz ?? "").trim() || !(p.ort ?? "").trim()}
                                    className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <Send className="h-3 w-3" />
                                    Brief senden
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {settingsOpen && (
        <FeeSettingsDialog
          year={year}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => {
            setSettingsOpen(false);
          }}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub?: string;
  tone?: "paid" | "open";
}) {
  const toneClass =
    tone === "paid"
      ? "text-green-700 dark:text-green-400"
      : tone === "open"
      ? "text-amber-700 dark:text-amber-400"
      : "";
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className={cn("text-3xl font-bold", toneClass)}>{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function FeeStatusBadge({ status }: { status: string | null }) {
  const colors: Record<string, string> = {
    bezahlt: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    offen: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  };
  const label = status === "bezahlt" ? "Bezahlt" : status === "offen" ? "Offen" : status ?? "—";
  return (
    <span
      className={cn(
        "inline-flex px-2 py-0.5 rounded-full text-xs font-medium",
        colors[status ?? ""] || "bg-muted text-muted-foreground"
      )}
    >
      {label}
    </span>
  );
}
