import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import * as authApi from "@/lib/api/auth";
import { isTokenExpired } from "@/lib/utils/token";
import type { UserInfo } from "@/lib/types/auth";

interface AuthState {
  token: string | null;
  user: UserInfo | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  loadFromStorage: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, _get) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await authApi.login({ email, password });
      if (res.success && res.token) {
        await invoke("save_token", { token: res.token });
        set({
          token: res.token,
          user: res.user,
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        set({ error: "Login fehlgeschlagen", isLoading: false });
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message.includes("401")
            ? "Falsche Anmeldedaten"
            : err.message.includes("403")
              ? "Kein Vorstandszugang"
              : err.message
          : "Netzwerkfehler";
      set({ error: msg, isLoading: false });
    }
  },

  logout: () => {
    invoke("clear_token").catch(console.error);
    set({ token: null, user: null, isAuthenticated: false });
    window.location.href = "/login";
  },

  loadFromStorage: async () => {
    try {
      const token = await invoke<string | null>("load_token");
      if (token && !isTokenExpired(token)) {
        set({ token, isAuthenticated: true });
        try {
          const user = await authApi.getMe();
          set({ user });
        } catch {
          // Token valid but /me failed - still authenticated
        }
      } else if (token) {
        // Token expired
        await invoke("clear_token");
      }
    } catch {
      // No stored token
    }
  },
}));
