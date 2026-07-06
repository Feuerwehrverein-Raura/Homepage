import { useState } from "react";
import { Loader2, X, BellRing } from "lucide-react";
import { cn } from "@/lib/utils";
import { notifyMembers, type NotifyMembersResponse } from "@/lib/api/push";

interface MemberNotifyDialogProps {
  memberId: string;
  memberName: string;
  onClose: () => void;
  onSent: (result: NotifyMembersResponse) => void;
}

// Gezielte Benachrichtigung an ein einzelnes Mitglied: Titel + mehrzeilige
// Nachricht als Push, optional zusaetzlich per E-Mail.
export function MemberNotifyDialog({
  memberId,
  memberName,
  onClose,
  onSent,
}: MemberNotifyDialogProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [alsoEmail, setAlsoEmail] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputCls =
    "w-full px-3 py-1.5 rounded-md border border-input bg-background text-sm";

  const submit = async () => {
    const t = title.trim();
    const b = body.trim();
    if (!t || !b) {
      setError("Titel und Nachricht duerfen nicht leer sein.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await notifyMembers([memberId], t, b, alsoEmail);
      onSent(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Senden fehlgeschlagen");
    } finally {
      setSending(false);
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
            <h2 className="font-semibold">Mitglied benachrichtigen</h2>
            <p className="text-xs text-muted-foreground">{memberName}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 hover:bg-accent"
            aria-label="Schliessen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-start gap-2 p-3 rounded-md bg-muted text-xs text-muted-foreground">
            <BellRing className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Erreicht das Mitglied per App-Push (falls App + Benachrichtigungen
              aktiv). Mit „auch per E-Mail" wird die Nachricht zusaetzlich per
              E-Mail versendet.
            </span>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Titel</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z.B. Kurze Info"
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Nachricht</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder="Nachricht an das Mitglied…"
              className={cn(inputCls, "resize-y")}
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={alsoEmail}
              onChange={(e) => setAlsoEmail(e.target.checked)}
              className="rounded border-input"
            />
            <span className="text-sm">Auch per E-Mail senden</span>
          </label>

          {error && <div className="text-destructive text-xs">{error}</div>}
        </div>

        <div className="border-t px-4 py-3 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-input bg-background text-sm hover:bg-accent"
          >
            Abbrechen
          </button>
          <button
            onClick={submit}
            disabled={sending || !title.trim() || !body.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
          >
            {sending && <Loader2 className="h-4 w-4 animate-spin" />}
            Senden
          </button>
        </div>
      </div>
    </div>
  );
}
