import { apiClient } from "./client";
import type { LoginRequest, LoginResponse, UserInfo } from "@/lib/types/auth";

export async function login(data: LoginRequest): Promise<LoginResponse> {
  return await apiClient.post<LoginResponse>("/auth/vorstand/login", data);
}

export async function getMe(): Promise<UserInfo> {
  return await apiClient.get<UserInfo>("/auth/vorstand/me");
}
