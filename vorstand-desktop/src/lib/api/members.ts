import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { apiClient } from "./client";
import { useAuthStore } from "@/stores/auth-store";
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

export interface PasswordResetResult {
  success: boolean;
  tempPassword: string;
  message: string;
}

export interface PasswordSetResult {
  success: boolean;
  message: string;
}

export async function resetPassword(
  id: string
): Promise<PasswordResetResult> {
  return await apiClient.post<PasswordResetResult>(
    `/members/${id}/reset-password`
  );
}

export async function setPassword(
  id: string,
  password: string
): Promise<PasswordSetResult> {
  return await apiClient.post<PasswordSetResult>(
    `/members/${id}/set-password`,
    { password }
  );
}

// ---------------------------------------------------------------------------
// Gruppen & Rollen (Authentik-Gruppenzugehoerigkeit)
// ---------------------------------------------------------------------------

export interface NextcloudAdminStatus {
  has_authentik: boolean;
  nextcloud_admin: boolean;
}

export interface VorstandGroupStatus {
  has_authentik: boolean;
  vorstand_group: boolean;
}

export interface SocialMediaGroupStatus {
  has_authentik: boolean;
  social_media_group: boolean;
}

export interface GroupToggleResult {
  success: boolean;
  member_id: string;
  message: string;
  nextcloud_admin?: boolean;
  vorstand_group?: boolean;
  social_media_group?: boolean;
}

export async function getNextcloudAdmin(
  id: string
): Promise<NextcloudAdminStatus> {
  return await apiClient.get<NextcloudAdminStatus>(
    `/members/${id}/nextcloud-admin`
  );
}

export async function setNextcloudAdmin(
  id: string,
  enabled: boolean
): Promise<GroupToggleResult> {
  return await apiClient.post<GroupToggleResult>(
    `/members/${id}/nextcloud-admin`,
    { enabled }
  );
}

export async function getVorstandGroup(
  id: string
): Promise<VorstandGroupStatus> {
  return await apiClient.get<VorstandGroupStatus>(
    `/members/${id}/vorstand-group`
  );
}

export async function setVorstandGroup(
  id: string,
  enabled: boolean
): Promise<GroupToggleResult> {
  return await apiClient.post<GroupToggleResult>(
    `/members/${id}/vorstand-group`,
    { enabled }
  );
}

export async function getSocialMediaGroup(
  id: string
): Promise<SocialMediaGroupStatus> {
  return await apiClient.get<SocialMediaGroupStatus>(
    `/members/${id}/social-media-group`
  );
}

export async function setSocialMediaGroup(
  id: string,
  enabled: boolean
): Promise<GroupToggleResult> {
  return await apiClient.post<GroupToggleResult>(
    `/members/${id}/social-media-group`,
    { enabled }
  );
}

// ---------------------------------------------------------------------------
// Telefonliste als PDF
// ---------------------------------------------------------------------------

// Laedt die Telefonliste als PDF und liefert sie als Blob zurueck. Nutzt
// tauriFetch direkt (statt apiClient), da die Antwort binaer ist und nicht
// als JSON geparst werden darf.
export async function downloadTelefonlistePdf(status?: string): Promise<Blob> {
  const token = useAuthStore.getState().token;
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await tauriFetch(
    `https://api.fwv-raura.ch/members/pdf/telefonliste${qs}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return await res.blob();
}
