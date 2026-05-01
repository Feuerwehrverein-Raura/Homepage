import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useMembersStore } from "@/stores/members-store";
import { formatSwissDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils";
import {
  Users,
  UserCheck,
  UserMinus,
  Award,
  Plus,
  Search,
  Loader2,
  AlertCircle,
} from "lucide-react";

const statusFilters = [
  { value: "", label: "Alle" },
  { value: "Aktiv", label: "Aktiv" },
  { value: "Passiv", label: "Passiv" },
  { value: "Ehren", label: "Ehren" },
];

export function MembersListPage() {
  const navigate = useNavigate();
  const {
    members,
    stats,
    filter,
    isLoading,
    error,
    fetchMembers,
    fetchStats,
    setFilter,
    setSearch,
  } = useMembersStore();

  const [searchInput, setSearchInput] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    fetchMembers();
    fetchStats();
  }, [fetchMembers, fetchStats]);

  const handleSearch = (value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(value), 300);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Mitglieder</h1>
        <button
          onClick={() => navigate("/members/new")}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Neues Mitglied
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatsCard
            icon={Users}
            label="Total"
            value={stats.total}
            color="text-foreground"
          />
          <StatsCard
            icon={UserCheck}
            label="Aktiv"
            value={stats.aktiv}
            color="text-green-600 dark:text-green-400"
          />
          <StatsCard
            icon={UserMinus}
            label="Passiv"
            value={stats.passiv}
            color="text-amber-600 dark:text-amber-400"
          />
          <StatsCard
            icon={Award}
            label="Ehren"
            value={stats.ehren}
            color="text-blue-600 dark:text-blue-400"
          />
        </div>
      )}

      {/* Search + Filter */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Mitglied suchen..."
            className="w-full pl-9 pr-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex gap-1">
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
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 mb-4 rounded-md bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button
            onClick={fetchMembers}
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
      {!isLoading && !error && members.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Users className="h-12 w-12 mb-3 opacity-30" />
          <p>Keine Mitglieder gefunden</p>
        </div>
      )}

      {/* Members Table */}
      {!isLoading && members.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">E-Mail</th>
                <th className="text-left px-4 py-3 font-medium">Ort</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Funktion</th>
                <th className="text-left px-4 py-3 font-medium">Eintritt</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => navigate(`/members/${m.id}`)}
                  className="border-b last:border-0 hover:bg-muted/50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-medium">
                    {m.vorname} {m.nachname}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {m.email || "-"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {m.ort || "-"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={m.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {m.funktion || "-"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatSwissDate(m.eintrittsdatum)}
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

function StatsCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-lg border bg-card">
      <Icon className={cn("h-5 w-5", color)} />
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const colors: Record<string, string> = {
    Aktiv: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    Passiv: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    Ehren: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
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
