import { apiClient } from "./client";
import type { Member, MemberCreate, MemberStats } from "@/lib/types/member";

export async function getMembers(params?: {
  status?: string;
  search?: string;
}): Promise<Member[]> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.search) query.set("search", params.search);
  const qs = query.toString();
  return await apiClient.get<Member[]>(`/members${qs ? `?${qs}` : ""}`);
}

export async function getMember(id: string): Promise<Member> {
  return await apiClient.get<Member>(`/members/${id}`);
}

export async function getStats(): Promise<MemberStats> {
  return await apiClient.get<MemberStats>("/members/stats/overview");
}

export async function createMember(data: MemberCreate): Promise<Member> {
  return await apiClient.post<Member>("/members", data);
}

export async function updateMember(
  id: string,
  data: Partial<MemberCreate>
): Promise<Member> {
  return await apiClient.put<Member>(`/members/${id}`, data);
}

export async function deleteMember(id: string): Promise<void> {
  await apiClient.delete(`/members/${id}`);
}

export async function uploadPhoto(id: string, file: File): Promise<void> {
  const formData = new FormData();
  formData.append("photo", file);
  await apiClient.upload(`/members/${id}/photo`, formData);
}

export async function deletePhoto(id: string): Promise<void> {
  await apiClient.delete(`/members/${id}/photo`);
}
