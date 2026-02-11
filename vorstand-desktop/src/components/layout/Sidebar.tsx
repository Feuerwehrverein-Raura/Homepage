import { NavLink, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/auth-store";
import { useSettingsStore } from "@/stores/settings-store";
import { cn } from "@/lib/utils";
import {
  Users,
  Calendar,
  Send,
  ClipboardList,
  FileText,
  Mail,
  KeyRound,
  Shield,
  FileUp,
  Settings,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import logo from "@/assets/logo.png";

const navItems = [
  { path: "/members", label: "Mitglieder", icon: Users },
  { path: "/events", label: "Anlaesse", icon: Calendar },
  { path: "/dispatch", label: "Versand", icon: Send },
  { path: "/registrations", label: "Antraege", icon: ClipboardList },
  { path: "/audit", label: "Audit", icon: FileText },
  { path: "/mailcow", label: "E-Mail", icon: Mail },
  { path: "/vault", label: "Tresor", icon: KeyRound },
  { path: "/whitelist", label: "Whitelist", icon: Shield },
  { path: "/mass-pdf", label: "Massen-PDF", icon: FileUp },
  { path: "/settings", label: "Einstellungen", icon: Settings },
];

export function Sidebar() {
  const { user, logout } = useAuthStore();
  const { sidebarCollapsed, toggleSidebar } = useSettingsStore();
  const location = useLocation();

  return (
    <aside
      className={cn(
        "flex flex-col h-screen transition-all duration-200",
        sidebarCollapsed ? "w-14" : "w-56"
      )}
    >
      {/* Header - Feuerwehrrot */}
      <div className="flex items-center gap-2 px-3 py-3 bg-sidebar text-sidebar-foreground">
        <img src={logo} alt="FWV Logo" className="h-8 w-8 shrink-0 rounded" />
        {!sidebarCollapsed && (
          <span className="font-semibold text-sm truncate">FWV Vorstand</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 bg-card border-r border-border">
        {navItems.map((item) => {
          const isActive = location.pathname.startsWith(item.path);
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2 mx-1 rounded-md text-sm transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border bg-card border-r p-2 space-y-1">
        {!sidebarCollapsed && user && (
          <div className="px-2 py-1 text-xs text-muted-foreground truncate">
            {user.name || user.email}
          </div>
        )}
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2 mx-1 w-full rounded-md text-sm text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors"
          title="Abmelden"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && <span>Abmelden</span>}
        </button>
        <button
          onClick={toggleSidebar}
          className="flex items-center gap-3 px-3 py-2 mx-1 w-full rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          title={sidebarCollapsed ? "Sidebar ausklappen" : "Sidebar einklappen"}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="h-4 w-4 shrink-0" />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4 shrink-0" />
              <span>Einklappen</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
