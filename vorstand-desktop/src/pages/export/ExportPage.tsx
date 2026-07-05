import { useState } from "react";
import * as XLSX from "xlsx";
import {
  loadMembers,
  loadFeePayments,
  loadInvoices,
  loadTransactions,
  loadRegistrations,
  loadEvents,
  loadDispatchLog,
  type DatasetResult,
} from "@/lib/api/export";
import { cn } from "@/lib/utils";
import { openFile } from "@/lib/pdf";
import {
  FileSpreadsheet,
  Download,
  Loader2,
  AlertCircle,
  CheckCircle,
  XCircle,
} from "lucide-react";

type CellValue = string | number | boolean;
type SheetRow = Record<string, CellValue>;

interface SheetInfo {
  name: string;
  count: number;
  ok: boolean;
  note?: string;
}

const yesNo = (v?: boolean | null): string =>
  v === true ? "ja" : v === false ? "nein" : "";

const str = (v: unknown): string =>
  v === null || v === undefined ? "" : String(v);

export function ExportPage() {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheets, setSheets] = useState<SheetInfo[] | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    setSheets(null);

    try {
      const [members, feePayments, invoices, transactions, regs, events, dispatches] =
        await Promise.all([
          loadMembers(),
          loadFeePayments(),
          loadInvoices(),
          loadTransactions(),
          loadRegistrations(),
          loadEvents(),
          loadDispatchLog(),
        ]);

      // Nachschlage-Maps fuer lesbare Labels.
      const memberMap = new Map<string, string>();
      members.rows.forEach((m) =>
        memberMap.set(m.id, `${m.vorname || ""} ${m.nachname || ""}`.trim())
      );
      const memberLabel = (id?: string | null): string =>
        id ? memberMap.get(id) || "" : "";

      const eventMap = new Map<string, string>();
      events.rows.forEach((e) => {
        if (e.title) eventMap.set(e.id, e.title);
      });

      const wb = XLSX.utils.book_new();
      const results: SheetInfo[] = [];

      // Haengt ein Sheet an — aber nur, wenn der Datensatz erreichbar war.
      // Nicht erreichbare Datensaetze werden ehrlich als solche gemeldet,
      // statt ein irrefuehrendes leeres Sheet zu erzeugen.
      const addSheet = <T,>(
        name: string,
        dataset: DatasetResult<T>,
        build: () => SheetRow[]
      ): void => {
        if (!dataset.ok) {
          results.push({
            name,
            count: 0,
            ok: false,
            note: dataset.error
              ? `nicht erreichbar (${dataset.error})`
              : "nicht erreichbar",
          });
          return;
        }
        const rows = build();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
        results.push({ name, count: rows.length, ok: true });
      };

      // Sheet 1: Mitglieder (ohne Ausgetretene/Verstorbene)
      addSheet("Mitglieder", members, () =>
        members.rows
          .filter((m) => m.status !== "Ausgetreten" && m.status !== "Verstorben")
          .map((m) => ({
            Anrede: m.anrede || "",
            Vorname: m.vorname || "",
            Nachname: m.nachname || "",
            Geschlecht: m.geschlecht || "",
            Geburtstag: m.geburtstag || "",
            Eintrittsdatum: m.eintrittsdatum || "",
            Austrittsdatum: m.austrittsdatum || "",
            Strasse: m.strasse || "",
            Adresszusatz: m.adresszusatz || "",
            PLZ: m.plz || "",
            Ort: m.ort || "",
            "E-Mail": m.email || "",
            "Versand-E-Mail": m.versand_email || "",
            Telefon: m.telefon || "",
            Mobile: m.mobile || "",
            Status: m.status || "",
            Funktion: m.funktion || "",
            "Feuerwehr-Zugehoerigkeit": m.feuerwehr_zugehoerigkeit || "",
            "T-Shirt-Groesse": m.tshirt_groesse || "",
            IBAN: m.iban || "",
            "Zustellung E-Mail": yesNo(m.zustellung_email),
            "Zustellung Post": yesNo(m.zustellung_post),
            Bemerkungen: m.bemerkungen || "",
          }))
      );

      // Sheet 2: Beitraege
      addSheet("Beitraege", feePayments, () =>
        feePayments.rows.map((p) => ({
          Mitglied:
            memberLabel(p.member_id) ||
            `${p.vorname || ""} ${p.nachname || ""}`.trim(),
          Jahr: p.year ?? "",
          Betrag: p.amount ?? "",
          Status: p.status || "",
          "Bezahlt am": p.paid_date || "",
          Referenz: p.reference_nr || "",
          "Bank-Referenz": p.bank_reference || "",
          Zahlungsart: p.payment_method || "",
          Notizen: p.notes || "",
        }))
      );

      // Sheet 3: Rechnungen
      addSheet("Rechnungen", invoices, () =>
        invoices.rows.map((i) => ({
          Nummer: i.number || "",
          Mitglied: memberLabel(i.member_id),
          Empfaenger: i.recipient_name || "",
          Adresse: (i.recipient_address || "").replace(/\n/g, ", "),
          Subtotal: i.subtotal ?? "",
          MwSt: i.tax ?? "",
          Total: i.total ?? "",
          Status: i.status || "",
          Ausgestellt: i.issued_date || "",
          Faellig: i.due_date || "",
          Bezahlt: i.paid_date || "",
          Notizen: i.notes || "",
        }))
      );

      // Sheet 4: Buchhaltung (Transaktionen)
      addSheet("Buchhaltung", transactions, () =>
        transactions.rows.map((t) => ({
          Datum: t.date || "",
          Beschreibung: t.description || "",
          Betrag: t.amount ?? "",
          Soll: t.debit_account_name || t.debit_account_id || "",
          Haben: t.credit_account_name || t.credit_account_id || "",
          Mitglied: memberLabel(t.member_id),
          Anlass: t.event_id ? eventMap.get(t.event_id) || "" : "",
          Beleg: t.receipt_url || "",
        }))
      );

      // Sheet 5: Anmeldungen
      addSheet("Anmeldungen", regs, () =>
        regs.rows.map((r) => {
          let parsed: Record<string, unknown> = {};
          try {
            parsed =
              typeof r.notes === "string"
                ? JSON.parse(r.notes)
                : r.notes_data || {};
          } catch {
            parsed = {};
          }
          return {
            Anlass:
              r.event_title ||
              (r.event_id ? eventMap.get(r.event_id) || "" : ""),
            Mitglied: r.member_id
              ? memberLabel(r.member_id) ||
                `${r.vorname || ""} ${r.nachname || ""}`.trim()
              : "",
            Gast: r.guest_name || "",
            "Gast-Email": r.guest_email || "",
            Telefon: str(parsed.phone),
            Personen: str(parsed.participants),
            Status: r.status || "",
            Erstellt: r.created_at || "",
            Bestaetigt: r.approved_at || "",
            Notizen: str(parsed.notes),
          };
        })
      );

      // Sheet 6: Anlaesse
      addSheet("Anlaesse", events, () =>
        events.rows.map((e) => ({
          Titel: e.title || "",
          Kategorie: e.category || "",
          Start: e.start_date || "",
          Ende: e.end_date || "",
          Ort: e.location || "",
          Anmeldeschluss: e.registration_deadline || "",
          "Max. Teilnehmer": e.max_participants ?? "",
          Status: e.status || "",
          Organisator: e.organizer_email || "",
        }))
      );

      // Sheet 7: Versand-Historie
      addSheet("Versand", dispatches, () =>
        dispatches.rows.map((d) => ({
          Datum: d.sent_at || d.created_at || "",
          Typ: d.type || "",
          Status: d.status || "",
          Empfaenger: d.recipient_email || d.recipient_address || "",
          Mitglied: memberLabel(d.member_id),
          Betreff: d.subject || "",
          Fehler: d.error_message || "",
        }))
      );

      if (results.filter((r) => r.ok).length === 0) {
        throw new Error(
          "Keine Datensaetze erreichbar — es gibt nichts zu exportieren."
        );
      }

      // Workbook -> ArrayBuffer -> Blob -> Anchor-Download (Tauri-Webview-tauglich).
      const today = new Date().toISOString().split("T")[0];
      const wbArray = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      const blob = new Blob([wbArray], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      await openFile(blob, `fwv-export-${today}.xlsx`);

      setSheets(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Export");
    } finally {
      setExporting(false);
    }
  };

  const exportedCount = sheets?.filter((s) => s.ok).length ?? 0;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Voll-Export</h1>

      <div className="max-w-2xl space-y-6">
        {/* Beschreibung */}
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-start gap-3">
            <FileSpreadsheet className="h-8 w-8 text-primary shrink-0" />
            <div className="space-y-2">
              <h3 className="font-semibold text-sm">Vorstand-Backup als XLSX</h3>
              <p className="text-sm text-muted-foreground">
                Erstellt eine Excel-Datei mit allen zentralen Vereinsdaten in
                separaten Tabellenblaettern: Mitglieder, Beitraege, Rechnungen,
                Buchhaltung, Anmeldungen, Anlaesse und Versand-Historie.
              </p>
              <p className="text-xs text-muted-foreground">
                Nicht erreichbare Datenquellen werden nach dem Export klar
                ausgewiesen und nicht als leeres Blatt aufgenommen.
              </p>
            </div>
          </div>
        </div>

        {/* Export-Button */}
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {exporting ? "Export laeuft…" : "Voll-Export (XLSX)"}
        </button>

        {/* Fehler */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Ergebnis */}
        {sheets && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 rounded-md bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400 text-sm">
              <CheckCircle className="h-4 w-4 shrink-0" />
              Export erstellt — {exportedCount}{" "}
              {exportedCount === 1 ? "Tabellenblatt" : "Tabellenblaetter"}.
            </div>

            <div className="rounded-lg border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Tabellenblatt</th>
                    <th className="px-4 py-2 font-medium text-right">Zeilen</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sheets.map((s) => (
                    <tr key={s.name} className="border-b last:border-0">
                      <td className="px-4 py-2 font-medium">{s.name}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {s.ok ? s.count : "—"}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-2",
                          s.ok
                            ? "text-green-700 dark:text-green-400"
                            : "text-destructive"
                        )}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {s.ok ? (
                            <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 shrink-0" />
                          )}
                          {s.ok ? "Enthalten" : s.note || "nicht erreichbar"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
