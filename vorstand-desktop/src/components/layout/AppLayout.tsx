import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { useAuthStore } from "@/stores/auth-store";
import { useSettingsStore } from "@/stores/settings-store";

// Page imports
import { MembersListPage } from "@/pages/members/MembersListPage";
import { MemberDetailPage } from "@/pages/members/MemberDetailPage";
import { MemberFormPage } from "@/pages/members/MemberFormPage";
import { EventsListPage } from "@/pages/events/EventsListPage";
import { EventDetailPage } from "@/pages/events/EventDetailPage";
import { EventFormPage } from "@/pages/events/EventFormPage";
import { DispatchPage } from "@/pages/dispatch/DispatchPage";
import { RegistrationsPage } from "@/pages/admin/RegistrationsPage";
import { AuditPage } from "@/pages/admin/AuditPage";
import { MailcowPage } from "@/pages/mailcow/MailcowPage";
import { VaultPage } from "@/pages/vault/VaultPage";
import { WhitelistPage } from "@/pages/whitelist/WhitelistPage";
import { MassPdfPage } from "@/pages/masspdf/MassPdfPage";
import { SettingsPage } from "@/pages/settings/SettingsPage";

export function AppLayout() {
  const loadFromStorage = useAuthStore((s) => s.loadFromStorage);
  const applyTheme = useSettingsStore((s) => s.applyTheme);

  useEffect(() => {
    loadFromStorage();
    applyTheme();
  }, [loadFromStorage, applyTheme]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-background">
        <div className="p-6">
          <Routes>
            <Route index element={<Navigate to="/members" replace />} />
            <Route path="members" element={<MembersListPage />} />
            <Route path="members/new" element={<MemberFormPage />} />
            <Route path="members/:id" element={<MemberDetailPage />} />
            <Route path="members/:id/edit" element={<MemberFormPage />} />
            <Route path="events" element={<EventsListPage />} />
            <Route path="events/new" element={<EventFormPage />} />
            <Route path="events/:id" element={<EventDetailPage />} />
            <Route path="events/:id/edit" element={<EventFormPage />} />
            <Route path="dispatch" element={<DispatchPage />} />
            <Route path="registrations" element={<RegistrationsPage />} />
            <Route path="audit" element={<AuditPage />} />
            <Route path="mailcow" element={<MailcowPage />} />
            <Route path="vault" element={<VaultPage />} />
            <Route path="whitelist" element={<WhitelistPage />} />
            <Route path="mass-pdf" element={<MassPdfPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
