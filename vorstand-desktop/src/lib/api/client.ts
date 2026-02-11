import { fetch } from "@tauri-apps/plugin-http";
import { useAuthStore } from "@/stores/auth-store";

const API_BASE = "https://api.fwv-raura.ch";
const ORDER_BASE = "https://order.fwv-raura.ch";

interface RequestConfig {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

async function request<T>(baseUrl: string, path: string, config: RequestConfig = {}): Promise<T> {
  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...config.headers,
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const url = `${baseUrl}${path}`;
  const init: RequestInit = {
    method: config.method || "GET",
    headers,
  };
  if (config.body !== undefined) {
    init.body = JSON.stringify(config.body);
  }

  const response = await fetch(url, init);

  if (response.status === 401 || response.status === 403) {
    if (!path.includes("/auth/vorstand/login")) {
      useAuthStore.getState().logout();
    }
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `HTTP ${response.status}`);
  }

  const text = await response.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

async function uploadMultipart<T>(path: string, formData: FormData): Promise<T> {
  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `HTTP ${response.status}`);
  }

  const text = await response.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

// API client for api.fwv-raura.ch
export const apiClient = {
  get: <T>(path: string) => request<T>(API_BASE, path),
  post: <T>(path: string, body?: unknown) => request<T>(API_BASE, path, { method: "POST", body }),
  put: <T>(path: string, body?: unknown) => request<T>(API_BASE, path, { method: "PUT", body }),
  patch: <T>(path: string, body?: unknown) => request<T>(API_BASE, path, { method: "PATCH", body }),
  delete: <T>(path: string) => request<T>(API_BASE, path, { method: "DELETE" }),
  upload: <T>(path: string, formData: FormData) => uploadMultipart<T>(path, formData),
};

// Order client for order.fwv-raura.ch
export const orderClient = {
  get: <T>(path: string) => request<T>(ORDER_BASE, path),
  post: <T>(path: string, body?: unknown) => request<T>(ORDER_BASE, path, { method: "POST", body }),
  put: <T>(path: string, body?: unknown) => request<T>(ORDER_BASE, path, { method: "PUT", body }),
  delete: <T>(path: string) => request<T>(ORDER_BASE, path, { method: "DELETE" }),
};
