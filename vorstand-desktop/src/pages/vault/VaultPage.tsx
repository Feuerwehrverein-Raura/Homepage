import { useState } from "react";
import type { DecryptedVaultItem } from "@/lib/types/vaultwarden";
import { VAULT_TYPE_LOGIN, VAULT_TYPE_SECURE_NOTE, VAULT_TYPE_CARD, VAULT_TYPE_IDENTITY } from "@/lib/types/vaultwarden";
import { cn } from "@/lib/utils";
import {
  Lock,
  Key,
  Search,
  Copy,
  Eye,
  EyeOff,
  StickyNote,
  CreditCard,
  User,
  Loader2,
  AlertCircle,
  LogOut,
} from "lucide-react";

export function VaultPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [logging, setLogging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<DecryptedVaultItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<number | null>(null);
  const [revealedFields, setRevealedFields] = useState<Set<string>>(new Set());
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLogging(true);
    setError(null);
    try {
      // Vault login will be implemented via Tauri Rust commands (Phase 7)
      // For now show a message
      setError("Vaultwarden-Integration wird in Phase 7 mit Rust-Crypto implementiert. Die UI ist vorbereitet.");
      setLogging(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login fehlgeschlagen");
      setLogging(false);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setItems([]);
    setEmail("");
    setPassword("");
  };

  const toggleReveal = (fieldKey: string) => {
    setRevealedFields((prev) => {
      const next = new Set(prev);
      if (next.has(fieldKey)) next.delete(fieldKey);
      else next.add(fieldKey);
      return next;
    });
  };

  const copyToClipboard = async (value: string, fieldKey: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(fieldKey);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Fallback
    }
  };

  const getTypeIcon = (type: number) => {
    switch (type) {
      case VAULT_TYPE_LOGIN: return <Key className="h-4 w-4" />;
      case VAULT_TYPE_SECURE_NOTE: return <StickyNote className="h-4 w-4" />;
      case VAULT_TYPE_CARD: return <CreditCard className="h-4 w-4" />;
      case VAULT_TYPE_IDENTITY: return <User className="h-4 w-4" />;
      default: return <Lock className="h-4 w-4" />;
    }
  };

  const getTypeLabel = (type: number) => {
    switch (type) {
      case VAULT_TYPE_LOGIN: return "Login";
      case VAULT_TYPE_SECURE_NOTE: return "Notiz";
      case VAULT_TYPE_CARD: return "Karte";
      case VAULT_TYPE_IDENTITY: return "Identitaet";
      default: return "Andere";
    }
  };

  const filteredItems = items.filter((item) => {
    if (typeFilter !== null && item.type !== typeFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        (item.subtitle?.toLowerCase().includes(q)) ||
        (item.organizationName?.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Login form
  if (!isLoggedIn) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Passwort-Tresor</h1>
        <div className="max-w-md mx-auto">
          <div className="rounded-lg border bg-card p-6">
            <div className="flex justify-center mb-4">
              <Lock className="h-12 w-12 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold text-center mb-4">Vaultwarden Login</h2>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">E-Mail</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Master-Passwort</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
              </div>
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={logging}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {logging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                Entsperren
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Vault view
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Passwort-Tresor</h1>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-muted transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sperren
        </button>
      </div>

      {/* Search + Filter */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Suchen..."
            className="w-full pl-9 pr-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex gap-1">
          {[
            { value: null, label: "Alle" },
            { value: VAULT_TYPE_LOGIN, label: "Login" },
            { value: VAULT_TYPE_SECURE_NOTE, label: "Notizen" },
            { value: VAULT_TYPE_CARD, label: "Karten" },
            { value: VAULT_TYPE_IDENTITY, label: "Identitaet" },
          ].map((f) => (
            <button
              key={String(f.value)}
              onClick={() => setTypeFilter(f.value)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                typeFilter === f.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Items */}
      {filteredItems.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <Key className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Keine Eintraege gefunden</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredItems.map((item) => (
            <div key={item.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-muted-foreground">{getTypeIcon(item.type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{item.name}</p>
                  {item.subtitle && (
                    <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground px-2 py-0.5 rounded bg-muted">
                  {getTypeLabel(item.type)}
                </span>
              </div>

              {/* Copy fields */}
              {item.copyFields.length > 0 && (
                <div className="space-y-1 mt-2">
                  {item.copyFields.map((field) => {
                    const fieldKey = `${item.id}-${field.label}`;
                    const isPassword = field.label.toLowerCase().includes("passwort") || field.label.toLowerCase().includes("password");
                    const isRevealed = revealedFields.has(fieldKey);

                    return (
                      <div key={fieldKey} className="flex items-center gap-2 text-sm">
                        <span className="text-xs text-muted-foreground w-24 shrink-0">{field.label}</span>
                        <span className="flex-1 font-mono text-xs truncate">
                          {isPassword && !isRevealed ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : field.value}
                        </span>
                        {isPassword && (
                          <button
                            onClick={() => toggleReveal(fieldKey)}
                            className="p-1 rounded hover:bg-muted text-muted-foreground"
                          >
                            {isRevealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          </button>
                        )}
                        <button
                          onClick={() => copyToClipboard(field.value, fieldKey)}
                          className="p-1 rounded hover:bg-muted text-muted-foreground"
                          title="Kopieren"
                        >
                          {copiedField === fieldKey ? (
                            <span className="text-xs text-green-600">Kopiert</span>
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {item.notes && (
                <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap">{item.notes}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
