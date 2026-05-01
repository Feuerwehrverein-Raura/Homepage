import { useSettingsStore } from "@/stores/settings-store";
import {
  Sun,
  Moon,
  Monitor,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function SettingsPage() {
  const { theme, setTheme } = useSettingsStore();

  const themes = [
    { value: "system" as const, label: "System", icon: Monitor },
    { value: "light" as const, label: "Hell", icon: Sun },
    { value: "dark" as const, label: "Dunkel", icon: Moon },
  ];

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

        {/* Auto-Update */}
        <div className="rounded-lg border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3">Updates</h3>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Info className="h-4 w-4" />
            <span>Auto-Update wird ueber Tauri Updater konfiguriert.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
