import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useEventsStore } from "@/stores/events-store";
import { openFile } from "@/lib/pdf";
import { useAuthStore } from "@/stores/auth-store";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { formatSwissDate, formatTime } from "@/lib/utils/date";
import { cn } from "@/lib/utils";
import {
  suggestAlternativeShift,
  createRegistration,
  updateRegistration,
} from "@/lib/api/events";
import type {
  Event,
  Shift,
  EventRegistration,
  DirectRegistrations,
} from "@/lib/types/event";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Loader2,
  Calendar,
  MapPin,
  Users,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  FileText,
  Paperclip,
  ArrowLeftRight,
  UserPlus,
  X,
  Send,
} from "lucide-react";

const API_BASE = "https://api.fwv-raura.ch";

const DEFAULT_SUGGEST_COMMENT =
  "Leider ist die von dir gewaehlte Schicht bereits voll besetzt. Waerst du bereit, stattdessen die folgende Schicht zu uebernehmen?";

// Loesst den Anzeigenamen einer Anmeldung robust auf. Schicht-Anmeldungen
// liefern vom Backend nur { id, name }, direkte Anmeldungen zusaetzlich
// vorname/nachname/guest_name.
function regDisplayName(r: {
  name?: string | null;
  vorname?: string | null;
  nachname?: string | null;
  guest_name?: string | null;
}): string {
  if (r.name) return r.name;
  const full = [r.vorname, r.nachname].filter(Boolean).join(" ").trim();
  return full || r.guest_name || "Unbekannt";
}

// Anmelde-Zusatzdaten aus dem notes-JSON der Web-Anmeldemaske: Personenzahl,
// Begleitpersonen (mit optionalen Kontaktdaten), Allergien, Menü, Telefon und
// die Freitext-Bemerkung. Vorher wurde das rohe JSON in der Tabelle angezeigt.
interface RegCompanion {
  name: string;
  email?: string;
  phone?: string;
}
interface RegExtra {
  phone: string;
  participants: number;
  companions: RegCompanion[];
  allergies: string;
  meal: string;
  text: string;
}
function parseRegNotes(notes: unknown): RegExtra {
  const out: RegExtra = {
    phone: "",
    participants: 1,
    companions: [],
    allergies: "",
    meal: "",
    text: "",
  };
  if (!notes) return out;
  let n: Record<string, unknown> | null = null;
  if (typeof notes === "string") {
    try {
      n = JSON.parse(notes) as Record<string, unknown>;
    } catch {
      out.text = notes;
      return out;
    }
  } else if (typeof notes === "object") {
    n = notes as Record<string, unknown>;
  }
  if (!n || typeof n !== "object") return out;
  if (typeof n.phone === "string") out.phone = n.phone;
  const p = parseInt(String(n.participants ?? ""), 10);
  if (Number.isFinite(p) && p > 1) out.participants = p;
  if (Array.isArray(n.companions)) {
    for (const c of n.companions) {
      if (typeof c === "string") {
        if (c.trim()) out.companions.push({ name: c.trim() });
      } else if (c && typeof c === "object") {
        const o = c as { name?: unknown; email?: unknown; phone?: unknown };
        const nm = typeof o.name === "string" ? o.name.trim() : "";
        if (nm) {
          out.companions.push({
            name: nm,
            email: typeof o.email === "string" && o.email ? o.email : undefined,
            phone: typeof o.phone === "string" && o.phone ? o.phone : undefined,
          });
        }
      }
    }
  }
  if (typeof n.allergies === "string") out.allergies = n.allergies;
  if (typeof n.meal_selection === "string") out.meal = n.meal_selection;
  if (typeof n.notes === "string") out.text = n.notes;
  return out;
}

function shiftDisplayLabel(s: Shift): string {
  const head = `${s.bereich ? s.bereich + " - " : ""}${s.name}`;
  const bits: string[] = [];
  if (s.date) bits.push(formatSwissDate(s.date));
  if (s.start_time || s.end_time)
    bits.push(`${formatTime(s.start_time)}-${formatTime(s.end_time)}`);
  return bits.length ? `${head} (${bits.join(" ")})` : head;
}

// Laedt ein PDF binaer ueber den Tauri-HTTP-Client (analog MailPage) und
// startet den Download ueber einen Blob-URL.
async function downloadPdf(path: string, filename: string): Promise<void> {
  const token = useAuthStore.getState().token;
  const res = await tauriFetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.text();
      if (body) {
        try {
          msg = JSON.parse(body).error || body;
        } catch {
          msg = body;
        }
      }
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  await openFile(blob, filename);
}

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    selectedEvent: event,
    isLoading,
    error,
    fetchEvent,
    deleteEvent,
    approveRegistration,
    rejectRegistration,
    updateShift,
    deleteShift,
  } = useEventsStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<"shifts" | "registrations">("shifts");
  const [notice, setNotice] = useState<{
    type: "error" | "success";
    text: string;
  } | null>(null);
  const [pdfLoading, setPdfLoading] = useState<"aushang" | "teilnehmer" | null>(
    null
  );

  // Bestehende Schicht bearbeiten (Modal) — nutzt updateShift/deleteShift.
  const [editShiftId, setEditShiftId] = useState<string | null>(null);
  const [shiftForm, setShiftForm] = useState({
    name: "",
    bereich: "",
    date: "",
    start_time: "",
    end_time: "",
    needed: "",
  });
  const [shiftSaving, setShiftSaving] = useState(false);

  const openShiftEdit = (shift: Shift) => {
    setEditShiftId(shift.id);
    setShiftForm({
      name: shift.name || "",
      bereich: shift.bereich || "",
      date: (shift.date || "").slice(0, 10),
      start_time: (shift.start_time || "").slice(0, 5),
      end_time: (shift.end_time || "").slice(0, 5),
      needed: shift.needed != null ? String(shift.needed) : "",
    });
  };

  const saveShiftEdit = async () => {
    if (!editShiftId || !id) return;
    setShiftSaving(true);
    try {
      await updateShift(editShiftId, {
        name: shiftForm.name,
        bereich: shiftForm.bereich || null,
        date: shiftForm.date || null,
        start_time: shiftForm.start_time || null,
        end_time: shiftForm.end_time || null,
        needed: shiftForm.needed ? parseInt(shiftForm.needed, 10) : null,
      });
      await fetchEvent(id);
      setEditShiftId(null);
      setNotice({ type: "success", text: "Schicht gespeichert." });
    } catch (err) {
      setNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Speichern fehlgeschlagen",
      });
    } finally {
      setShiftSaving(false);
    }
  };

  const handleDeleteShift = async (shift: Shift) => {
    if (
      !window.confirm(
        `Schicht "${shift.name}" wirklich löschen? Zugehörige Anmeldungen gehen verloren.`
      )
    )
      return;
    try {
      await deleteShift(shift.id);
      if (id) await fetchEvent(id);
      setNotice({ type: "success", text: "Schicht gelöscht." });
    } catch (err) {
      setNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Löschen fehlgeschlagen",
      });
    }
  };

  // E2 — Alternative Schicht vorschlagen
  const [suggestReg, setSuggestReg] = useState<{
    id: string;
    name: string;
    currentShift: string;
  } | null>(null);
  const [suggestShiftId, setSuggestShiftId] = useState("");
  const [suggestEmail, setSuggestEmail] = useState("");
  const [suggestComment, setSuggestComment] = useState(DEFAULT_SUGGEST_COMMENT);
  const [suggestSending, setSuggestSending] = useState(false);

  // E4 — Anmeldung anlegen / bearbeiten
  const [regModal, setRegModal] = useState<
    | { mode: "create"; shiftId: string | null; shiftLabel: string }
    | { mode: "edit"; regId: string; shiftLabel: string }
    | null
  >(null);
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regParticipants, setRegParticipants] = useState("1");
  const [regSaving, setRegSaving] = useState(false);

  useEffect(() => {
    if (id) fetchEvent(id);
  }, [id, fetchEvent]);

  const handleDelete = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      await deleteEvent(id);
      navigate("/events");
    } catch {
      setDeleting(false);
    }
  };

  const handleApprove = async (regId: string) => {
    await approveRegistration(regId);
  };

  const handleReject = async (regId: string) => {
    await rejectRegistration(regId);
  };

  const handleAushangPdf = async () => {
    if (!event) return;
    setNotice(null);
    setPdfLoading("aushang");
    try {
      const name =
        (event as Event & { pdf_filename?: string | null }).pdf_filename ||
        `${event.title.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
      await downloadPdf(`/events/${event.id}/pdf`, name);
    } catch (e) {
      setNotice({
        type: "error",
        text: e instanceof Error ? e.message : "Fehler beim Laden des PDF",
      });
    } finally {
      setPdfLoading(null);
    }
  };

  const handleTeilnehmerlistePdf = async () => {
    if (!event) return;
    setNotice(null);
    setPdfLoading("teilnehmer");
    try {
      const safe = event.title.replace(/[^a-zA-Z0-9]/g, "_");
      await downloadPdf(
        `/events/${event.id}/pdf/teilnehmerliste`,
        `Teilnehmerliste_${safe}.pdf`
      );
    } catch (e) {
      setNotice({
        type: "error",
        text:
          e instanceof Error ? e.message : "Fehler beim Erstellen der Liste",
      });
    } finally {
      setPdfLoading(null);
    }
  };

  const openSuggest = (reg: EventRegistration, currentShift: string) => {
    setNotice(null);
    setSuggestReg({
      id: reg.id,
      name: regDisplayName(reg),
      currentShift,
    });
    setSuggestShiftId("");
    setSuggestEmail(
      reg.guest_email || (reg as { email?: string | null }).email || ""
    );
    setSuggestComment(DEFAULT_SUGGEST_COMMENT);
  };

  const handleSendSuggestion = async () => {
    if (!suggestReg || !event) return;
    if (!suggestShiftId) {
      setNotice({ type: "error", text: "Bitte eine alternative Schicht waehlen" });
      return;
    }
    if (!suggestEmail.trim()) {
      setNotice({ type: "error", text: "Bitte eine E-Mail-Adresse angeben" });
      return;
    }
    const shift = event.shifts?.find((s) => s.id === suggestShiftId);
    if (!shift) return;
    setSuggestSending(true);
    try {
      await suggestAlternativeShift(suggestReg.id, {
        newShiftId: shift.id,
        shiftInfo: {
          id: shift.id,
          bereich: shift.bereich || "",
          name: shift.name,
          date: shift.date,
          time: `${shift.start_time || ""}-${shift.end_time || ""}`,
        },
        comment: suggestComment,
        email: suggestEmail.trim(),
      });
      setSuggestReg(null);
      setNotice({ type: "success", text: "Vorschlag wurde per E-Mail gesendet" });
      if (id) fetchEvent(id);
    } catch (e) {
      setNotice({
        type: "error",
        text: e instanceof Error ? e.message : "Fehler beim Senden",
      });
    } finally {
      setSuggestSending(false);
    }
  };

  const openCreateReg = (shiftId: string | null, shiftLabel: string) => {
    setNotice(null);
    setRegName("");
    setRegEmail("");
    setRegPhone("");
    setRegParticipants("1");
    setRegModal({ mode: "create", shiftId, shiftLabel });
  };

  const openEditReg = (reg: EventRegistration, shiftLabel: string) => {
    setNotice(null);
    setRegName(regDisplayName(reg));
    setRegEmail(
      reg.guest_email || (reg as { email?: string | null }).email || ""
    );
    const extra = parseRegNotes(reg.notes);
    setRegPhone(extra.phone || reg.phone || "");
    setRegParticipants(String(extra.participants));
    setRegModal({ mode: "edit", regId: reg.id, shiftLabel });
  };

  const handleSaveReg = async () => {
    if (!regModal || !event) return;
    if (!regName.trim()) {
      setNotice({ type: "error", text: "Name ist erforderlich" });
      return;
    }
    setRegSaving(true);
    try {
      if (regModal.mode === "create") {
        const payload: Record<string, unknown> = {
          event_id: event.id,
          shift_ids: regModal.shiftId ? [regModal.shiftId] : null,
          status: "approved",
          guest_name: regName.trim(),
          guest_email: regEmail.trim(),
        };
        const createParticipants = Math.min(
          Math.max(parseInt(regParticipants, 10) || 1, 1),
          50
        );
        if (regPhone.trim() || createParticipants > 1) {
          payload.notes = JSON.stringify({
            phone: regPhone.trim(),
            participants: createParticipants,
          });
        }
        await createRegistration(payload);
        setNotice({ type: "success", text: "Person hinzugefuegt" });
      } else {
        // phone + participants merged das Backend ins bestehende notes-JSON
        // (companions/allergies bleiben erhalten).
        const payload: Record<string, unknown> = { guest_name: regName.trim() };
        if (regEmail.trim()) payload.guest_email = regEmail.trim();
        payload.phone = regPhone.trim();
        payload.participants = Math.min(
          Math.max(parseInt(regParticipants, 10) || 1, 1),
          50
        );
        await updateRegistration(regModal.regId, payload);
        setNotice({ type: "success", text: "Anmeldung aktualisiert" });
      }
      setRegModal(null);
      if (id) fetchEvent(id);
    } catch (e) {
      setNotice({
        type: "error",
        text: e instanceof Error ? e.message : "Fehler beim Speichern",
      });
    } finally {
      setRegSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        {error || "Anlass nicht gefunden"}
      </div>
    );
  }

  // pdf_filename kommt vom Backend (…event), ist aber nicht im Event-Typ.
  const pdfFilename =
    (event as Event & { pdf_filename?: string | null }).pdf_filename ?? null;

  // Direkte Anmeldungen: Backend liefert camelCase (directRegistrations).
  const directRegs =
    event.direct_registrations ??
    (event as Event & { directRegistrations?: DirectRegistrations | null })
      .directRegistrations ??
    null;

  const allRegistrations = [
    ...(event.shifts || []).flatMap((s) => [
      ...(s.registrations?.approved || []).map((r) => ({
        ...r,
        status: "approved",
        shiftName: shiftDisplayLabel(s),
        type: "shift" as const,
      })),
      ...(s.registrations?.pending || []).map((r) => ({
        ...r,
        status: "pending",
        shiftName: shiftDisplayLabel(s),
        type: "shift" as const,
      })),
    ]),
    ...(directRegs?.approved || []).map((r) => ({
      ...r,
      status: "approved",
      shiftName: "Direkt",
      type: "direct" as const,
    })),
    ...(directRegs?.pending || []).map((r) => ({
      ...r,
      status: "pending",
      shiftName: "Direkt",
      type: "direct" as const,
    })),
  ];

  const hasShifts = (event.shifts?.length || 0) > 0;

  // Belegte PERSONEN der Direkt-Anmeldungen (eine Anmeldung kann mehrere
  // Personen umfassen) — fuer die Auslastungs-Anzeige gegen max_participants.
  const personsUsed = allRegistrations
    .filter((r) => r.type === "direct")
    .reduce((sum, r) => sum + parseRegNotes(r.notes).participants, 0);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate("/events")}
          className="p-1.5 rounded-md hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{event.title}</h1>
          {event.subtitle && (
            <p className="text-sm text-muted-foreground">{event.subtitle}</p>
          )}
        </div>
        {pdfFilename && (
          <button
            onClick={handleAushangPdf}
            disabled={pdfLoading === "aushang"}
            className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-muted transition-colors disabled:opacity-50"
            title={pdfFilename}
          >
            {pdfLoading === "aushang" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
            Aushang
          </button>
        )}
        <button
          onClick={() => navigate(`/events/${id}/edit`)}
          className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-muted transition-colors"
        >
          <Pencil className="h-4 w-4" />
          Bearbeiten
        </button>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-md border border-destructive/50 text-destructive text-sm hover:bg-destructive/10 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
          Loeschen
        </button>
      </div>

      {/* Notice */}
      {notice && (
        <div
          className={cn(
            "flex items-center gap-2 p-3 mb-4 rounded-md text-sm",
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

      {/* Event Info Card */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h3 className="font-semibold text-sm">Details</h3>
          <InfoRow icon={Calendar} label="Startdatum" value={formatSwissDate(event.start_date)} />
          {event.end_date && (
            <InfoRow icon={Calendar} label="Enddatum" value={formatSwissDate(event.end_date)} />
          )}
          <InfoRow icon={MapPin} label="Ort" value={event.location} />
          <InfoRow
            icon={Users}
            label="Teilnehmer"
            value={
              event.max_participants
                ? `${personsUsed}/${event.max_participants} Personen belegt`
                : personsUsed > 0
                  ? `${personsUsed} Personen angemeldet`
                  : undefined
            }
          />
          {event.registration_deadline && (
            <InfoRow icon={Calendar} label="Anmeldefrist" value={formatSwissDate(event.registration_deadline)} />
          )}
          {event.cost && (
            <InfoRow icon={Calendar} label="Kosten" value={event.cost} />
          )}
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h3 className="font-semibold text-sm">Organisation</h3>
          <InfoRow icon={Users} label="Kategorie" value={event.category} />
          <InfoRow icon={AlertCircle} label="Status" value={event.status} />
          {event.organizer_name && (
            <InfoRow icon={Users} label="Organisator" value={event.organizer_name} />
          )}
          {event.event_email && (
            <InfoRow
              icon={Users}
              label="Organisator-Zugang"
              value={`aktiv (${event.event_email})`}
            />
          )}
          {event.organizer_email && (
            <InfoRow icon={Users} label="E-Mail" value={event.organizer_email} />
          )}
          {event.description && (
            <div className="pt-2">
              <p className="text-xs text-muted-foreground mb-1">Beschreibung</p>
              <p className="text-sm whitespace-pre-wrap">{event.description}</p>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b">
        <button
          onClick={() => setActiveTab("shifts")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            activeTab === "shifts"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Schichten ({event.shifts?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab("registrations")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            activeTab === "registrations"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Anmeldungen ({allRegistrations.length}
          {personsUsed > allRegistrations.filter((r) => r.type === "direct").length
            ? ` · ${personsUsed + allRegistrations.filter((r) => r.type === "shift").length} Pers.`
            : ""}
          )
        </button>
      </div>

      {/* Shifts Tab */}
      {activeTab === "shifts" && (
        <div className="space-y-3">
          {(!event.shifts || event.shifts.length === 0) && (
            <div className="py-8 text-center text-muted-foreground">
              Keine Schichten vorhanden
            </div>
          )}
          {event.shifts?.map((shift) => (
            <div key={shift.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold">{shift.name}</h4>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {shift.registrations?.approved?.length ?? 0} / {shift.needed || "?"} besetzt
                  </span>
                  <button
                    onClick={() =>
                      openCreateReg(shift.id, shiftDisplayLabel(shift))
                    }
                    className="flex items-center gap-1 px-2 py-1 rounded-md border text-xs hover:bg-muted transition-colors"
                    title="Person hinzufuegen"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Person
                  </button>
                  <button
                    onClick={() => openShiftEdit(shift)}
                    className="p-1 rounded hover:bg-muted text-muted-foreground"
                    title="Schicht bearbeiten"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteShift(shift)}
                    className="p-1 rounded hover:bg-muted text-destructive"
                    title="Schicht loeschen"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {shift.description && (
                <p className="text-sm text-muted-foreground mb-2">{shift.description}</p>
              )}
              <div className="flex gap-4 text-xs text-muted-foreground">
                {shift.date && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatSwissDate(shift.date)}
                  </span>
                )}
                {(shift.start_time || shift.end_time) && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
                  </span>
                )}
                {shift.bereich && (
                  <span>Bereich: {shift.bereich}</span>
                )}
              </div>
              {/* Shift registrations */}
              {shift.registrations && (shift.registrations.approved.length > 0 || shift.registrations.pending.length > 0) && (
                <div className="mt-3 border-t pt-2">
                  <p className="text-xs font-medium mb-1">
                    {shift.registrations.approved.length} genehmigt, {shift.registrations.pending.length} ausstehend
                  </p>
                  {shift.registrations.pending.map((reg) => (
                    <div key={reg.id} className="flex items-center justify-between py-1 text-sm">
                      <span>{regDisplayName(reg)}</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleApprove(reg.id)}
                          className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600"
                          title="Genehmigen"
                        >
                          <CheckCircle className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() =>
                            openSuggest(reg, shiftDisplayLabel(shift))
                          }
                          className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600"
                          title="Alternative Schicht vorschlagen"
                        >
                          <ArrowLeftRight className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleReject(reg.id)}
                          className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600"
                          title="Ablehnen"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Registrations Tab */}
      {activeTab === "registrations" && (
        <div>
          <div className="flex items-center justify-end gap-2 mb-3">
            {!hasShifts && (
              <button
                onClick={() => openCreateReg(null, "Direkt (ohne Schicht)")}
                className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-muted transition-colors"
              >
                <UserPlus className="h-4 w-4" />
                Person hinzufuegen
              </button>
            )}
            {allRegistrations.length > 0 && (
              <button
                onClick={handleTeilnehmerlistePdf}
                disabled={pdfLoading === "teilnehmer"}
                className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-muted transition-colors disabled:opacity-50"
              >
                {pdfLoading === "teilnehmer" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                Teilnehmerliste (PDF)
              </button>
            )}
          </div>
          {allRegistrations.length === 0 && (
            <div className="py-8 text-center text-muted-foreground">
              Keine Anmeldungen vorhanden
            </div>
          )}
          {allRegistrations.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium">Name</th>
                    <th className="text-left px-4 py-3 font-medium">Schicht</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-left px-4 py-3 font-medium">Notizen</th>
                    <th className="text-right px-4 py-3 font-medium">Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {allRegistrations.map((reg) => (
                    <tr key={reg.id} className="border-b last:border-0">
                      <td className="px-4 py-3">
                        {regDisplayName(reg)}
                        {(reg as { email?: string | null }).email && (
                          <div className="text-xs text-muted-foreground">
                            {(reg as { email?: string | null }).email}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{reg.shiftName}</td>
                      <td className="px-4 py-3">
                        <RegistrationStatusBadge status={reg.status} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {(() => {
                          const x = parseRegNotes(reg.notes);
                          const rows: string[] = [];
                          if (x.participants > 1) rows.push(`${x.participants} Personen`);
                          if (x.companions.length)
                            rows.push(
                              `mit: ${x.companions
                                .map((c) => [c.name, c.email, c.phone].filter(Boolean).join(" · "))
                                .join(", ")}`
                            );
                          if (x.phone) rows.push(`Tel: ${x.phone}`);
                          if (x.meal) rows.push(`Menü: ${x.meal}`);
                          if (x.text) rows.push(x.text);
                          if (rows.length === 0 && !x.allergies) return "-";
                          return (
                            <div className="space-y-0.5">
                              {rows.map((r, i) => (
                                <div key={i}>{r}</div>
                              ))}
                              {x.allergies && (
                                <div className="font-medium text-amber-700 dark:text-amber-400">
                                  ⚠ Allergien: {x.allergies}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => openEditReg(reg, reg.shiftName)}
                            className="p-1 rounded hover:bg-muted text-muted-foreground"
                            title="Bearbeiten"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          {reg.status === "pending" && (
                            <>
                              <button
                                onClick={() => handleApprove(reg.id)}
                                className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600"
                                title="Genehmigen"
                              >
                                <CheckCircle className="h-4 w-4" />
                              </button>
                              {reg.type === "shift" && (
                                <button
                                  onClick={() => openSuggest(reg, reg.shiftName)}
                                  className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600"
                                  title="Alternative Schicht vorschlagen"
                                >
                                  <ArrowLeftRight className="h-4 w-4" />
                                </button>
                              )}
                              <button
                                onClick={() => handleReject(reg.id)}
                                className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600"
                                title="Ablehnen"
                              >
                                <XCircle className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Schicht bearbeiten Modal */}
      {editShiftId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border rounded-lg p-6 max-w-lg w-full space-y-3">
            <h3 className="font-semibold text-lg">Schicht bearbeiten</h3>
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input
                value={shiftForm.name}
                onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Bereich</label>
                <input
                  value={shiftForm.bereich}
                  onChange={(e) => setShiftForm({ ...shiftForm, bereich: e.target.value })}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Benoetigt</label>
                <input
                  type="number"
                  value={shiftForm.needed}
                  onChange={(e) => setShiftForm({ ...shiftForm, needed: e.target.value })}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Datum</label>
                <input
                  type="date"
                  value={shiftForm.date}
                  onChange={(e) => setShiftForm({ ...shiftForm, date: e.target.value })}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Von</label>
                <input
                  type="time"
                  value={shiftForm.start_time}
                  onChange={(e) => setShiftForm({ ...shiftForm, start_time: e.target.value })}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Bis</label>
                <input
                  type="time"
                  value={shiftForm.end_time}
                  onChange={(e) => setShiftForm({ ...shiftForm, end_time: e.target.value })}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEditShiftId(null)}
                className="px-4 py-2 rounded-md border text-sm hover:bg-muted"
              >
                Abbrechen
              </button>
              <button
                onClick={saveShiftEdit}
                disabled={shiftSaving}
                className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {shiftSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Suggest Alternative Modal */}
      {suggestReg && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border rounded-lg p-6 max-w-lg w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">
                Alternative Schicht vorschlagen
              </h3>
              <button
                onClick={() => setSuggestReg(null)}
                className="p-1 rounded-md hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="rounded-md bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Anmeldung von:</p>
                <p className="font-semibold">{suggestReg.name}</p>
                <p className="text-xs text-muted-foreground">
                  Aktuelle Schicht: {suggestReg.currentShift}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  E-Mail-Adresse *
                </label>
                <input
                  type="email"
                  value={suggestEmail}
                  onChange={(e) => setSuggestEmail(e.target.value)}
                  placeholder="empfaenger@example.ch"
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Alternative Schicht *
                </label>
                <select
                  value={suggestShiftId}
                  onChange={(e) => setSuggestShiftId(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                >
                  <option value="">Bitte waehlen...</option>
                  {event.shifts?.map((shift) => {
                    const approvedCount =
                      shift.registrations?.approved?.length ?? 0;
                    const capacity = shift.needed ?? null;
                    const isFull =
                      capacity != null && approvedCount >= capacity;
                    const free =
                      capacity != null
                        ? ` (${Math.max(capacity - approvedCount, 0)}/${capacity} frei)`
                        : "";
                    return (
                      <option key={shift.id} value={shift.id}>
                        {shiftDisplayLabel(shift)}
                        {free}
                        {isFull ? " [VOLL]" : ""}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Nachricht an die Person
                </label>
                <textarea
                  rows={4}
                  value={suggestComment}
                  onChange={(e) => setSuggestComment(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <button
                onClick={() => setSuggestReg(null)}
                className="px-4 py-2 rounded-md border text-sm hover:bg-muted"
                disabled={suggestSending}
              >
                Abbrechen
              </button>
              <button
                onClick={handleSendSuggestion}
                disabled={suggestSending}
                className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
              >
                {suggestSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Vorschlag senden
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Registration Modal */}
      {regModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border rounded-lg p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">
                {regModal.mode === "create"
                  ? "Person hinzufuegen"
                  : "Anmeldung bearbeiten"}
              </h3>
              <button
                onClick={() => setRegModal(null)}
                className="p-1 rounded-md hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Schicht: {regModal.shiftLabel}
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Name *</label>
                <input
                  type="text"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">E-Mail</label>
                <input
                  type="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Telefon</label>
                <input
                  type="tel"
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Anzahl Personen
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={regParticipants}
                  onChange={(e) => setRegParticipants(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Zaehlt bei Anlaessen mit Teilnehmerlimit als belegte Plaetze.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <button
                onClick={() => setRegModal(null)}
                className="px-4 py-2 rounded-md border text-sm hover:bg-muted"
                disabled={regSaving}
              >
                Abbrechen
              </button>
              <button
                onClick={handleSaveReg}
                disabled={regSaving}
                className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
              >
                {regSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border rounded-lg p-6 max-w-sm w-full mx-4">
            <h3 className="font-semibold text-lg mb-2">Anlass loeschen?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              &laquo;{event.title}&raquo; wird unwiderruflich geloescht.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 rounded-md border text-sm hover:bg-muted"
                disabled={deleting}
              >
                Abbrechen
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-md bg-destructive text-destructive-foreground text-sm hover:bg-destructive/90 flex items-center gap-2"
              >
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                Loeschen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm">{value || "-"}</p>
      </div>
    </div>
  );
}

function RegistrationStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };

  return (
    <span
      className={cn(
        "inline-flex px-2 py-0.5 rounded-full text-xs font-medium",
        colors[status] || "bg-muted text-muted-foreground"
      )}
    >
      {status}
    </span>
  );
}
