import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { formatSwissDateTime } from "@/lib/utils/date";
import * as auditApi from "@/lib/api/audit";
import type { AuditEntry } from "@/lib/types/audit";
import {
  Shield,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export function AuditPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await auditApi.getAuditLog({
        action: actionFilter || undefined,
        limit: 200,
      });
      setLogs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [actionFilter]);

  // Collect unique actions for filter
  const actions = Array.from(new Set(logs.map((l) => l.action))).sort();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Audit-Protokoll</h1>

      {/* Filter */}
      <div className="flex items-center gap-3 mb-4">
        <label className="text-sm font-medium">Aktion:</label>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Alle</option>
          {actions.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground ml-auto">
          {logs.length} Eintraege
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 mb-4 rounded-md bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={load} className="ml-auto text-xs underline">Erneut</button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty */}
      {!loading && logs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Shield className="h-12 w-12 mb-3 opacity-30" />
          <p>Keine Audit-Eintraege</p>
        </div>
      )}

      {/* Table */}
      {!loading && logs.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium w-8"></th>
                <th className="text-left px-4 py-3 font-medium">Aktion</th>
                <th className="text-left px-4 py-3 font-medium">Benutzer</th>
                <th className="text-left px-4 py-3 font-medium">IP</th>
                <th className="text-left px-4 py-3 font-medium">Datum</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <>
                  <tr
                    key={log.id}
                    onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                    className={cn(
                      "border-b cursor-pointer transition-colors hover:bg-muted/50",
                      expandedId === log.id && "bg-muted/30"
                    )}
                  >
                    <td className="px-4 py-3 text-muted-foreground">
                      {log.new_values ? (
                        expandedId === log.id ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded bg-muted text-xs font-medium">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{log.email || "-"}</td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{log.ip_address || "-"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatSwissDateTime(log.created_at)}</td>
                  </tr>
                  {expandedId === log.id && log.new_values && (
                    <tr key={`${log.id}-details`}>
                      <td colSpan={5} className="px-4 py-3 bg-muted/20">
                        <pre className="text-xs font-mono whitespace-pre-wrap max-h-64 overflow-y-auto">
                          {JSON.stringify(log.new_values, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
