import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useEventsStore } from "@/stores/events-store";
import * as membersApi from "@/lib/api/members";
import type { EventCreate, ShiftCreate } from "@/lib/types/event";
import type { Member } from "@/lib/types/member";
import {
  ArrowLeft,
  Loader2,
  Save,
  Plus,
  Trash2,
} from "lucide-react";

// Kategorien/Status wie in der Web-Version (vorstand.html) — die Werte steuern
// Backend-Logik (registration_required, Menue, Schichten) und muessen matchen.
const CATEGORIES = [
  "Dorffest",
  "GV",
  "Aufbau",
  "Abbau",
  "Ausflug",
  "Ausflug mit Anmeldung",
  "Sonstiges",
];
const STATUSES = ["planned", "confirmed", "cancelled", "completed"];

// Kategorien, die (wie im Web) automatisch eine Anmeldung erfordern.
const REG_REQUIRED_CATEGORIES = [
  "Dorffest",
  "GV",
  "Aufbau",
  "Abbau",
  "Ausflug mit Anmeldung",
];

// Schicht-Bereiche wie im Web (SHIFT_TYPES) — als Vorschlagsliste (datalist).
const SHIFT_BEREICHE = [
  "Allgemein",
  "Kueche",
  "Bar",
  "Service",
  "Kasse",
  "Springer",
  "Vorbereitung",
  "Aufbau",
  "Abbau",
];

// ISO-Timestamp -> Wert fuer <input type="datetime-local"> (YYYY-MM-DDTHH:mm).
function toLocalInput(v: string | null | undefined): string {
  if (!v) return "";
  return String(v).slice(0, 16);
}

const emptyForm: EventCreate = {
  title: "",
  subtitle: "",
  category: "",
  status: "planned",
  start_date: "",
  end_date: "",
  location: "",
  description: "",
  registration_deadline: "",
  registration_required: false,
  max_participants: null,
  cost: "",
  organizer_name: "",
  organizer_email: "",
};

const emptyShift: Omit<ShiftCreate, "event_id"> = {
  name: "",
  description: "",
  date: "",
  start_time: "",
  end_time: "",
  needed: null,
  bereich: "",
};

export function EventFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { selectedEvent, fetchEvent, createEvent, updateEvent, createShift } =
    useEventsStore();
  const isEdit = !!id;

  const [form, setForm] = useState<EventCreate>({ ...emptyForm });
  const [newShifts, setNewShifts] = useState<Omit<ShiftCreate, "event_id">[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Menue-Optionen (GV) als kommagetrennter Text; Organisator-Zugang; PDF-Aushang
  const [mealOptionsText, setMealOptionsText] = useState("");
  const [createAccess, setCreateAccess] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [removePdf, setRemovePdf] = useState(false);
  // Organisator: "member" = verknuepftes Mitglied (verwaltet den Anlass in der
  // Mitglieder-App, kein Token-Zugang noetig), "extern" = Freitext + optionaler
  // Organisator-Zugang wie bisher. Neue Anlaesse starten im Mitglied-Modus.
  const [organizerMode, setOrganizerMode] = useState<"member" | "extern">("member");
  const [organizerMemberId, setOrganizerMemberId] = useState("");
  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
    if (isEdit && id) {
      fetchEvent(id);
    }
  }, [isEdit, id, fetchEvent]);

  // Mitglieder fuer die Organisator-Auswahl laden (gleiche Mechanik wie
  // Dispatch-/MassPDF-Seite: direkter API-Call in lokalen State).
  useEffect(() => {
    membersApi.getMembers().then(setMembers).catch(() => {});
  }, []);

  useEffect(() => {
    if (isEdit && selectedEvent) {
      setForm({
        title: selectedEvent.title || "",
        subtitle: selectedEvent.subtitle || "",
        category: selectedEvent.category || "",
        status: selectedEvent.status || "planned",
        start_date: toLocalInput(selectedEvent.start_date),
        end_date: toLocalInput(selectedEvent.end_date),
        location: selectedEvent.location || "",
        description: selectedEvent.description || "",
        registration_deadline: toLocalInput(selectedEvent.registration_deadline),
        registration_required: selectedEvent.registration_required ?? false,
        max_participants: selectedEvent.max_participants,
        cost: selectedEvent.cost || "",
        organizer_name: selectedEvent.organizer_name || "",
        organizer_email: selectedEvent.organizer_email || "",
      });
      setMealOptionsText((selectedEvent.meal_options || []).join(", "));
      // Organisator-Modus ableiten: verknuepftes Mitglied -> "member" (vorbelegt),
      // sonst vorhandener Freitext-Organisator -> "extern", sonst Standard "member".
      if (selectedEvent.organizer_id) {
        setOrganizerMode("member");
        setOrganizerMemberId(selectedEvent.organizer_id);
      } else if (selectedEvent.organizer_email) {
        setOrganizerMode("extern");
        setOrganizerMemberId("");
      } else {
        setOrganizerMode("member");
        setOrganizerMemberId("");
      }
    }
  }, [isEdit, selectedEvent]);

  const handleChange = (field: keyof EventCreate, value: string | number | null) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const addShift = () => {
    setNewShifts((prev) => [...prev, { ...emptyShift }]);
  };

  const updateNewShift = (index: number, field: string, value: string | number | null) => {
    setNewShifts((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  };

  const removeNewShift = (index: number) => {
    setNewShifts((prev) => prev.filter((_, i) => i !== index));
  };

  // Springer-Schichten je vorhandenem Zeitslot generieren (wie im Web):
  // fuer jeden (Datum, Von, Bis)-Slot der Nicht-Springer-Schichten wird eine
  // Springer-Schicht (1 Person) angelegt, sofern noch keine existiert.
  const generateSpringer = () => {
    const existing = [
      ...(selectedEvent?.shifts || []),
      ...newShifts,
    ];
    const slots = new Map<string, { date: string; start: string; end: string }>();
    for (const s of existing) {
      if (
        s.bereich !== "Springer" &&
        s.bereich !== "Vorbereitung" &&
        s.date &&
        s.start_time
      ) {
        const key = `${s.date}|${s.start_time}|${s.end_time || ""}`;
        if (!slots.has(key))
          slots.set(key, {
            date: String(s.date),
            start: String(s.start_time),
            end: String(s.end_time || ""),
          });
      }
    }
    const covered = new Set(
      existing
        .filter((s) => s.bereich === "Springer")
        .map((s) => `${s.date}|${s.start_time}|${s.end_time || ""}`)
    );
    const toAdd = Array.from(slots.entries())
      .filter(([key]) => !covered.has(key))
      .map(([, slot]) => ({
        ...emptyShift,
        name: "Springer",
        bereich: "Springer",
        date: slot.date.slice(0, 10),
        start_time: slot.start,
        end_time: slot.end,
        needed: 1,
      }));
    if (toAdd.length === 0) {
      setError(
        slots.size === 0
          ? "Keine Zeitslots gefunden — bitte zuerst andere Schichten (Bar, Kueche, ...) anlegen."
          : "Alle Zeitslots haben bereits Springer-Schichten."
      );
      return;
    }
    setError(null);
    setNewShifts((prev) => [...prev, ...toAdd]);
  };

  // PDF-Datei als base64 (ohne data:-Prefix) fuer pdf_attachment lesen.
  const readPdfBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve(String(reader.result || "").split(",")[1] || "");
      reader.onerror = () => reject(new Error("PDF konnte nicht gelesen werden"));
      reader.readAsDataURL(file);
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title) {
      setError("Titel ist erforderlich");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Organisator aufloesen: Im Mitglied-Modus wird das gewaehlte Mitglied
      // verknuepft (organizer_id) und Name/E-Mail daraus abgeleitet; das Backend
      // ueberspringt dann den Token-Zugang. Im Extern-Modus bleibt alles Freitext.
      const isMemberOrganizer = organizerMode === "member";
      const organizerMember = isMemberOrganizer
        ? members.find((m) => m.id === organizerMemberId)
        : undefined;
      const payload: EventCreate = {
        ...form,
        // H1: registration_required aus der Kategorie ableiten (wie im Web) —
        // sonst haetten GV/Dorffest/... trotz Anmelde-Charakter kein Anmeldeformular.
        registration_required:
          REG_REQUIRED_CATEGORIES.includes(form.category || "") ||
          !!form.registration_required,
        // N2: Menue-Optionen nur bei GV senden, sonst null (nicht "[]").
        meal_options:
          form.category === "GV"
            ? mealOptionsText.split(",").map((s) => s.trim()).filter(Boolean)
            : null,
        organizer_id: isMemberOrganizer ? organizerMemberId || null : null,
        organizer_name: isMemberOrganizer
          ? organizerMember
            ? `${organizerMember.vorname} ${organizerMember.nachname}`.trim()
            : form.organizer_name || ""
          : form.organizer_name || "",
        organizer_email: isMemberOrganizer
          ? organizerMember?.email || form.organizer_email || ""
          : form.organizer_email || "",
        // Token-Zugang nur im Extern-Modus; beim Mitglied entfaellt er.
        create_access: isMemberOrganizer ? undefined : createAccess || undefined,
      };
      if (pdfFile) {
        payload.pdf_attachment = await readPdfBase64(pdfFile);
        payload.pdf_filename = pdfFile.name;
      } else if (removePdf) {
        // N3: bestehenden PDF-Aushang entfernen
        payload.pdf_attachment = null;
        payload.pdf_filename = null;
      }
      if (isEdit && id) {
        await updateEvent(id, payload);
        // Create new shifts for existing event
        for (const shift of newShifts) {
          if (shift.name) {
            await createShift({ ...shift, event_id: id });
          }
        }
        navigate(`/events/${id}`);
      } else {
        const event = await createEvent(payload);
        // Create shifts for new event
        for (const shift of newShifts) {
          if (shift.name) {
            await createShift({ ...shift, event_id: event.id });
          }
        }
        navigate(`/events/${event.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern");
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(isEdit ? `/events/${id}` : "/events")}
          className="p-1.5 rounded-md hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold">
          {isEdit ? "Anlass bearbeiten" : "Neuer Anlass"}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        {/* Basic Info */}
        <fieldset className="rounded-lg border p-4 space-y-4">
          <legend className="px-2 text-sm font-semibold">Grunddaten</legend>
          <TextField
            label="Titel *"
            value={form.title}
            onChange={(v) => handleChange("title", v)}
            required
          />
          <TextField
            label="Untertitel"
            value={form.subtitle || ""}
            onChange={(v) => handleChange("subtitle", v)}
          />
          <div className="grid grid-cols-2 gap-4">
            <SelectField
              label="Kategorie"
              value={form.category || ""}
              onChange={(v) => handleChange("category", v)}
              options={["", ...CATEGORIES]}
            />
            <SelectField
              label="Status"
              value={form.status || "planned"}
              onChange={(v) => handleChange("status", v)}
              options={STATUSES}
            />
          </div>
          <textarea
            value={form.description || ""}
            onChange={(e) => handleChange("description", e.target.value)}
            placeholder="Beschreibung"
            rows={3}
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
          />
        </fieldset>

        {/* Date & Location */}
        <fieldset className="rounded-lg border p-4 space-y-4">
          <legend className="px-2 text-sm font-semibold">Datum & Ort</legend>
          <div className="grid grid-cols-2 gap-4">
            <TextField
              label="Start (Datum + Zeit)"
              value={form.start_date || ""}
              onChange={(v) => handleChange("start_date", v)}
              type="datetime-local"
            />
            <TextField
              label="Ende (Datum + Zeit)"
              value={form.end_date || ""}
              onChange={(v) => handleChange("end_date", v)}
              type="datetime-local"
            />
          </div>
          <TextField
            label="Ort"
            value={form.location || ""}
            onChange={(v) => handleChange("location", v)}
          />
          <div className="grid grid-cols-2 gap-4">
            <TextField
              label="Anmeldefrist"
              value={form.registration_deadline || ""}
              onChange={(v) => handleChange("registration_deadline", v)}
              type="datetime-local"
            />
            <TextField
              label="Max. Teilnehmer"
              value={form.max_participants?.toString() || ""}
              onChange={(v) => handleChange("max_participants", v ? parseInt(v) : null)}
              type="number"
            />
          </div>
          <TextField
            label="Kosten"
            value={form.cost || ""}
            onChange={(v) => handleChange("cost", v)}
          />
          {(() => {
            const autoRequired = REG_REQUIRED_CATEGORIES.includes(form.category || "");
            return (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRequired || !!form.registration_required}
                  disabled={autoRequired}
                  onChange={(e) => setForm((p) => ({ ...p, registration_required: e.target.checked }))}
                  className="rounded border-input"
                />
                Anmeldung erforderlich
                {autoRequired && (
                  <span className="text-xs text-muted-foreground">
                    (durch Kategorie „{form.category}" automatisch)
                  </span>
                )}
              </label>
            );
          })()}
          {form.category === "GV" && (
            <TextField
              label="Menue-Optionen (kommagetrennt, fuer die Essenswahl bei der Anmeldung)"
              value={mealOptionsText}
              onChange={setMealOptionsText}
            />
          )}
        </fieldset>

        {/* Organizer */}
        <fieldset className="rounded-lg border p-4 space-y-4">
          <legend className="px-2 text-sm font-semibold">Organisator</legend>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="organizer-mode"
                checked={organizerMode === "member"}
                onChange={() => setOrganizerMode("member")}
                className="border-input"
              />
              Mitglied
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="organizer-mode"
                checked={organizerMode === "extern"}
                onChange={() => setOrganizerMode("extern")}
                className="border-input"
              />
              Extern
            </label>
          </div>
          {organizerMode === "member" ? (
            <div>
              <label className="block text-sm font-medium mb-1">Mitglied</label>
              <select
                value={organizerMemberId}
                onChange={(e) => setOrganizerMemberId(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">{"— Mitglied waehlen —"}</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {`${m.vorname} ${m.nachname}`.trim()}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                Das Mitglied verwaltet den Anlass in der Mitglieder-App — ein
                separater Organisator-Zugang ist nicht noetig.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <TextField
                  label="Name"
                  value={form.organizer_name || ""}
                  onChange={(v) => handleChange("organizer_name", v)}
                />
                <TextField
                  label="E-Mail"
                  value={form.organizer_email || ""}
                  onChange={(v) => handleChange("organizer_email", v)}
                  type="email"
                />
              </div>
              {isEdit && selectedEvent?.event_email ? (
                <p className="text-sm text-green-700 dark:text-green-400">
                  ✓ Organisator-Zugang aktiv ({selectedEvent.event_email}) — Login
                  im Event-Dashboard
                </p>
              ) : (
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createAccess}
                    onChange={(e) => setCreateAccess(e.target.checked)}
                    className="rounded border-input"
                  />
                  Organisator-Zugang einrichten (Event-Dashboard-Login,
                  Zugangsdaten gehen per E-Mail an den Organisator)
                </label>
              )}
            </>
          )}
        </fieldset>

        {/* PDF-Aushang */}
        <fieldset className="rounded-lg border p-4 space-y-3">
          <legend className="px-2 text-sm font-semibold">PDF-Aushang</legend>
          {isEdit && selectedEvent?.pdf_filename && !pdfFile && (
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Aktuell: {selectedEvent.pdf_filename} (neue Datei ersetzt den Anhang)</p>
              <label className="flex items-center gap-2 cursor-pointer text-destructive">
                <input
                  type="checkbox"
                  checked={removePdf}
                  onChange={(e) => setRemovePdf(e.target.checked)}
                  className="rounded border-input"
                />
                PDF-Aushang entfernen
              </label>
            </div>
          )}
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => {
              setPdfFile(e.target.files?.[0] || null);
              if (e.target.files?.[0]) setRemovePdf(false);
            }}
            className="block text-sm"
          />
          {pdfFile && (
            <p className="text-xs text-muted-foreground">{pdfFile.name}</p>
          )}
        </fieldset>

        {/* Shifts (only for new events or to add new shifts) */}
        <fieldset className="rounded-lg border p-4 space-y-4">
          <legend className="px-2 text-sm font-semibold">
            {isEdit ? "Neue Schichten hinzufuegen" : "Schichten"}
          </legend>
          {newShifts.map((shift, index) => (
            <div key={index} className="rounded-md border p-3 space-y-3 relative">
              <button
                type="button"
                onClick={() => removeNewShift(index)}
                className="absolute top-2 right-2 p-1 rounded hover:bg-destructive/10 text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <TextField
                label="Name *"
                value={shift.name}
                onChange={(v) => updateNewShift(index, "name", v)}
              />
              <TextField
                label="Beschreibung"
                value={shift.description || ""}
                onChange={(v) => updateNewShift(index, "description", v)}
              />
              <div className="grid grid-cols-3 gap-3">
                <TextField
                  label="Datum"
                  value={shift.date || ""}
                  onChange={(v) => updateNewShift(index, "date", v)}
                  type="date"
                />
                <TextField
                  label="Von"
                  value={shift.start_time || ""}
                  onChange={(v) => updateNewShift(index, "start_time", v)}
                  type="time"
                />
                <TextField
                  label="Bis"
                  value={shift.end_time || ""}
                  onChange={(v) => updateNewShift(index, "end_time", v)}
                  type="time"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  label="Benoetigt"
                  value={shift.needed?.toString() || ""}
                  onChange={(v) => updateNewShift(index, "needed", v ? parseInt(v) : null)}
                  type="number"
                />
                <div>
                  <label className="block text-sm font-medium mb-1">Bereich</label>
                  <input
                    list="shift-bereiche"
                    value={shift.bereich || ""}
                    onChange={(e) => updateNewShift(index, "bereich", e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
            </div>
          ))}
          <datalist id="shift-bereiche">
            {SHIFT_BEREICHE.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={addShift}
              className="flex items-center gap-2 px-3 py-2 rounded-md border border-dashed text-sm text-muted-foreground hover:bg-muted transition-colors flex-1 justify-center"
            >
              <Plus className="h-4 w-4" />
              Schicht hinzufuegen
            </button>
            <button
              type="button"
              onClick={generateSpringer}
              title="Erzeugt je Zeitslot der bestehenden Schichten eine Springer-Schicht (1 Person)"
              className="flex items-center gap-2 px-3 py-2 rounded-md border border-dashed text-sm text-muted-foreground hover:bg-muted transition-colors justify-center"
            >
              <Plus className="h-4 w-4" />
              Springer generieren
            </button>
          </div>
        </fieldset>

        {error && (
          <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isEdit ? "Speichern" : "Erstellen"}
          </button>
          <button
            type="button"
            onClick={() => navigate(isEdit ? `/events/${id}` : "/events")}
            className="px-4 py-2 rounded-md border text-sm hover:bg-muted"
          >
            Abbrechen
          </button>
        </div>
      </form>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o || "\u2014"}
          </option>
        ))}
      </select>
    </div>
  );
}
