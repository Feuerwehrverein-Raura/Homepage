import { create } from "zustand";

type Theme = "system" | "light" | "dark";

interface SettingsState {
  theme: Theme;
  sidebarCollapsed: boolean;
  autoUpdate: boolean;
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
  setAutoUpdate: (enabled: boolean) => void;
  applyTheme: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  theme: (localStorage.getItem("theme") as Theme) || "system",
  sidebarCollapsed: localStorage.getItem("sidebarCollapsed") === "true",
  // Standard: an. Nur explizites "false" schaltet den Start-Check ab.
  autoUpdate: localStorage.getItem("autoUpdate") !== "false",

  setTheme: (theme: Theme) => {
    localStorage.setItem("theme", theme);
    set({ theme });
    get().applyTheme();
  },

  toggleSidebar: () => {
    const next = !get().sidebarCollapsed;
    localStorage.setItem("sidebarCollapsed", String(next));
    set({ sidebarCollapsed: next });
  },

  setAutoUpdate: (enabled: boolean) => {
    localStorage.setItem("autoUpdate", String(enabled));
    set({ autoUpdate: enabled });
  },

  applyTheme: () => {
    const { theme } = get();
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else if (theme === "light") {
      root.classList.remove("dark");
    } else {
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    }
  },
}));
