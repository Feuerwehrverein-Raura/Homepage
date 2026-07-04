import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import {
  Sun,
  Moon,
  Monitor,
  RefreshCw,
} from "lucide-react";
import { useSettingsStore } from "@/stores/settings-store";
import { checkForUpdates } from "@/lib/auto-updater";
import { cn } from "@/lib/utils";

export function SettingsPage() {
  const { theme, setTheme, autoUpdate, setAutoUpdate } = useSettingsStore();
  const [version, setVersion] = useState<string>("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion(""));
  }, []);

  const themes = [
    { value: "system" as const, label: "System", icon: Monitor },
    { value: "light" as const, label: "Hell", icon: Sun },
    { value: "dark" as const, label: "Dunkel", icon: Moon },
  ];

  const checkNow = async () => {
    setChecking(true);
    try {
      // Nicht-silent: zeigt "schon aktuell" bzw. Fehler und den Update-Dialog.
      await checkForUpdates(false);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Einstellungen</h1>

      <div className="max-w-lg space-y-6">
        {/* Theme */}
        <div className="rounded-lg border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3">Darstellung</h3>
          <div className="flex gap-2">
            {themes.map((t) => (
              <button
                key={t.value}
                onClick={() => setTheme(t.value)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium flex-1 justify-center transition-colors",
                  theme === t.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                )}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Updates */}
        <div className="rounded-lg border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3">Updates</h3>

          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span className="text-sm">
              Beim Start automatisch nach Updates suchen
              <span className="block text-xs text-muted-foreground">
                Gefundene Updates werden vor der Installation bestätigt.
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={autoUpdate}
              onClick={() => setAutoUpdate(!autoUpdate)}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
                autoUpdate ? "bg-primary" : "bg-input"
              )}
            >
              <span
                className={cn(
                  "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
                  autoUpdate ? "translate-x-5" : "translate-x-0.5"
                )}
              />
            </button>
          </label>

          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">
              Installierte Version{version ? `: ${version}` : ""}
            </span>
            <button
              type="button"
              onClick={checkNow}
              disabled={checking}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-60"
            >
              <RefreshCw className={cn("h-4 w-4", checking && "animate-spin")} />
              {checking ? "Suche…" : "Jetzt suchen"}
            </button>
          </div>
        </div>

        {/* About */}
        <div className="rounded-lg border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3">Info</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">App</span>
              <span className="font-medium">FWV Vorstand Desktop</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Framework</span>
              <span className="font-medium">Tauri v2</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">API</span>
              <span className="font-mono text-xs">api.fwv-raura.ch</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
