import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import * as mailcowApi from "@/lib/api/mailcow";
import type {
  Mailbox,
  MailAlias,
  QuotaInfo,
  ZustellungResponse,
} from "@/lib/types/mailcow";
import {
  Mail,
  AtSign,
  HardDrive,
  List,
  Loader2,
  AlertCircle,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle,
  XCircle,
} from "lucide-react";

type Tab = "mailboxes" | "aliases" | "storage" | "zustellung";

export function MailcowPage() {
  const [activeTab, setActiveTab] = useState<Tab>("mailboxes");

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "mailboxes", label: "Postfaecher", icon: Mail },
    { key: "aliases", label: "Aliase", icon: AtSign },
    { key: "storage", label: "Speicher", icon: HardDrive },
    { key: "zustellung", label: "Zustellliste", icon: List },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">E-Mail-Verwaltung</h1>

      <div className="flex gap-1 mb-6 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "mailboxes" && <MailboxesTab />}
      {activeTab === "aliases" && <AliasesTab />}
      {activeTab === "storage" && <StorageTab />}
      {activeTab === "zustellung" && <ZustellungTab />}
    </div>
  );
}

/* ========== Mailboxes Tab ========== */
function MailboxesTab() {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ local_part: "", name: "", password: "", quota: 1024, active: true });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setMailboxes(await mailcowApi.getMailboxes());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    setSaving(true);
    try {
      await mailcowApi.createMailbox(createForm);
      setShowCreate(false);
      setCreateForm({ local_part: "", name: "", password: "", quota: 1024, active: true });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (email: string) => {
    if (!confirm(`${email} wirklich loeschen?`)) return;
    try {
      await mailcowApi.deleteMailbox(email);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Neues Postfach
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4" />{error}
        </div>
      )}

      {showCreate && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h3 className="font-semibold text-sm">Neues Postfach</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Benutzername (vor @)</label>
              <input
                value={createForm.local_part}
                onChange={(e) => setCreateForm({ ...createForm, local_part: e.target.value })}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Name</label>
              <input
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Passwort</label>
              <input
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Quota (MB)</label>
              <input
                type="number"
                value={createForm.quota}
                onChange={(e) => setCreateForm({ ...createForm, quota: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={saving || !createForm.local_part || !createForm.password}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3 w-3 animate-spin" />}
              Erstellen
            </button>
            <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 rounded-md border text-sm hover:bg-muted">
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {mailboxes.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <Mail className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Keine Postfaecher</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium">E-Mail</th>
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Quota</th>
                <th className="text-left px-4 py-3 font-medium">Aktiv</th>
                <th className="text-right px-4 py-3 font-medium">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {mailboxes.map((mb) => (
                <tr key={mb.username} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{mb.username}</td>
                  <td className="px-4 py-3 text-muted-foreground">{mb.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatMB(mb.quota_used)} / {formatMB(mb.quota)}
                  </td>
                  <td className="px-4 py-3">
                    {mb.active ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(mb.username)}
                      className="p-1 rounded hover:bg-destructive/10 text-destructive"
                      title="Loeschen"
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

/* ========== Aliases Tab ========== */
function AliasesTab() {
  const [aliases, setAliases] = useState<MailAlias[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ address: "", goto: "", active: true });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setAliases(await mailcowApi.getAliases());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    setSaving(true);
    try {
      await mailcowApi.createAlias(createForm);
      setShowCreate(false);
      setCreateForm({ address: "", goto: "", active: true });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Alias wirklich loeschen?")) return;
    try {
      await mailcowApi.deleteAlias(id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Neuer Alias
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4" />{error}
        </div>
      )}

      {showCreate && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h3 className="font-semibold text-sm">Neuer Alias</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Alias-Adresse</label>
              <input
                value={createForm.address}
                onChange={(e) => setCreateForm({ ...createForm, address: e.target.value })}
                placeholder="alias@fwv-raura.ch"
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Weiterleitung an</label>
              <input
                value={createForm.goto}
                onChange={(e) => setCreateForm({ ...createForm, goto: e.target.value })}
                placeholder="ziel@example.com"
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={saving || !createForm.address || !createForm.goto}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3 w-3 animate-spin" />}
              Erstellen
            </button>
            <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 rounded-md border text-sm hover:bg-muted">
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {aliases.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <AtSign className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Keine Aliase</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium">Alias</th>
                <th className="text-left px-4 py-3 font-medium">Weiterleitung</th>
                <th className="text-left px-4 py-3 font-medium">Aktiv</th>
                <th className="text-right px-4 py-3 font-medium">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {aliases.map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{a.address}</td>
                  <td className="px-4 py-3 text-muted-foreground">{a.goto}</td>
                  <td className="px-4 py-3">
                    {a.active ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(a.id)}
                      className="p-1 rounded hover:bg-destructive/10 text-destructive"
                      title="Loeschen"
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

/* ========== Storage Tab ========== */
function StorageTab() {
  const [quotas, setQuotas] = useState<QuotaInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mailcowApi
      .getQuota()
      .then(setQuotas)
      .catch((err) => setError(err instanceof Error ? err.message : "Fehler"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
        <AlertCircle className="h-4 w-4" />{error}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {quotas.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">Keine Daten</div>
      )}
      {quotas.map((q) => (
        <div key={q.email} className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="font-medium">{q.email}</p>
              <p className="text-xs text-muted-foreground">{q.name}</p>
            </div>
            <span className="text-sm font-medium">
              {formatMB(q.quota_used)} / {formatMB(q.quota)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                q.percent_used > 90
                  ? "bg-red-500"
                  : q.percent_used > 70
                    ? "bg-amber-500"
                    : "bg-green-500"
              )}
              style={{ width: `${Math.min(q.percent_used, 100)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1 text-right">
            {q.percent_used.toFixed(1)}%
          </p>
        </div>
      ))}
    </div>
  );
}

/* ========== Zustellung Tab ========== */
function ZustellungTab() {
  const [zustellung, setZustellung] = useState<ZustellungResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setZustellung(await mailcowApi.getZustellung());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await mailcowApi.syncAlias();
      setSyncResult(
        res.success
          ? `Sync erfolgreich: ${res.action || "ok"} (${res.recipients || 0} Empfaenger)`
          : "Sync fehlgeschlagen"
      );
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Sync");
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {zustellung?.count || 0} Mitglieder mit E-Mail-Zustellung
        </p>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Alias synchronisieren
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4" />{error}
        </div>
      )}

      {syncResult && (
        <div className="p-3 rounded-md bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400 text-sm">
          {syncResult}
        </div>
      )}

      {zustellung?.members && zustellung.members.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">E-Mail</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {zustellung.members.map((m) => (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{m.vorname} {m.nachname}</td>
                  <td className="px-4 py-3 text-muted-foreground">{m.email || "-"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{m.status || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatMB(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(0)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}
