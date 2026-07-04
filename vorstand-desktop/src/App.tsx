import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth-store";
import { AppLayout } from "@/components/layout/AppLayout";
import { LoginPage } from "@/pages/login/LoginPage";
import { checkForUpdates } from "@/lib/auto-updater";
import { useSettingsStore } from "@/stores/settings-store";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const loadFromStorage = useAuthStore((s) => s.loadFromStorage);

  useEffect(() => {
    // Gespeicherten Login (Keyring) wiederherstellen, BEVOR ueber die
    // geschuetzten Routen entschieden wird — sonst landet man trotz gueltigem
    // 30-Tage-Token bei jedem Start auf /login.
    loadFromStorage();
    // Beim Start auf Update pruefen (silent: keine Fehler-Popups bei offline).
    // Kann in den Einstellungen abgeschaltet werden.
    if (useSettingsStore.getState().autoUpdate) checkForUpdates(true);
  }, [loadFromStorage]);

  // Warten bis der gespeicherte Token geladen wurde (kein Redirect-Flackern).
  if (!isHydrated) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Lädt…
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
