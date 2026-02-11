import { apiClient } from "./client";
import type { LoginRequest, LoginResponse, UserInfo } from "@/lib/types/auth";

export async function login(data: LoginRequest): Promise<LoginResponse> {
  const res = await apiClient.post<LoginResponse>("/auth/vorstand/login", data);
  return res.data;
}

export async function getMe(): Promise<UserInfo> {
  const res = await apiClient.get<UserInfo>("/auth/vorstand/me");
  return res.data;
}
