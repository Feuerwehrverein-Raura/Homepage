import { useEffect, useState } from "react";
import * as feesApi from "@/lib/api/membership-fees";
import { Loader2, X } from "lucide-react";

interface FeeSettingsDialogProps {
  year: number;
  onClose: () => void;
  onSaved: () => void;
}

export function FeeSettingsDialog({ year, onClose, onSaved }: FeeSettingsDialogProps) {
  const [amount, setAmount] = useState("");
  const [gvDate, setGvDate] = useState("");
  const [dueDate, setDueDate] = useState(""); // ISO yyyy-mm-dd
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await feesApi.getSettings(year);
        if (cancelled) return;
        if (s) {
          setAmount(s.amount ?? "");
          setGvDate(s.gv_date ?? "");
          setDueDate(s.due_date ? s.due_date.substring(0, 10) : "");
          setDescription(s.description ?? "");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Laden fehlgeschlagen");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [year]);

  const submit = async () => {
    const trimmed = amount.trim().replace(",", ".");
    if (!trimmed) {
      setError("Betrag ist Pflichtfeld.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await feesApi.upsertSettings({
        year,
        amount: trimmed,
        gv_date: gvDate.trim() || null,
        due_date: dueDate || null,
        description: description.trim() || null,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-lg border shadow-lg w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="font-semibold">Beitragseinstellungen</h2>
            <p className="text-xs text-muted-foreground">Jahr {year}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 hover:bg-accent"
            aria-label="Schliessen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="p-4 space-y-3">
            <Field label="Beitrag in CHF *">
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="50.00"
                className="w-full px-3 py-1.5 rounded-md border border-input bg-background text-sm"
              />
            </Field>

            <Field label="GV-Datum (frei wählbarer Text)">
              <input
                type="text"
                value={gvDate}
                onChange={(e) => setGvDate(e.target.value)}
                placeholder="06.05.2026"
                className="w-full px-3 py-1.5 rounded-md border border-input bg-background text-sm"
              />
            </Field>

            <Field label="Fälligkeitsdatum">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-1.5 rounded-md border border-input bg-background text-sm"
              />
            </Field>

            <Field label="Beschreibung (optional)">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-1.5 rounded-md border border-input bg-background text-sm resize-none"
              />
            </Field>

            {error && (
              <div className="text-destructive text-xs">{error}</div>
            )}
          </div>
        )}

        <div className="border-t px-4 py-3 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-input bg-background text-sm hover:bg-accent"
          >
            Abbrechen
          </button>
          <button
            onClick={submit}
            disabled={saving || loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1">{label}</label>
      {children}
    </div>
  );
}
