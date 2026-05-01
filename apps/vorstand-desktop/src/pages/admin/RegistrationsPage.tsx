import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { formatSwissDateTime } from "@/lib/utils/date";
import * as registrationsApi from "@/lib/api/registrations";
import type { MemberRegistration } from "@/lib/types/registration";
import {
  UserPlus,
  Loader2,
  AlertCircle,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const statusFilters = [
  { value: "", label: "Alle" },
  { value: "pending", label: "Ausstehend" },
  { value: "approved", label: "Genehmigt" },
  { value: "rejected", label: "Abgelehnt" },
];

export function RegistrationsPage() {
  const [registrations, setRegistrations] = useState<MemberRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [approveStatus, setApproveStatus] = useState("Aktiv");
  const [rejectReason, setRejectReason] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await registrationsApi.getRegistrations(filter || undefined);
      setRegistrations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [filter]);

  const handleApprove = async (id: string) => {
    setActionLoading(id);
    try {
      await registrationsApi.approveRegistration(id, { memberStatus: approveStatus });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id: string) => {
    setActionLoading(id);
    try {
      await registrationsApi.rejectRegistration(id, { reason: rejectReason || undefined });
      setRejectReason("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Mitgliedschaftsantraege</h1>

      {/* Filter */}
      <div className="flex gap-1 mb-4">
        {statusFilters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
              filter === f.value
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 mb-4 rounded-md bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty */}
      {!loading && registrations.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <UserPlus className="h-12 w-12 mb-3 opacity-30" />
          <p>Keine Antraege vorhanden</p>
        </div>
      )}

      {/* Registrations */}
      {!loading && registrations.length > 0 && (
        <div className="space-y-3">
          {registrations.map((reg) => (
            <div key={reg.id} className="rounded-lg border bg-card">
              <button
                onClick={() => setExpandedId(expandedId === reg.id ? null : reg.id)}
                className="w-full flex items-center justify-between p-4 text-left"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{reg.vorname} {reg.nachname}</span>
                    <RegistrationStatusBadge status={reg.status} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {reg.email || "-"} &middot; {formatSwissDateTime(reg.created_at)}
                  </p>
                </div>
                {expandedId === reg.id ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>

              {expandedId === reg.id && (
                <div className="px-4 pb-4 border-t pt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                    <Detail label="Strasse" value={reg.strasse} />
                    <Detail label="PLZ / Ort" value={[reg.plz, reg.ort].filter(Boolean).join(" ") || null} />
                    <Detail label="Telefon" value={reg.telefon} />
                    <Detail label="Mobile" value={reg.mobile} />
                    <Detail label="Feuerwehr-Status" value={reg.feuerwehr_status} />
                    <Detail label="Korrespondenz" value={reg.korrespondenz_methode} />
                  </div>

                  {reg.processed_by && (
                    <p className="text-xs text-muted-foreground">
                      Bearbeitet von {reg.processed_by} am {formatSwissDateTime(reg.processed_at)}
                    </p>
                  )}
                  {reg.rejection_reason && (
                    <p className="text-xs text-red-600 dark:text-red-400">
                      Grund: {reg.rejection_reason}
                    </p>
                  )}

                  {reg.status === "pending" && (
                    <div className="flex items-end gap-3 pt-2 border-t">
                      <div>
                        <label className="block text-xs font-medium mb-1">Mitglied-Status</label>
                        <select
                          value={approveStatus}
                          onChange={(e) => setApproveStatus(e.target.value)}
                          className="px-2 py-1.5 rounded-md border border-input bg-background text-sm"
                        >
                          <option value="Aktiv">Aktiv</option>
                          <option value="Passiv">Passiv</option>
                        </select>
                      </div>
                      <button
                        onClick={() => handleApprove(reg.id)}
                        disabled={actionLoading === reg.id}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-50"
                      >
                        {actionLoading === reg.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <CheckCircle className="h-3 w-3" />
                        )}
                        Genehmigen
                      </button>

                      <div className="flex-1">
                        <label className="block text-xs font-medium mb-1">Ablehnungsgrund</label>
                        <input
                          type="text"
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="Optional"
                          className="w-full px-2 py-1.5 rounded-md border border-input bg-background text-sm"
                        />
                      </div>
                      <button
                        onClick={() => handleReject(reg.id)}
                        disabled={actionLoading === reg.id}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-50"
                      >
                        {actionLoading === reg.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <XCircle className="h-3 w-3" />
                        )}
                        Ablehnen
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}:</span>{" "}
      <span>{value || "-"}</span>
    </div>
  );
}

function RegistrationStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };
  return (
    <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-medium", colors[status] || "bg-muted text-muted-foreground")}>
      {status}
    </span>
  );
}
