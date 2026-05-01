import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import * as jobsApi from "@/lib/api/scheduled-jobs";
import type { ScheduledJob } from "@/lib/types/scheduled-job";
import { Clock, Loader2, AlertCircle, X } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Geplant",
  running: "Läuft",
  done: "Erledigt",
  failed: "Fehlgeschlagen",
  cancelled: "Abgebrochen",
};

const STATUS_TONE: Record<string, string> = {
  scheduled: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  running: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  done: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  cancelled: "bg-muted text-muted-foreground",
};

function formatSwiss(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("de-CH", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function formatResult(r: Record<string, unknown> | null): string {
  if (!r) return "";
  if (typeof r.error === "string") return `Fehler: ${r.error}`;
  const parts: string[] = [];
  if (typeof r.success === "number") parts.push(`${r.success} versendet`);
  if (typeof r.failed === "number") parts.push(`${r.failed} fehlgeschlagen`);
  if (typeof r.candidates === "number") parts.push(`(von ${r.candidates})`);
  return parts.join(", ");
}

export function ScheduledJobsPage() {
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await jobsApi.listJobs();
      setJobs(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCancel = async (job: ScheduledJob) => {
    if (!confirm(`Geplante Aufgabe "${job.label ?? job.action}" stornieren?`)) return;
    setCancellingId(job.id);
    try {
      await jobsApi.cancelJob(job.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Stornieren fehlgeschlagen");
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Geplante Aufgaben</h1>

      {error && (
        <div className="flex items-center gap-2 p-3 mb-4 rounded-md bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && jobs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Clock className="h-12 w-12 mb-3 opacity-30" />
          <p>Keine geplanten Aufgaben.</p>
          <p className="text-xs mt-1">Bei den Bulk-Versand-Buttons gibt's eine "Planen"-Option.</p>
        </div>
      )}

      {!loading && jobs.length > 0 && (
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Aufgabe</th>
                <th className="text-left px-4 py-2 font-medium">Geplant für</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-left px-4 py-2 font-medium">Resultat</th>
                <th className="text-right px-4 py-2 font-medium">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-t hover:bg-muted/20">
                  <td className="px-4 py-2">
                    <div className="font-medium">{j.label ?? j.action}</div>
                    {j.created_by && (
                      <div className="text-xs text-muted-foreground">geplant von {j.created_by}</div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{formatSwiss(j.scheduled_at)}</td>
                  <td className="px-4 py-2">
                    <span className={cn(
                      "inline-flex px-2 py-0.5 rounded-full text-xs font-medium",
                      STATUS_TONE[j.status] ?? "bg-muted text-muted-foreground"
                    )}>
                      {STATUS_LABEL[j.status] ?? j.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{formatResult(j.result)}</td>
                  <td className="px-4 py-2 text-right">
                    {j.status === "scheduled" ? (
                      <button
                        onClick={() => handleCancel(j)}
                        disabled={cancellingId === j.id}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium border border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                      >
                        {cancellingId === j.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <X className="h-3 w-3" />
                        )}
                        Abbrechen
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
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
