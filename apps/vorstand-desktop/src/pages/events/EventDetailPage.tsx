import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useEventsStore } from "@/stores/events-store";
import { formatSwissDate, formatTime } from "@/lib/utils/date";
import { cn } from "@/lib/utils";
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
} from "lucide-react";

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
  } = useEventsStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<"shifts" | "registrations">("shifts");

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

  const allRegistrations = [
    ...(event.shifts || []).flatMap((s) => [
      ...(s.registrations?.approved || []).map((r) => ({ ...r, shiftName: s.name, type: "shift" as const })),
      ...(s.registrations?.pending || []).map((r) => ({ ...r, shiftName: s.name, type: "shift" as const })),
    ]),
    ...(event.direct_registrations?.approved || []).map((r) => ({ ...r, shiftName: "Direkt", type: "direct" as const })),
    ...(event.direct_registrations?.pending || []).map((r) => ({ ...r, shiftName: "Direkt", type: "direct" as const })),
  ];

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

      {/* Event Info Card */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h3 className="font-semibold text-sm">Details</h3>
          <InfoRow icon={Calendar} label="Startdatum" value={formatSwissDate(event.start_date)} />
          {event.end_date && (
            <InfoRow icon={Calendar} label="Enddatum" value={formatSwissDate(event.end_date)} />
          )}
          <InfoRow icon={MapPin} label="Ort" value={event.location} />
          <InfoRow icon={Users} label="Max. Teilnehmer" value={event.max_participants?.toString()} />
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
          Anmeldungen ({allRegistrations.length})
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
                <span className="text-xs text-muted-foreground">
                  {shift.filled || 0} / {shift.needed || "?"} besetzt
                </span>
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
              {shift.registrations && (shift.registrations.approved_count > 0 || shift.registrations.pending_count > 0) && (
                <div className="mt-3 border-t pt-2">
                  <p className="text-xs font-medium mb-1">
                    {shift.registrations.approved_count} genehmigt, {shift.registrations.pending_count} ausstehend
                  </p>
                  {shift.registrations.pending.map((reg) => (
                    <div key={reg.id} className="flex items-center justify-between py-1 text-sm">
                      <span>{reg.vorname} {reg.nachname}{reg.guest_name ? ` (Gast: ${reg.guest_name})` : ""}</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleApprove(reg.id)}
                          className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600"
                          title="Genehmigen"
                        >
                          <CheckCircle className="h-4 w-4" />
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
                        {reg.vorname} {reg.nachname}
                        {reg.guest_name && (
                          <span className="text-xs text-muted-foreground ml-1">(Gast: {reg.guest_name})</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{reg.shiftName}</td>
                      <td className="px-4 py-3">
                        <RegistrationStatusBadge status={reg.status} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {reg.notes || "-"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {reg.status === "pending" && (
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => handleApprove(reg.id)}
                              className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600"
                              title="Genehmigen"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleReject(reg.id)}
                              className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600"
                              title="Ablehnen"
                            >
                              <XCircle className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
