import { apiClient } from "./client";
import type {
  MemberRegistration,
  PendingCount,
  ApproveRequest,
  RejectRequest,
} from "@/lib/types/registration";

export async function getPendingCount(): Promise<PendingCount> {
  return await apiClient.get<PendingCount>(
    "/member-registrations/count/pending"
  );
}

export async function getRegistrations(
  status?: string
): Promise<MemberRegistration[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return await apiClient.get<MemberRegistration[]>(
    `/member-registrations${qs}`
  );
}

export async function getRegistration(
  id: string
): Promise<MemberRegistration> {
  return await apiClient.get<MemberRegistration>(
    `/member-registrations/${id}`
  );
}

export async function approveRegistration(
  id: string,
  data: ApproveRequest
): Promise<void> {
  await apiClient.post(`/member-registrations/${id}/approve`, data);
}

export async function rejectRegistration(
  id: string,
  data: RejectRequest
): Promise<void> {
  await apiClient.post(`/member-registrations/${id}/reject`, data);
}
