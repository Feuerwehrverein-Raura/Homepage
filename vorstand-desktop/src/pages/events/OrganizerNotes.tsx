import { useEffect, useState } from "react";
import {
  listOrganizerNotes,
  createOrganizerNote,
  deleteOrganizerNote,
  deleteOrganizerNoteAttachment,
  fetchOrganizerNoteAttachment,
} from "@/lib/api/organizer-notes";
import { openFile } from "@/lib/pdf";
import { formatSwissDateTime } from "@/lib/utils/date";
import { cn } from "@/lib/utils";
import type {
  OrganizerNote,
  OrganizerNoteAttachment,
} from "@/lib/types/event";
import {
  Loader2,
  Plus,
  Trash2,
  Paperclip,
  X,
  AlertCircle,
  CheckCircle,
  FileText,
  StickyNote,
} from "lucide-react";

// Backend lehnt Dateien > 10 MB mit 413 ab — clientseitig vorab abfangen.
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(contentType: string | null | undefined): boolean {
  return !!contentType && contentType.startsWith("image/");
}

// Datei als vollstaendigen data-URI lesen (data:<mime>;base64,<...>). Der
// Backend-Endpoint akzeptiert diesen URI direkt als `data`.
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () =>
      reject(new Error(`"${file.name}" konnte nicht gelesen werden`));
    reader.readAsDataURL(file);
  });
}

type Notice = { type: "error" | "success"; text: string };

export function OrganizerNotes({ eventId }: { eventId: string }) {
  const [notes, setNotes] = useState<OrganizerNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Neue Notiz
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Laufende Aktionen (fuer Spinner / Deaktivierung)
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [deletingAttId, setDeletingAttId] = useState<string | null>(null);
  const [openingAttId, setOpeningAttId] = useState<string | null>(null);

  // Bild-Vorschauen: attachmentId -> Blob-ObjectURL (authentifiziert geladen).
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  // Notizen laden + Bild-Thumbnails authentifiziert nachladen. Jeder Lauf
  // besitzt seine ObjectURLs und gibt sie im Cleanup wieder frei.
  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    (async () => {
      setLoading(true);
      setThumbs({});
      try {
        const data = await listOrganizerNotes(eventId);
        if (cancelled) return;
        setNotes(data);
        for (const note of data) {
          for (const att of note.attachments) {
            if (cancelled) return;
            if (!isImage(att.content_type)) continue;
            try {
              const blob = await fetchOrganizerNoteAttachment(
                eventId,
                note.id,
                att.id
              );
              if (cancelled) return;
              const url = URL.createObjectURL(blob);
              created.push(url);
              setThumbs((prev) => ({ ...prev, [att.id]: url }));
            } catch {
              // Thumbnail-Fehler ignorieren — Chip bleibt ohne Vorschau.
            }
          }
        }
      } catch (e) {
        if (!cancelled) {
          setNotice({
            type: "error",
            text:
              e instanceof Error
                ? e.message
                : "Notizen konnten nicht geladen werden",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [eventId, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  const onFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = ""; // gleiche Datei erneut waehlbar machen
    if (picked.length === 0) return;
    const tooBig = picked.filter((f) => f.size > MAX_FILE_SIZE);
    const ok = picked.filter((f) => f.size <= MAX_FILE_SIZE);
    if (tooBig.length > 0) {
      setNotice({
        type: "error",
        text: `Zu gross (max. 10 MB): ${tooBig.map((f) => f.name).join(", ")}`,
      });
    }
    if (ok.length > 0) setFiles((prev) => [...prev, ...ok]);
  };

  const removePendingFile = (idx: number) =>
    setFiles((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    const text = content.trim();
    if (!text && files.length === 0) {
      setNotice({
        type: "error",
        text: "Bitte Text eingeben oder mindestens einen Anhang waehlen.",
      });
      return;
    }
    setSubmitting(true);
    setNotice(null);
    try {
      const attachments = await Promise.all(
        files.map(async (f) => ({
          filename: f.name,
          content_type: f.type || "application/octet-stream",
          data: await readFileAsDataUrl(f),
        }))
      );
      await createOrganizerNote(eventId, {
        content: text || undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      setContent("");
      setFiles([]);
      setNotice({ type: "success", text: "Notiz gespeichert." });
      reload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Speichern fehlgeschlagen";
      setNotice({
        type: "error",
        text: /413/.test(msg) ? "Datei zu gross (max. 10 MB)." : msg,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!window.confirm("Diese Notiz inkl. Anhaenge wirklich loeschen?")) return;
    setDeletingNoteId(noteId);
    setNotice(null);
    try {
      await deleteOrganizerNote(eventId, noteId);
      setNotice({ type: "success", text: "Notiz geloescht." });
      reload();
    } catch (e) {
      setNotice({
        type: "error",
        text: e instanceof Error ? e.message : "Loeschen fehlgeschlagen",
      });
    } finally {
      setDeletingNoteId(null);
    }
  };

  const handleDeleteAttachment = async (noteId: string, attId: string) => {
    if (!window.confirm("Diesen Anhang wirklich loeschen?")) return;
    setDeletingAttId(attId);
    setNotice(null);
    try {
      await deleteOrganizerNoteAttachment(eventId, noteId, attId);
      reload();
    } catch (e) {
      setNotice({
        type: "error",
        text: e instanceof Error ? e.message : "Loeschen fehlgeschlagen",
      });
    } finally {
      setDeletingAttId(null);
    }
  };

  // Anhang authentifiziert laden und im Standard-Programm oeffnen (Bild wie
  // Dokument). Kein direktes <img src> / <a href> — der GET braucht den Bearer.
  const openAttachment = async (
    noteId: string,
    att: OrganizerNoteAttachment
  ) => {
    setOpeningAttId(att.id);
    setNotice(null);
    try {
      const blob = await fetchOrganizerNoteAttachment(eventId, noteId, att.id);
      await openFile(blob, att.filename);
    } catch (e) {
      setNotice({
        type: "error",
        text: e instanceof Error ? e.message : "Anhang konnte nicht geoeffnet werden",
      });
    } finally {
      setOpeningAttId(null);
    }
  };

  const canSubmit = (content.trim().length > 0 || files.length > 0) && !submitting;

  return (
    <div className="space-y-4">
      {notice && (
        <div
          className={cn(
            "flex items-center gap-2 p-3 rounded-md text-sm",
            notice.type === "error"
              ? "bg-destructive/10 text-destructive"
              : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
          )}
        >
          {notice.type === "error" ? (
            <AlertCircle className="h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle className="h-4 w-4 shrink-0" />
          )}
          {notice.text}
          <button
            onClick={() => setNotice(null)}
            className="ml-auto opacity-70 hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Neue Notiz */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <StickyNote className="h-4 w-4" />
          Neue Notiz
        </h3>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          placeholder="Notiz zum Anlass (z.B. Absprachen, To-dos, Kontakte) …"
          className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-y"
        />
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {files.map((f, i) => (
              <span
                key={`${f.name}-${i}`}
                className="inline-flex items-center gap-1.5 rounded-md border bg-muted/50 pl-2.5 pr-1.5 py-1 text-xs"
              >
                <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="max-w-[160px] truncate">{f.name}</span>
                <span className="text-muted-foreground">{formatSize(f.size)}</span>
                <button
                  type="button"
                  onClick={() => removePendingFile(i)}
                  className="ml-0.5 rounded p-0.5 hover:bg-muted"
                  title="Entfernen"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-muted transition-colors cursor-pointer">
            <Paperclip className="h-4 w-4" />
            Dateien hinzufuegen
            <input
              type="file"
              multiple
              onChange={onFilesSelected}
              className="hidden"
            />
          </label>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Notiz speichern
          </button>
        </div>
      </div>

      {/* Notizen-Liste */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : notes.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground text-sm">
          Noch keine Notizen vorhanden.
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div key={note.id} className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {note.created_by} · {formatSwissDateTime(note.created_at)}
                </p>
                <button
                  type="button"
                  onClick={() => handleDeleteNote(note.id)}
                  disabled={deletingNoteId === note.id}
                  title="Notiz loeschen"
                  className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                >
                  {deletingNoteId === note.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>

              {note.content && (
                <p className="text-sm whitespace-pre-wrap">{note.content}</p>
              )}

              {note.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {note.attachments.map((att) => {
                    const thumb = thumbs[att.id];
                    const opening = openingAttId === att.id;
                    const deleting = deletingAttId === att.id;
                    return (
                      <div key={att.id} className="relative group">
                        <button
                          type="button"
                          onClick={() => openAttachment(note.id, att)}
                          disabled={opening}
                          title={`${att.filename} (${formatSize(att.size)}) — oeffnen`}
                          className="relative block text-left disabled:opacity-60"
                        >
                          {isImage(att.content_type) && thumb ? (
                            <img
                              src={thumb}
                              alt={att.filename}
                              className="h-16 w-16 rounded-md border object-cover"
                            />
                          ) : isImage(att.content_type) ? (
                            <div className="flex h-16 w-16 items-center justify-center rounded-md border bg-muted">
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-2.5 py-2 text-xs hover:bg-muted transition-colors">
                              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <span className="max-w-[160px] truncate">
                                {att.filename}
                              </span>
                              <span className="text-muted-foreground shrink-0">
                                {formatSize(att.size)}
                              </span>
                            </div>
                          )}
                          {opening && (
                            <span className="absolute inset-0 flex items-center justify-center rounded-md bg-background/60">
                              <Loader2 className="h-4 w-4 animate-spin" />
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAttachment(note.id, att.id)}
                          disabled={deleting}
                          title="Anhang loeschen"
                          className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-destructive-foreground shadow opacity-0 group-hover:opacity-100 disabled:opacity-100"
                        >
                          {deleting ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <X className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
