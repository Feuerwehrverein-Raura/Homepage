import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useEventsStore } from "@/stores/events-store";
import { formatSwissDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils";
import {
  Calendar,
  Plus,
  Loader2,
  AlertCircle,
  MapPin,
} from "lucide-react";

export function EventsListPage() {
  const navigate = useNavigate();
  const { events, isLoading, error, fetchEvents } = useEventsStore();

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

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
                <th className="text-left px-4 py-3 font-medium">Status</th>
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
                    <EventStatusBadge status={event.status} />
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
  const colors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
    published:
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
