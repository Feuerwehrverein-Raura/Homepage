import { useEffect, useRef } from "react";
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Link2,
  RemoveFormatting,
} from "lucide-react";

/** Preset-Farben fuer die Textfarbe. Erste = Standard (zuruecksetzen). */
const COLORS: { name: string; value: string }[] = [
  { name: "Standard", value: "#111827" },
  { name: "Rot", value: "#dc2626" },
  { name: "Orange", value: "#ea580c" },
  { name: "Gelb", value: "#ca8a04" },
  { name: "Gruen", value: "#16a34a" },
  { name: "Blau", value: "#2563eb" },
  { name: "Violett", value: "#7c3aed" },
];

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Plaintext (z.B. zitierte Antwort) in einfaches HTML wandeln. */
function textToHtml(s: string): string {
  return escapeHtml(s || "").replace(/\n/g, "<br>");
}

interface Props {
  /** Vorbelegtes HTML (leer bei neuer Mail). Hat Vorrang vor initialText. */
  initialHtml?: string;
  /** Plaintext-Fallback (z.B. zitierter Reply-Body), wird zu HTML gewandelt. */
  initialText: string;
  /** Liefert (html, plaintext) bei jeder Aenderung nach oben. */
  onChange: (html: string, text: string) => void;
}

/**
 * Schlanker Rich-Text-Editor (contentEditable + execCommand) fuer das
 * Verfassen-Fenster. Verschickt HTML-Mails mit Plaintext-Fallback.
 *
 * Wird nur beim Mount initialisiert — der Compose-Dialog re-mountet bei jedem
 * Oeffnen, daher gibt es keine Cursor-Spruenge durch Re-Renders.
 */
export function RichTextEditor({ initialHtml, initialText, onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = initialHtml || textToHtml(initialText);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = () => {
    const el = ref.current;
    if (el) onChange(el.innerHTML, el.innerText);
  };

  const cmd = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    ref.current?.focus();
    emit();
  };

  const addLink = () => {
    const url = window.prompt("Link-Adresse (URL):", "https://");
    if (url) cmd("createLink", url);
  };

  const btn =
    "h-7 w-7 flex items-center justify-center rounded hover:bg-muted text-foreground/80";
  // onMouseDown-preventDefault haelt die Text-Selektion im Editor (sonst geht
  // sie beim Klick auf den Button verloren und execCommand greift ins Leere).
  const noBlur = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="rounded-md border border-border bg-background focus-within:ring-1 focus-within:ring-ring">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-1 py-1">
        <button type="button" title="Fett (Ctrl+B)" onMouseDown={noBlur} onClick={() => cmd("bold")} className={btn}>
          <Bold className="h-4 w-4" />
        </button>
        <button type="button" title="Kursiv (Ctrl+I)" onMouseDown={noBlur} onClick={() => cmd("italic")} className={btn}>
          <Italic className="h-4 w-4" />
        </button>
        <button type="button" title="Unterstrichen (Ctrl+U)" onMouseDown={noBlur} onClick={() => cmd("underline")} className={btn}>
          <Underline className="h-4 w-4" />
        </button>

        <span className="mx-1 h-5 w-px bg-border" />

        <button type="button" title="Aufzaehlung" onMouseDown={noBlur} onClick={() => cmd("insertUnorderedList")} className={btn}>
          <List className="h-4 w-4" />
        </button>
        <button type="button" title="Nummerierte Liste" onMouseDown={noBlur} onClick={() => cmd("insertOrderedList")} className={btn}>
          <ListOrdered className="h-4 w-4" />
        </button>
        <button type="button" title="Link einfuegen" onMouseDown={noBlur} onClick={addLink} className={btn}>
          <Link2 className="h-4 w-4" />
        </button>

        <span className="mx-1 h-5 w-px bg-border" />

        {COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            title={`Textfarbe: ${c.name}`}
            onMouseDown={noBlur}
            onClick={() => cmd("foreColor", c.value)}
            className="h-5 w-5 rounded-full border border-border/60 shrink-0"
            style={{ backgroundColor: c.value }}
          />
        ))}

        <span className="mx-1 h-5 w-px bg-border" />

        <button type="button" title="Formatierung entfernen" onMouseDown={noBlur} onClick={() => cmd("removeFormat")} className={btn}>
          <RemoveFormatting className="h-4 w-4" />
        </button>
      </div>

      <div
        ref={ref}
        contentEditable
        onInput={emit}
        className="min-h-[220px] max-h-[45vh] overflow-y-auto px-3 py-2 text-sm outline-none [&_a]:text-blue-600 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
      />
    </div>
  );
}
