import { apiClient as api } from "./client";

export interface VorstandAppToken {
  id: string;
  email: string;
  description: string | null;
  created_at: string;
  last_used_at: string | null;
}

export interface MemberAppToken {
  id: string;
  member_id: string;
  description: string | null;
  created_at: string;
  created_by: string | null;
  last_used_at: string | null;
  vorname: string | null;
  nachname: string | null;
  email: string | null;
}

export interface NewVorstandToken extends VorstandAppToken {
  token: string;
}

export interface NewMemberToken {
  id: string;
  member_id: string;
  description: string | null;
  created_at: string;
  token: string;
  member: { id: string; email: string; vorname: string; nachname: string };
}

// --- Vorstand ---
export const listVorstandTokens = () =>
  api.get<VorstandAppToken[]>("/auth/vorstand/app-tokens");

export const createVorstandToken = (email: string, description?: string) =>
  api.post<NewVorstandToken>("/auth/vorstand/app-tokens", { email, description });

export const revokeVorstandToken = (id: string) =>
  api.delete<{ success: boolean }>(`/auth/vorstand/app-tokens/${id}`);

// --- Mitglied ---
export const listMemberTokens = () =>
  api.get<MemberAppToken[]>("/auth/member/app-tokens");

export const createMemberToken = (member_id: string, description?: string) =>
  api.post<NewMemberToken>("/auth/member/app-tokens", { member_id, description });

export const revokeMemberToken = (id: string) =>
  api.delete<{ success: boolean }>(`/auth/member/app-tokens/${id}`);
