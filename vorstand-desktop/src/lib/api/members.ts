import { apiClient } from "./client";
import type { Member, MemberCreate, MemberStats } from "@/lib/types/member";

export async function getMembers(params?: {
  status?: string;
  search?: string;
}): Promise<Member[]> {
  const res = await apiClient.get<Member[]>("/members", { params });
  return res.data;
}

export async function getMember(id: string): Promise<Member> {
  const res = await apiClient.get<Member>(`/members/${id}`);
  return res.data;
}

export async function getStats(): Promise<MemberStats> {
  const res = await apiClient.get<MemberStats>("/members/stats/overview");
  return res.data;
}

export async function createMember(data: MemberCreate): Promise<Member> {
  const res = await apiClient.post<Member>("/members", data);
  return res.data;
}

export async function updateMember(
  id: string,
  data: Partial<MemberCreate>
): Promise<Member> {
  const res = await apiClient.put<Member>(`/members/${id}`, data);
  return res.data;
}

export async function deleteMember(id: string): Promise<void> {
  await apiClient.delete(`/members/${id}`);
}

export async function uploadPhoto(id: string, file: File): Promise<void> {
  const formData = new FormData();
  formData.append("photo", file);
  await apiClient.post(`/members/${id}/photo`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}

export async function deletePhoto(id: string): Promise<void> {
  await apiClient.delete(`/members/${id}/photo`);
}
