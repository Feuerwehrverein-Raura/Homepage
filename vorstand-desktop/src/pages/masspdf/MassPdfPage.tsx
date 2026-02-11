import { useEffect, useState } from "react";
import * as dispatchApi from "@/lib/api/dispatch";
import * as membersApi from "@/lib/api/members";
import type { Member } from "@/lib/types/member";
import {
  FileUp,
  Send,
  Loader2,
  AlertCircle,
  CheckCircle,
} from "lucide-react";

export function MassPdfPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [staging, setStaging] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    membersApi.getMembers().then(setMembers).catch(() => {});
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === "application/pdf") {
      setPdfFile(file);
      setError(null);
    } else {
      setError("Bitte eine PDF-Datei auswaehlen");
    }
  };

  const toggleMember = (id: string) => {
    setSelectedMembers((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const handleSend = async () => {
    if (!pdfFile) {
      setError("Bitte eine PDF-Datei auswaehlen");
      return;
    }
    if (selectedMembers.length === 0) {
      setError("Bitte mindestens einen Empfaenger auswaehlen");
      return;
    }

    setSending(true);
    setError(null);
    setResult(null);

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const base64Data = dataUrl.split(",")[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(pdfFile);
      });

      const res = await dispatchApi.sendPingenBulkPdf({
        pdfBase64: base64,
        memberIds: selectedMembers,
        staging,
      });

      setResult(
        `${res.successCount} von ${res.totalRecipients} Briefen ${staging ? "(Staging) " : ""}erfolgreich gesendet. ${res.failedCount} fehlgeschlagen.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Senden");
    } finally {
      setSending(false);
    }
  };

  const postMembers = members.filter((m) => m.zustellung_post);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Massen-PDF</h1>

      <div className="max-w-2xl space-y-6">
        {/* PDF Upload */}
        <div className="rounded-lg border bg-card p-6">
          <h3 className="font-semibold text-sm mb-3">PDF-Datei</h3>
          <label className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 cursor-pointer hover:bg-muted/50 transition-colors">
            <FileUp className="h-8 w-8 text-muted-foreground mb-2" />
            {pdfFile ? (
              <div className="text-center">
                <p className="font-medium text-sm">{pdfFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(pdfFile.size / 1024).toFixed(0)} KB
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                PDF-Datei auswaehlen oder hierher ziehen
              </p>
            )}
            <input
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
        </div>

        {/* Staging Toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={staging}
            onChange={(e) => setStaging(e.target.checked)}
            className="rounded border-input"
          />
          <span className="text-sm">Staging-Modus (keine echten Briefe senden)</span>
        </label>

        {/* Member Selection */}
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">
              Empfaenger ({selectedMembers.length} ausgewaehlt)
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedMembers(postMembers.map((m) => m.id))}
                className="text-xs text-primary hover:underline"
              >
                Post-Mitglieder ({postMembers.length})
              </button>
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
          <div className="border rounded-md max-h-64 overflow-y-auto">
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
                <span className="flex-1">
                  {m.vorname} {m.nachname}
                </span>
                {m.zustellung_post && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                    Post
                  </span>
                )}
                {m.strasse && (
                  <span className="text-xs text-muted-foreground">
                    {m.strasse}, {m.plz} {m.ort}
                  </span>
                )}
              </label>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400 text-sm">
            <CheckCircle className="h-4 w-4 shrink-0" />
            {result}
          </div>
        )}

        {/* Send Button */}
        <button
          onClick={handleSend}
          disabled={sending || !pdfFile || selectedMembers.length === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {staging ? "Staging senden" : "Briefe senden"} ({selectedMembers.length} Empfaenger)
        </button>
      </div>
    </div>
  );
}
