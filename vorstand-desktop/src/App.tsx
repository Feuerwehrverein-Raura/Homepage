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
  useEffect(() => {
    // Beim Start auf Update pruefen (silent: keine Fehler-Popups bei offline).
    // Erfolgreiche Updates fragen den User per confirm() und starten neu.
    // Kann in den Einstellungen abgeschaltet werden.
    if (useSettingsStore.getState().autoUpdate) checkForUpdates(true);
  }, []);

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
