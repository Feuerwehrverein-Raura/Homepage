import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useEventsStore } from "@/stores/events-store";
import { getProposals, updateEvent, deleteEvent } from "@/lib/api/events";
import { formatSwissDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils";
import type { Event } from "@/lib/types/event";
import {
  Calendar,
  Plus,
  Loader2,
  AlertCircle,
  MapPin,
  Send,
  Users,
  Lightbulb,
  User,
  CheckCircle,
  Pencil,
  XCircle,
  X,
} from "lucide-react";

// Zaehler je Event: offene (pending) Anmeldungen + Schicht-Besetzung.
// Das Backend liefert je Schicht registrations{approved[],pending[]} bzw.
// approvedCount/pendingCount (camelCase) und directRegistrations.
function eventCounters(event: Event): {
  pending: number;
  approved: number;
  needed: number;
} {
  let pending = 0;
  let approved = 0;
  let needed = 0;
  for (const sh of event.shifts || []) {
    const r = sh.registrations as
      | { approved?: unknown[]; pending?: unknown[] }
      | undefined;
    const rc = sh as unknown as { approvedCount?: number; pendingCount?: number };
    approved += Array.isArray(r?.approved)
      ? r.approved.length
      : typeof rc.approvedCount === "number"
        ? rc.approvedCount
        : 0;
    pending += Array.isArray(r?.pending)
      ? r.pending.length
      : typeof rc.pendingCount === "number"
        ? rc.pendingCount
        : 0;
    needed += sh.needed || 0;
  }
  const ext = event as Event & {
    directRegistrations?: { approved?: unknown[]; pending?: unknown[] } | null;
  };
  const direct = event.direct_registrations ?? ext.directRegistrations ?? null;
  pending += direct?.pending?.length ?? 0;
  approved += direct?.approved?.length ?? 0;
  return { pending, approved, needed };
}

// Anzeigename des Vorschlagenden (= Default-Organisator). Backend liefert bei
// Vorschlaegen organizer_vorname/-nachname; Fallback auf Name bzw. E-Mail.
function proposerName(e: Event): string {
  const full = [e.organizer_vorname, e.organizer_nachname]
    .filter(Boolean)
    .join(" ")
    .trim();
  return full || e.organizer_name || e.organizer_email || "Unbekannt";
}

// Kurzer Auszug der Beschreibung fuer die Vorschlags-Karte.
function descriptionSnippet(text: string | null, max = 160): string {
  if (!text) return "";
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
}

export function EventsListPage() {
  const navigate = useNavigate();
  const { events, isLoading, error, fetchEvents } = useEventsStore();

  // Von Mitgliedern eingereichte Vorschlaege (status "proposed"). Kommen NICHT
  // aus getEvents() — separat via getProposals() geladen und lokal verwaltet.
  const [proposals, setProposals] = useState<Event[]>([]);
  const [proposalsLoaded, setProposalsLoaded] = useState(false);
  const [notice, setNotice] = useState<{
    type: "error" | "success";
    text: string;
  } | null>(null);
  // Laufende Aktion je Vorschlag (Spinner anzeigen + Buttons sperren).
  const [acting, setActing] = useState<{
    id: string;
    action: "approve" | "reject";
  } | null>(null);

  const loadProposals = useCallback(async () => {
    try {
      const data = await getProposals();
      setProposals(data);
    } catch (err) {
      setNotice({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Vorschlaege konnten nicht geladen werden",
      });
    } finally {
      setProposalsLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
    loadProposals();
  }, [fetchEvents, loadProposals]);

  const handleApproveProposal = async (p: Event) => {
    setNotice(null);
    setActing({ id: p.id, action: "approve" });
    try {
      // Genehmigen = Status auf "planned". Danach taucht der Anlass in der
      // regulaeren Liste (getEvents) auf und faellt aus den Vorschlaegen raus.
      await updateEvent(p.id, { status: "planned" });
      await loadProposals();
      fetchEvents();
      setNotice({
        type: "success",
        text: `„${p.title}" genehmigt und als geplanter Anlass uebernommen.`,
      });
    } catch (err) {
      setNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Genehmigen fehlgeschlagen",
      });
    } finally {
      setActing(null);
    }
  };

  const handleRejectProposal = async (p: Event) => {
    if (
      !window.confirm(
        `Vorschlag „${p.title}" ablehnen? Der Vorschlag wird geloescht.`
      )
    )
      return;
    setNotice(null);
    setActing({ id: p.id, action: "reject" });
    try {
      await deleteEvent(p.id);
      await loadProposals();
      setNotice({ type: "success", text: `Vorschlag „${p.title}" abgelehnt.` });
    } catch (err) {
      setNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Ablehnen fehlgeschlagen",
      });
    } finally {
      setActing(null);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Anlaesse</h1>
        <button
          onClick={() => navigate("/events/new")}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Neuer Anlass
        </button>
      </div>

      {/* Notice fuer Vorschlag-Aktionen */}
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

      {/* Vorschlaege — subtiler Leerzustand, wenn keine offen sind */}
      {proposalsLoaded && proposals.length === 0 && (
        <p className="mb-6 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lightbulb className="h-3.5 w-3.5 opacity-60" />
          Keine offenen Vorschlaege
        </p>
      )}

      {/* Vorschlaege — von Mitgliedern eingereichte Anlaesse zur Pruefung */}
      {proposals.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="h-5 w-5 text-amber-500" />
            <h2 className="text-lg font-semibold">Vorschlaege</h2>
            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
              {proposals.length}
            </span>
          </div>
          <div className="space-y-3">
            {proposals.map((p) => {
              const busy = acting?.id === p.id;
              return (
                <div key={p.id} className="rounded-lg border bg-card p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="font-medium">{p.title}</h3>
                      {p.subtitle && (
                        <p className="text-xs text-muted-foreground">
                          {p.subtitle}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatSwissDate(p.start_date)}
                          {p.end_date && p.end_date !== p.start_date && (
                            <span> - {formatSwissDate(p.end_date)}</span>
                          )}
                        </span>
                        {p.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {p.location}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {proposerName(p)}
                        </span>
                      </div>
                      {p.description && (
                        <p className="mt-2 text-sm text-muted-foreground">
                          {descriptionSnippet(p.description)}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => handleApproveProposal(p)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                        title="Vorschlag genehmigen (Status: Geplant)"
                      >
                        {busy && acting?.action === "approve" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle className="h-3.5 w-3.5" />
                        )}
                        Genehmigen
                      </button>
                      <button
                        onClick={() => navigate(`/events/${p.id}/edit`)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border text-xs hover:bg-muted transition-colors disabled:opacity-50"
                        title="Vor dem Genehmigen bearbeiten (z.B. Organisator anpassen, Status setzen)"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Bearbeiten
                      </button>
                      <button
                        onClick={() => handleRejectProposal(p)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-destructive/50 text-destructive text-xs hover:bg-destructive/10 transition-colors disabled:opacity-50"
                        title="Vorschlag ablehnen (loeschen)"
                      >
                        {busy && acting?.action === "reject" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5" />
                        )}
                        Ablehnen
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 mb-4 rounded-md bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button
            onClick={fetchEvents}
            className="ml-auto text-xs underline hover:no-underline"
          >
            Erneut versuchen
          </button>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && events.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Calendar className="h-12 w-12 mb-3 opacity-30" />
          <p>Keine Anlaesse vorhanden</p>
        </div>
      )}

      {/* Events Table */}
      {!isLoading && events.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium">Titel</th>
                <th className="text-left px-4 py-3 font-medium">Kategorie</th>
                <th className="text-left px-4 py-3 font-medium">Datum</th>
                <th className="text-left px-4 py-3 font-medium">Ort</th>
                <th className="text-left px-4 py-3 font-medium">Anmeldungen</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-right px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr
                  key={event.id}
                  onClick={() => navigate(`/events/${event.id}`)}
                  className="border-b last:border-0 hover:bg-muted/50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{event.title}</div>
                    {event.subtitle && (
                      <div className="text-xs text-muted-foreground">
                        {event.subtitle}
                      </div>
                    )}
                    {event.organizer_name && (
                      <div className="text-xs text-muted-foreground">
                        Org: {event.organizer_name}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {event.category || "-"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatSwissDate(event.start_date)}
                    {event.end_date && event.end_date !== event.start_date && (
                      <span> - {formatSwissDate(event.end_date)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {event.location ? (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {event.location}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      const c = eventCounters(event);
                      if (c.pending === 0 && c.approved === 0 && c.needed === 0)
                        return <span className="text-muted-foreground">-</span>;
                      return (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Users className="h-3 w-3" />
                            {c.needed > 0 ? `${c.approved}/${c.needed}` : c.approved}
                          </span>
                          {c.pending > 0 && (
                            <span className="inline-flex px-1.5 py-0.5 rounded-full font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                              {c.pending} offen
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    <EventStatusBadge status={event.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/dispatch?event=${event.id}`);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs hover:bg-muted transition-colors"
                      title="Einladung fuer diesen Anlass verschicken (Versand oeffnen)"
                    >
                      <Send className="h-3 w-3" />
                      Einladung
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EventStatusBadge({ status }: { status: string | null }) {
  // Status-Werte wie im Web/Backend: planned/confirmed/cancelled/completed
  const colors: Record<string, string> = {
    planned: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
    confirmed:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    cancelled:
      "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    completed:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  };

  return (
    <span
      className={cn(
        "inline-flex px-2 py-0.5 rounded-full text-xs font-medium",
        colors[status || ""] || "bg-muted text-muted-foreground"
      )}
    >
      {status || "-"}
    </span>
  );
}
