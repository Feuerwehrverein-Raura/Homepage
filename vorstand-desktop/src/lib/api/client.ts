import axios from "axios";
import { useAuthStore } from "@/stores/auth-store";

export const apiClient = axios.create({
  baseURL: "https://api.fwv-raura.ch",
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

export const orderClient = axios.create({
  baseURL: "https://order.fwv-raura.ch",
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      const url = error.config?.url || "";
      if (!url.includes("/auth/vorstand/login")) {
        useAuthStore.getState().logout();
      }
    }
    return Promise.reject(error);
  }
);

orderClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
