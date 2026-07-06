import { useState } from "react";
import { Send, Loader2, AlertCircle, BellRing } from "lucide-react";
import { cn } from "@/lib/utils";
import { broadcastPush } from "@/lib/api/push";

/* ========== App-Push Tab ========== */
// Mitglieder per App benachrichtigen: Titel + Nachricht als Push an alle
// Mitglieder mit App (FCM-Channel "general"). E-Mail/Post laufen separat.
export function AppPushTab() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inputCls =
    "w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  const handleSend = async () => {
    const t = title.trim();
    const b = body.trim();
    if (!t || !b) {
      setError("Titel und Nachricht duerfen nicht leer sein");
      setResult(null);
      return;
    }
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const res = await broadcastPush(t, b);
      if (res.success) {
        setResult(
          res.sent != null
            ? `Push gesendet (${res.sent} ${res.sent === 1 ? "Geraet" : "Geraete"})`
            : "Push gesendet"
        );
        setTitle("");
        setBody("");
      } else {
        setError("Push konnte nicht gesendet werden");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Senden");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-start gap-2 p-3 rounded-md bg-muted text-sm text-muted-foreground">
        <BellRing className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          Erreicht nur Mitglieder mit App + aktivierten Benachrichtigungen;
          E-Mail/Post laufen separat.
        </span>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Titel</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="z.B. Naechster Anlass"
          className={inputCls}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Nachricht</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          placeholder="Nachricht an alle App-Mitglieder…"
          className={cn(inputCls, "resize-y")}
        />
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
          disabled={sending || !title.trim() || !body.trim()}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Senden
        </button>
      </div>
    </div>
  );
}
