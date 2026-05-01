import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useEventsStore } from "@/stores/events-store";
import type { EventCreate, ShiftCreate } from "@/lib/types/event";
import {
  ArrowLeft,
  Loader2,
  Save,
  Plus,
  Trash2,
} from "lucide-react";

const emptyForm: EventCreate = {
  title: "",
  subtitle: "",
  category: "",
  status: "draft",
  start_date: "",
  end_date: "",
  location: "",
  description: "",
  registration_deadline: "",
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

  useEffect(() => {
    if (isEdit && id) {
      fetchEvent(id);
    }
  }, [isEdit, id, fetchEvent]);

  useEffect(() => {
    if (isEdit && selectedEvent) {
      setForm({
        title: selectedEvent.title || "",
        subtitle: selectedEvent.subtitle || "",
        category: selectedEvent.category || "",
        status: selectedEvent.status || "draft",
        start_date: selectedEvent.start_date || "",
        end_date: selectedEvent.end_date || "",
        location: selectedEvent.location || "",
        description: selectedEvent.description || "",
        registration_deadline: selectedEvent.registration_deadline || "",
        max_participants: selectedEvent.max_participants,
        cost: selectedEvent.cost || "",
        organizer_name: selectedEvent.organizer_name || "",
        organizer_email: selectedEvent.organizer_email || "",
      });
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title) {
      setError("Titel ist erforderlich");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isEdit && id) {
        await updateEvent(id, form);
        // Create new shifts for existing event
        for (const shift of newShifts) {
          if (shift.name) {
            await createShift({ ...shift, event_id: id });
          }
        }
        navigate(`/events/${id}`);
      } else {
        const event = await createEvent(form);
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
              options={["", "Anlass", "Uebung", "Versammlung", "Kurs", "Sonstiges"]}
            />
            <SelectField
              label="Status"
              value={form.status || "draft"}
              onChange={(v) => handleChange("status", v)}
              options={["draft", "published", "cancelled", "completed"]}
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
              label="Startdatum"
              value={form.start_date || ""}
              onChange={(v) => handleChange("start_date", v)}
              type="date"
            />
            <TextField
              label="Enddatum"
              value={form.end_date || ""}
              onChange={(v) => handleChange("end_date", v)}
              type="date"
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
              type="date"
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
        </fieldset>

        {/* Organizer */}
        <fieldset className="rounded-lg border p-4 space-y-4">
          <legend className="px-2 text-sm font-semibold">Organisator</legend>
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
                <TextField
                  label="Bereich"
                  value={shift.bereich || ""}
                  onChange={(v) => updateNewShift(index, "bereich", v)}
                />
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addShift}
            className="flex items-center gap-2 px-3 py-2 rounded-md border border-dashed text-sm text-muted-foreground hover:bg-muted transition-colors w-full justify-center"
          >
            <Plus className="h-4 w-4" />
            Schicht hinzufuegen
          </button>
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
