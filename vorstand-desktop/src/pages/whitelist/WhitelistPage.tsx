import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { formatSwissDateTime } from "@/lib/utils/date";
import * as whitelistApi from "@/lib/api/whitelist";
import type { WhitelistEntry } from "@/lib/types/whitelist";
import {
  Shield,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle,
  XCircle,
  Globe,
  RefreshCw,
  List,
} from "lucide-react";

export function WhitelistPage() {
  const [entries, setEntries] = useState<WhitelistEntry[]>([]);
  const [myIp, setMyIp] = useState<string | null>(null);
  const [isWhitelisted, setIsWhitelisted] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addIp, setAddIp] = useState("");
  const [addDevice, setAddDevice] = useState("");
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ip, check, en, list] = await Promise.all([
        whitelistApi.getMyIp(),
        whitelistApi.checkWhitelist(),
        whitelistApi.getWhitelistEnabled(),
        whitelistApi.getWhitelist(),
      ]);
      setMyIp(ip.ip);
      setIsWhitelisted(check.whitelisted);
      setEnabled(en.enabled);
      setEntries(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleToggleEnabled = async () => {
    if (enabled === null) return;
    try {
      await whitelistApi.setWhitelistEnabled(!enabled);
      setEnabled(!enabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    }
  };

  const handleAdd = async () => {
    if (!addIp) return;
    setAdding(true);
    try {
      await whitelistApi.addToWhitelist({
        ipAddress: addIp,
        deviceName: addDevice || undefined,
      });
      setShowAdd(false);
      setAddIp("");
      setAddDevice("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setAdding(false);
    }
  };

  const handleAddMyIp = async () => {
    if (!myIp) return;
    setAdding(true);
    try {
      await whitelistApi.addToWhitelist({
        ipAddress: myIp,
        deviceName: "Desktop App",
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await whitelistApi.removeFromWhitelist(id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    }
  };

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">IP-Whitelist</h1>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">IP-Whitelist</h1>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 mb-4 rounded-md bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Status Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {/* My IP */}
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Meine IP</span>
          </div>
          <p className="text-lg font-mono font-bold">{myIp || "-"}</p>
          <div className="flex items-center gap-1 mt-1">
            {isWhitelisted ? (
              <>
                <CheckCircle className="h-3 w-3 text-green-600" />
                <span className="text-xs text-green-600">Freigeschaltet</span>
              </>
            ) : (
              <>
                <XCircle className="h-3 w-3 text-red-600" />
                <span className="text-xs text-red-600">Nicht freigeschaltet</span>
              </>
            )}
          </div>
          {!isWhitelisted && myIp && (
            <button
              onClick={handleAddMyIp}
              disabled={adding}
              className="mt-2 flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs hover:bg-primary/90 disabled:opacity-50"
            >
              {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Jetzt freischalten
            </button>
          )}
        </div>

        {/* Whitelist Status */}
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Whitelist</span>
          </div>
          <p className={cn("text-lg font-bold", enabled ? "text-green-600" : "text-muted-foreground")}>
            {enabled ? "Aktiv" : "Inaktiv"}
          </p>
          <button
            onClick={handleToggleEnabled}
            className="mt-2 text-xs text-primary hover:underline"
          >
            {enabled ? "Deaktivieren" : "Aktivieren"}
          </button>
        </div>

        {/* Count */}
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <List className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Eintraege</span>
          </div>
          <p className="text-lg font-bold">{entries.length}</p>
          <button
            onClick={load}
            className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="h-3 w-3" />
            Aktualisieren
          </button>
        </div>
      </div>

      {/* Add Form */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          IP hinzufuegen
        </button>
      </div>

      {showAdd && (
        <div className="rounded-lg border bg-card p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">IP-Adresse *</label>
              <input
                value={addIp}
                onChange={(e) => setAddIp(e.target.value)}
                placeholder="192.168.1.1"
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Geraetename</label>
              <input
                value={addDevice}
                onChange={(e) => setAddDevice(e.target.value)}
                placeholder="z.B. Buero-PC"
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={adding || !addIp}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
            >
              {adding && <Loader2 className="h-3 w-3 animate-spin" />}
              Hinzufuegen
            </button>
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 rounded-md border text-sm hover:bg-muted">
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Entries Table */}
      {entries.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <Shield className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Keine Whitelist-Eintraege</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium">IP-Adresse</th>
                <th className="text-left px-4 py-3 font-medium">Geraet</th>
                <th className="text-left px-4 py-3 font-medium">Erstellt von</th>
                <th className="text-left px-4 py-3 font-medium">Erstellt am</th>
                <th className="text-left px-4 py-3 font-medium">Ablauf</th>
                <th className="text-right px-4 py-3 font-medium">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-mono">{entry.ip_address}</td>
                  <td className="px-4 py-3 text-muted-foreground">{entry.device_name || "-"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{entry.created_by || "-"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatSwissDateTime(entry.created_at)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {entry.is_permanent ? (
                      <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        Permanent
                      </span>
                    ) : (
                      formatSwissDateTime(entry.expires_at)
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleRemove(entry.id)}
                      className="p-1 rounded hover:bg-destructive/10 text-destructive"
                      title="Entfernen"
                    >
                      <Trash2 className="h-4 w-4" />
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
