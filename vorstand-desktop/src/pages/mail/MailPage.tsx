import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  RefreshCw, Trash2, MailOpen, Paperclip, Pencil, Reply, ReplyAll,
  Forward, Archive, Ban, X, Send, Save, Star, FolderInput, Search,
} from "lucide-react";
import {
  listAccounts, listFolders, listMessages, getMessage, setFlags,
  deleteMessage, attachmentUrl, sendMessage, saveDraft, moveMessage, searchMessages,
  type MailListItem, type MailMessage,
} from "@/lib/api/mail";
import { listContacts, type Contact } from "@/lib/api/contacts";
import { openFile } from "@/lib/pdf";
import { useAuthStore } from "@/stores/auth-store";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { RichTextEditor } from "./RichTextEditor";

interface ComposeState {
  open: boolean;
  title: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  html: string;
  inReplyTo: string | null;
  references: string | null;
  originalUid: number | null;
  originalFolder: string | null;
  draftSourceUid: number | null;
  draftSourceFolder: string | null;
  attachments: File[];
}

const emptyCompose = (): ComposeState => ({
  open: false, title: "Neue E-Mail", to: "", cc: "", bcc: "", subject: "", body: "", html: "",
  inReplyTo: null, references: null, originalUid: null, originalFolder: null,
  draftSourceUid: null, draftSourceFolder: null, attachments: [],
});

function extractEmails(s: string): string[] {
  return (s || "").split(",").map(p => {
    const m = p.match(/<([^>]+)>/);
    return (m ? m[1] : p).trim();
  }).filter(Boolean);
}

function quoteBody(m: MailMessage): string {
  const dateStr = new Date(m.date).toLocaleString("de-CH");
  const lines = (m.text || "").split("\n").map(l => "> " + l).join("\n");
  return `\n\n--- Original-Nachricht ---\nVon: ${m.from}\nDatum: ${dateStr}\nBetreff: ${m.subject}\n\n${lines}`;
}

async function fileToAttachment(f: File) {
  const buf = await f.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return { filename: f.name, content: btoa(binary), contentType: f.type || "application/octet-stream" };
}

export function MailPage() {
  const [searchParams] = useSearchParams();
  const [accounts, setAccounts] = useState<string[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [account, setAccount] = useState<string>("");
  const [folders, setFolders] = useState<{ path: string; name: string; specialUse: string | null; unseen?: number }[]>([]);
  const [folder, setFolder] = useState<string>("INBOX");
  const [messages, setMessages] = useState<MailListItem[]>([]);
  const [stats, setStats] = useState<{ total: number; unseen: number }>({ total: 0, unseen: 0 });
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [message, setMessage] = useState<MailMessage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compose, setCompose] = useState<ComposeState>(emptyCompose());
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    listAccounts().then(r => {
      setAccounts(r.accounts); setMissing(r.missing);
      if (r.accounts.length > 0) setAccount(r.accounts[0]);
    }).catch(e => setError(e.message));
    listContacts().then(r => setContacts([...(r.shared || []), ...(r.members || []), ...(r.discovered || [])]))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!account) return;
    listFolders(account).then(f => {
      const order = ["\\Inbox", "\\Sent", "\\Drafts", "\\Junk", "\\Trash", "\\Archive"];
      f.sort((a, b) => (order.indexOf(a.specialUse || "") + 99) - (order.indexOf(b.specialUse || "") + 99));
      setFolders(f);
      setFolder("INBOX");
    }).catch(e => setError(e.message));
  }, [account]);

  useEffect(() => {
    if (!account || !folder) return;
    setQuery(""); setSearching(false);
    refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, folder]);

  // Auto-Refresh: alle 60s neu laden (nicht waehrend Verfassen oder aktiver Suche).
  useEffect(() => {
    if (!account || !folder) return;
    const id = setInterval(() => {
      if (!compose.open && !searching) refreshList();
    }, 60000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, folder, compose.open, searching]);

  // Compose-Initialwert aus URL ?to= (z.B. von Adressbuch -> Mail)
  useEffect(() => {
    const to = searchParams.get("to");
    if (to && account) setCompose({ ...emptyCompose(), open: true, to });
  }, [searchParams, account]);

  const refreshList = async () => {
    setLoading(true); setError(null);
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

  const doSearch = async () => {
    if (!query.trim()) { setSearching(false); refreshList(); return; }
    setLoading(true); setError(null); setSearching(true);
    try {
      const r = await searchMessages(account, folder, query.trim());
      setMessages(r.messages);
      setStats({ total: r.total, unseen: 0 });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  const clearSearch = () => { setQuery(""); setSearching(false); refreshList(); };

  const onSelect = async (uid: number) => {
    setSelectedUid(uid); setMessage(null);
    try {
      const m = await getMessage(uid, account, folder);
      setMessage(m);
      setMessages(prev => prev.map(x => (x.uid === uid ? { ...x, seen: true } : x)));
    } catch (e) { setError((e as Error).message); }
  };

  const clearSelection = () => { setSelectedUid(null); setMessage(null); refreshList(); };

  const onMarkUnread = async () => {
    if (!selectedUid) return;
    await setFlags(selectedUid, account, folder, [], ["\\Seen"]).catch(() => {});
    refreshList();
  };
  const onArchive = async () => {
    if (!selectedUid) return;
    await moveMessage(selectedUid, account, folder, "Archive").catch(() => {});
    clearSelection();
  };
  const onSpam = async () => {
    if (!selectedUid) return;
    if (!confirm("Als Spam markieren? Sender wird aus Auto-Erkennung entfernt.")) return;
    await moveMessage(selectedUid, account, folder, "Junk").catch(() => {});
    clearSelection();
  };
  const onDelete = async () => {
    if (!selectedUid) return;
    if (!confirm("In den Papierkorb verschieben?")) return;
    await deleteMessage(selectedUid, account, folder).catch(() => {});
    clearSelection();
  };
  // Stern/Flag umschalten (nutzt IMAP \\Flagged; optimistisch in der Liste updaten)
  const onToggleFlag = async () => {
    if (!selectedUid) return;
    const isFlagged = messages.find(m => m.uid === selectedUid)?.flagged;
    await setFlags(selectedUid, account, folder, isFlagged ? [] : ["\\Flagged"], isFlagged ? ["\\Flagged"] : []).catch(() => {});
    setMessages(prev => prev.map(x => (x.uid === selectedUid ? { ...x, flagged: !isFlagged } : x)));
  };
  // In einen beliebigen Ordner verschieben (Backend akzeptiert den Ordnerpfad direkt)
  const onMoveTo = async (target: string) => {
    if (!selectedUid || !target) return;
    await moveMessage(selectedUid, account, folder, target).catch(e => setError((e as Error).message));
    clearSelection();
  };
  // Entwurf zum Weiterbearbeiten in das Compose-Fenster laden (alter Entwurf wird beim
  // Senden/Speichern entfernt, damit kein Duplikat im Entwuerfe-Ordner bleibt)
  const onEditDraft = () => {
    if (!message) return;
    openCompose({
      title: "Entwurf bearbeiten", to: message.to, cc: message.cc,
      subject: message.subject, body: message.text,
      draftSourceUid: selectedUid, draftSourceFolder: folder,
    });
  };

  const openCompose = (init: Partial<ComposeState>) => setCompose({ ...emptyCompose(), open: true, ...init });
  const closeCompose = () => setCompose(emptyCompose());

  const onReply = () => {
    if (!message) return;
    openCompose({
      title: "Antwort", to: extractEmails(message.from)[0] || "",
      subject: message.subject.startsWith("Re: ") ? message.subject : "Re: " + message.subject,
      body: quoteBody(message), inReplyTo: message.messageId, references: message.messageId,
      originalUid: selectedUid, originalFolder: folder,
    });
  };
  const onReplyAll = () => {
    if (!message) return;
    const fromAddr = extractEmails(message.from)[0] || "";
    const allTo = [...extractEmails(message.to), ...extractEmails(message.cc)]
      .filter(a => a.toLowerCase() !== account.toLowerCase() && a.toLowerCase() !== fromAddr.toLowerCase());
    openCompose({
      title: "Allen antworten", to: fromAddr, cc: allTo.join(", "),
      subject: message.subject.startsWith("Re: ") ? message.subject : "Re: " + message.subject,
      body: quoteBody(message), inReplyTo: message.messageId, references: message.messageId,
      originalUid: selectedUid, originalFolder: folder,
    });
  };
  const onForward = async () => {
    if (!message || !selectedUid) return;
    // Original-Anhaenge mitnehmen: Bytes laden und als File an den Entwurf haengen.
    const token = useAuthStore.getState().token;
    const files: File[] = [];
    for (const a of message.attachments) {
      try {
        const r = await tauriFetch(`https://api.fwv-raura.ch${attachmentUrl(selectedUid, a.index, account, folder)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const blob = await r.blob();
        files.push(new File([blob], a.filename, { type: a.contentType || "application/octet-stream" }));
      } catch { /* Anhang ueberspringen */ }
    }
    openCompose({
      title: "Weiterleiten",
      subject: message.subject.startsWith("Fwd: ") ? message.subject : "Fwd: " + message.subject,
      body: quoteBody(message), originalUid: selectedUid, originalFolder: folder,
      attachments: files,
    });
  };

  const onSendOrDraft = async (asDraft: boolean) => {
    if (!asDraft && (!compose.to || !compose.subject)) {
      alert("Empfänger und Betreff erforderlich"); return;
    }
    try {
      const attachments = await Promise.all(compose.attachments.map(fileToAttachment));
      const body = {
        account, to: compose.to,
        cc: compose.cc || undefined, bcc: compose.bcc || undefined,
        subject: compose.subject, body: compose.body,
        html: compose.html || undefined,
        inReplyTo: compose.inReplyTo, references: compose.references,
        attachments,
      };
      if (asDraft) {
        await saveDraft(body);
        alert("Entwurf gespeichert.");
      } else {
        await sendMessage(body);
        if (compose.originalUid && compose.originalFolder) {
          await moveMessage(compose.originalUid, account, compose.originalFolder, "Archive").catch(() => {});
          if (selectedUid === compose.originalUid) { setSelectedUid(null); setMessage(null); }
          alert("E-Mail gesendet und Original archiviert.");
        } else {
          alert("E-Mail gesendet.");
        }
      }
      // Beim Bearbeiten eines Entwurfs den alten Entwurf entfernen (kein Duplikat).
      if (compose.draftSourceUid && compose.draftSourceFolder) {
        await deleteMessage(compose.draftSourceUid, account, compose.draftSourceFolder).catch(() => {});
        if (selectedUid === compose.draftSourceUid) { setSelectedUid(null); setMessage(null); }
      }
      closeCompose();
      refreshList();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const onDownloadAttachment = async (idx: number, filename: string) => {
    if (!selectedUid) return;
    const token = useAuthStore.getState().token;
    const r = await tauriFetch(`https://api.fwv-raura.ch${attachmentUrl(selectedUid, idx, account, folder)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const blob = await r.blob();
    await openFile(blob, filename);
  };

  // Auto-Complete-Suggestions
  const suggestions = useMemo(() => {
    if (!compose.open) return [] as Contact[];
    return contacts;
  }, [contacts, compose.open]);

  const isDrafts = folders.find(f => f.path === folder)?.specialUse === "\\Drafts";
  const flaggedNow = messages.find(m => m.uid === selectedUid)?.flagged;

  if (accounts.length === 0 && missing.length > 0) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center">
        <h1 className="text-2xl font-bold mb-2">Posteingang</h1>
        <p className="text-muted-foreground">
          Für <strong>{missing.join(", ")}</strong> ist noch kein Passwort gesetzt.
          Bitte unter <em>mein.html → Funktions-E-Mails</em> setzen.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 80px)" }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30">
        <h1 className="text-lg font-bold mr-2">Posteingang</h1>
        <button onClick={() => openCompose({})}
          className="px-3 py-1 text-sm bg-primary text-primary-foreground rounded inline-flex items-center gap-1">
          <Pencil size={14} /> Neu
        </button>
        <select value={account} onChange={e => setAccount(e.target.value)}
          className="px-2 py-1 text-sm border border-border rounded bg-background">
          {accounts.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={folder} onChange={e => setFolder(e.target.value)}
          className="px-2 py-1 text-sm border border-border rounded bg-background flex-1 max-w-xs">
          {folders.map(f => <option key={f.path} value={f.path}>{f.name}{f.unseen ? ` (${f.unseen})` : ""}</option>)}
        </select>
        <div className="relative">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") doSearch(); }}
            placeholder="Suchen…"
            className="pl-7 pr-6 py-1 text-sm border border-border rounded bg-background w-36" />
          {searching && (
            <button onClick={clearSearch} title="Suche zurücksetzen"
              className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={13} />
            </button>
          )}
        </div>
        <button onClick={refreshList} className="p-1.5 text-muted-foreground hover:bg-muted rounded">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
        <span className="ml-auto text-xs text-muted-foreground">
          {searching ? `${stats.total} Treffer` : `${stats.total} Nachrichten · ${stats.unseen} ungelesen`}
        </span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Liste */}
        <div className="w-2/5 border-r border-border overflow-y-auto">
          {error && <div className="p-4 text-sm text-red-600">{error}</div>}
          {!loading && messages.length === 0 && <div className="p-4 text-sm text-muted-foreground">Keine Nachrichten</div>}
          {messages.map(m => {
            const fromShort = m.from.replace(/<[^>]*>/, "").replace(/"/g, "").trim() || m.from;
            const isSelected = m.uid === selectedUid;
            return (
              <div key={m.uid} onClick={() => onSelect(m.uid)}
                className={`px-4 py-2 border-b border-border cursor-pointer hover:bg-muted ${isSelected ? "bg-primary/10" : ""} ${m.seen ? "" : "font-semibold"}`}>
                <div className="flex justify-between items-baseline gap-2">
                  <div className="text-sm truncate flex-1">{fromShort}</div>
                  <div className="text-xs text-muted-foreground shrink-0">
                    {new Date(m.date).toLocaleString("de-CH", { dateStyle: "short", timeStyle: "short" })}
                  </div>
                </div>
                <div className="text-sm text-muted-foreground truncate flex items-center gap-1">
                  {m.flagged && <Star size={11} className="fill-yellow-400 text-yellow-500 shrink-0" />}
                  <span className="truncate">{m.subject}</span>
                </div>
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
                  <div className="flex flex-wrap gap-1 shrink-0 max-w-[280px] justify-end">
                    {isDrafts && (
                      <button onClick={onEditDraft} title="Entwurf bearbeiten"
                        className="px-2 py-1 text-xs border border-primary text-primary rounded hover:bg-primary/10 inline-flex items-center gap-1">
                        <Pencil size={12} /> Bearbeiten
                      </button>
                    )}
                    <button onClick={onReply} title="Antworten" className="px-2 py-1 text-xs border border-border rounded hover:bg-muted inline-flex items-center gap-1">
                      <Reply size={12} /> Antw.
                    </button>
                    <button onClick={onReplyAll} title="Allen antworten" className="px-2 py-1 text-xs border border-border rounded hover:bg-muted inline-flex items-center gap-1">
                      <ReplyAll size={12} />
                    </button>
                    <button onClick={onForward} title="Weiterleiten" className="px-2 py-1 text-xs border border-border rounded hover:bg-muted inline-flex items-center gap-1">
                      <Forward size={12} /> Weiter
                    </button>
                    <button onClick={onMarkUnread} title="Als ungelesen markieren" className="p-1.5 border border-border rounded hover:bg-muted">
                      <MailOpen size={14} />
                    </button>
                    <button onClick={onToggleFlag} title={flaggedNow ? "Markierung entfernen" : "Markieren (Stern)"} className="p-1.5 border border-border rounded hover:bg-muted">
                      <Star size={14} className={flaggedNow ? "fill-yellow-400 text-yellow-500" : ""} />
                    </button>
                    <button onClick={onArchive} title="Archivieren" className="px-2 py-1 text-xs border border-border rounded hover:bg-muted inline-flex items-center gap-1">
                      <Archive size={12} /> Archiv
                    </button>
                    <button onClick={onSpam} title="Spam" className="px-2 py-1 text-xs border border-orange-300 text-orange-700 rounded hover:bg-orange-50 inline-flex items-center gap-1">
                      <Ban size={12} /> Spam
                    </button>
                    <div className="relative inline-flex items-center">
                      <FolderInput size={12} className="absolute left-1.5 pointer-events-none text-muted-foreground" />
                      <select value="" onChange={e => { const t = e.target.value; e.target.value = ""; if (t) onMoveTo(t); }}
                        title="Verschieben nach…"
                        className="pl-6 pr-1 py-1 text-xs border border-border rounded bg-background hover:bg-muted appearance-none cursor-pointer">
                        <option value="">Verschieben…</option>
                        {folders.filter(f => f.path !== folder).map(f => (
                          <option key={f.path} value={f.path}>{f.name}</option>
                        ))}
                      </select>
                    </div>
                    <button onClick={onDelete} title="In Papierkorb" className="p-1.5 border border-red-300 text-red-600 rounded hover:bg-red-50">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {message.attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {message.attachments.map(a => (
                      <button key={a.index} onClick={() => onDownloadAttachment(a.index, a.filename)}
                        className="px-2 py-1 text-xs bg-muted hover:bg-muted/70 rounded inline-flex items-center gap-1">
                        <Paperclip size={12} /> {a.filename}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-y-auto">
                {message.html ? (
                  <iframe sandbox="allow-same-origin" srcDoc={message.html}
                    className="w-full h-full border-0" style={{ minHeight: 400 }} />
                ) : (
                  <pre className="whitespace-pre-wrap font-sans text-sm p-4">{message.text || "(Kein Inhalt)"}</pre>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Compose-Dialog */}
      {compose.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-card border border-border rounded-lg w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="px-4 py-3 border-b border-border flex justify-between items-center">
              <h3 className="text-lg font-bold">{compose.title}</h3>
              <button onClick={closeCompose}><X size={18} /></button>
            </div>
            <div className="px-4 py-3 space-y-2 overflow-y-auto flex-1">
              <div className="grid grid-cols-[80px_1fr] items-center gap-2">
                <label className="text-sm text-muted-foreground">Von:</label>
                <span className="text-sm font-mono">{account}</span>
                {(["to", "cc", "bcc"] as const).map((field) => (
                  <ComposeRecipient
                    key={field}
                    label={field === "to" ? "An:" : field.toUpperCase() + ":"}
                    value={(compose as any)[field]}
                    onChange={(v) => setCompose({ ...compose, [field]: v })}
                    suggestions={suggestions}
                  />
                ))}
                <label className="text-sm text-muted-foreground">Betreff:</label>
                <input value={compose.subject} onChange={e => setCompose({ ...compose, subject: e.target.value })}
                  className="px-2 py-1 text-sm border border-border rounded bg-background" />
              </div>
              <RichTextEditor
                initialHtml={compose.html}
                initialText={compose.body}
                onChange={(html, text) => setCompose(c => ({ ...c, html, body: text }))}
              />
              <div>
                <label className="text-sm text-muted-foreground">Anhänge:</label>
                <input type="file" multiple
                  onChange={e => setCompose({ ...compose, attachments: Array.from(e.target.files || []) })}
                  className="block text-sm mt-1" />
              </div>
            </div>
            <div className="px-4 py-3 border-t border-border flex justify-end gap-2">
              <button onClick={() => onSendOrDraft(true)}
                className="px-3 py-1.5 text-sm border border-border rounded hover:bg-muted inline-flex items-center gap-1">
                <Save size={14} /> Entwurf
              </button>
              <button onClick={closeCompose}
                className="px-3 py-1.5 text-sm border border-border rounded hover:bg-muted">
                Abbrechen
              </button>
              <button onClick={() => onSendOrDraft(false)}
                className="px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded inline-flex items-center gap-1">
                <Send size={14} /> Senden
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ComposeRecipient({ label, value, onChange, suggestions }:
  { label: string; value: string; onChange: (v: string) => void; suggestions: Contact[] }) {
  const [show, setShow] = useState(false);
  const matches = useMemo(() => {
    const parts = value.split(",");
    const last = (parts[parts.length - 1] || "").trim().toLowerCase();
    if (last.length < 2) return [];
    return suggestions.filter(c =>
      (c.name || "").toLowerCase().includes(last) || (c.email || "").toLowerCase().includes(last)
    ).slice(0, 8);
  }, [value, suggestions]);

  const pick = (c: Contact) => {
    const parts = value.split(",");
    parts[parts.length - 1] = ` "${c.name}" <${c.email}>`;
    onChange(parts.join(",").replace(/^\s+/, ""));
    setShow(false);
  };

  return (
    <>
      <label className="text-sm text-muted-foreground">{label}</label>
      <div className="relative">
        <input value={value} onChange={e => { onChange(e.target.value); setShow(true); }}
          onBlur={() => setTimeout(() => setShow(false), 200)}
          className="w-full px-2 py-1 text-sm border border-border rounded bg-background" />
        {show && matches.length > 0 && (
          <div className="absolute z-50 left-0 right-0 mt-1 bg-card border border-border rounded shadow-lg max-h-48 overflow-y-auto">
            {matches.map((c) => (
              <div key={c.id} onMouseDown={() => pick(c)}
                className="px-3 py-1.5 text-sm hover:bg-muted cursor-pointer">
                <div className="font-medium">{c.name}{c.source === "member" && <span className="text-xs text-blue-600 ml-1">(Mitglied)</span>}</div>
                <div className="text-xs text-muted-foreground">{c.email}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
