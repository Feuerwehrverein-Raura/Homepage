import { useEffect, useState } from "react";
import { RefreshCw, Trash2, MailOpen, Paperclip } from "lucide-react";
import {
  listAccounts,
  listFolders,
  listMessages,
  getMessage,
  setFlags,
  deleteMessage,
  attachmentUrl,
  type MailListItem,
  type MailMessage,
} from "@/lib/api/mail";
import { useAuthStore } from "@/stores/auth-store";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

export function MailPage() {
  const [accounts, setAccounts] = useState<string[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [account, setAccount] = useState<string>("");
  const [folders, setFolders] = useState<{ path: string; name: string; specialUse: string | null }[]>([]);
  const [folder, setFolder] = useState<string>("INBOX");
  const [messages, setMessages] = useState<MailListItem[]>([]);
  const [stats, setStats] = useState<{ total: number; unseen: number }>({ total: 0, unseen: 0 });
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [message, setMessage] = useState<MailMessage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Mount: accounts laden
  useEffect(() => {
    listAccounts()
      .then((r) => {
        setAccounts(r.accounts);
        setMissing(r.missing);
        if (r.accounts.length > 0) setAccount(r.accounts[0]);
      })
      .catch((e) => setError(e.message));
  }, []);

  // 2. Account-Wechsel: folders laden
  useEffect(() => {
    if (!account) return;
    listFolders(account)
      .then((f) => {
        const order = ["\\Inbox", "\\Sent", "\\Drafts", "\\Junk", "\\Trash", "\\Archive"];
        f.sort((a, b) => (order.indexOf(a.specialUse || "") + 99) - (order.indexOf(b.specialUse || "") + 99));
        setFolders(f);
        setFolder("INBOX");
      })
      .catch((e) => setError(e.message));
  }, [account]);

  // 3. Folder-Wechsel: messages laden
  useEffect(() => {
    if (!account || !folder) return;
    refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, folder]);

  const refreshList = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await listMessages(account, folder);
      setMessages(r.messages);
      setStats({ total: r.total, unseen: r.unseen });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const onSelect = async (uid: number) => {
    setSelectedUid(uid);
    setMessage(null);
    try {
      const m = await getMessage(uid, account, folder);
      setMessage(m);
      // lokal als seen markieren
      setMessages((prev) => prev.map((x) => (x.uid === uid ? { ...x, seen: true } : x)));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onMarkUnread = async () => {
    if (!selectedUid) return;
    await setFlags(selectedUid, account, folder, [], ["\\Seen"]).catch(() => {});
    refreshList();
  };

  const onDelete = async () => {
    if (!selectedUid) return;
    if (!confirm("Nachricht in den Papierkorb verschieben?")) return;
    await deleteMessage(selectedUid, account, folder).catch(() => {});
    setSelectedUid(null);
    setMessage(null);
    refreshList();
  };

  const onDownloadAttachment = async (idx: number, filename: string) => {
    if (!selectedUid) return;
    const token = useAuthStore.getState().token;
    const r = await tauriFetch(`https://api.fwv-raura.ch${attachmentUrl(selectedUid, idx, account, folder)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  };

  if (accounts.length === 0 && missing.length > 0) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center">
        <h1 className="text-2xl font-bold mb-2">Posteingang</h1>
        <p className="text-muted-foreground">
          Für <strong>{missing.join(", ")}</strong> ist noch kein Passwort gesetzt. Bitte unter
          <em> mein.html → Funktions-E-Mails → Passwort ändern</em> setzen.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 80px)" }}>
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30">
        <h1 className="text-lg font-bold mr-4">Posteingang</h1>
        <select
          className="px-2 py-1 text-sm border border-border rounded bg-background"
          value={account}
          onChange={(e) => setAccount(e.target.value)}
        >
          {accounts.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select
          className="px-2 py-1 text-sm border border-border rounded bg-background flex-1 max-w-xs"
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
        >
          {folders.map((f) => <option key={f.path} value={f.path}>{f.name}</option>)}
        </select>
        <button
          onClick={refreshList}
          className="p-1.5 text-muted-foreground hover:bg-muted rounded"
          title="Aktualisieren"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
        <span className="ml-auto text-xs text-muted-foreground">
          {stats.total} Nachrichten · {stats.unseen} ungelesen
        </span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Liste */}
        <div className="w-2/5 border-r border-border overflow-y-auto">
          {error && <div className="p-4 text-sm text-red-600">{error}</div>}
          {loading && messages.length === 0 && <div className="p-4 text-sm text-muted-foreground">Lade…</div>}
          {!loading && messages.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">Keine Nachrichten</div>
          )}
          {messages.map((m) => {
            const fromShort = m.from.replace(/<[^>]*>/, "").replace(/"/g, "").trim() || m.from;
            const isSelected = m.uid === selectedUid;
            return (
              <div
                key={m.uid}
                onClick={() => onSelect(m.uid)}
                className={`px-4 py-2 border-b border-border cursor-pointer hover:bg-muted ${
                  isSelected ? "bg-primary/10" : ""
                } ${m.seen ? "" : "font-semibold"}`}
              >
                <div className="flex justify-between items-baseline gap-2">
                  <div className="text-sm truncate flex-1">{fromShort}</div>
                  <div className="text-xs text-muted-foreground shrink-0">
                    {new Date(m.date).toLocaleString("de-CH", { dateStyle: "short", timeStyle: "short" })}
                  </div>
                </div>
                <div className="text-sm text-muted-foreground truncate">{m.subject}</div>
              </div>
            );
          })}
        </div>

        {/* Detail */}
        <div className="w-3/5 flex flex-col overflow-hidden">
          {!message ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Keine Nachricht ausgewählt
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-border bg-muted/20">
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-base font-bold truncate">{message.subject}</h2>
                    <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                      <div><strong>Von:</strong> {message.from}</div>
                      <div><strong>An:</strong> {message.to}</div>
                      {message.cc && <div><strong>CC:</strong> {message.cc}</div>}
                      <div><strong>Datum:</strong> {new Date(message.date).toLocaleString("de-CH")}</div>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={onMarkUnread} title="Als ungelesen markieren"
                      className="p-1.5 border border-border rounded hover:bg-muted">
                      <MailOpen size={14} />
                    </button>
                    <button onClick={onDelete} title="In Papierkorb"
                      className="p-1.5 border border-red-300 text-red-600 rounded hover:bg-red-50">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {message.attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {message.attachments.map((a) => (
                      <button
                        key={a.index}
                        onClick={() => onDownloadAttachment(a.index, a.filename)}
                        className="px-2 py-1 text-xs bg-muted hover:bg-muted/70 rounded inline-flex items-center gap-1"
                      >
                        <Paperclip size={12} /> {a.filename}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-y-auto">
                {message.html ? (
                  <iframe
                    sandbox="allow-same-origin"
                    srcDoc={message.html}
                    className="w-full h-full border-0"
                    style={{ minHeight: 400 }}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap font-sans text-sm p-4">
                    {message.text || "(Kein Inhalt)"}
                  </pre>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
