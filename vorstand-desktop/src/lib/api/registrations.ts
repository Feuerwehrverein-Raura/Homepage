import { apiClient } from "./client";
import type {
  MemberRegistration,
  PendingCount,
  ApproveRequest,
  RejectRequest,
} from "@/lib/types/registration";

export async function getPendingCount(): Promise<PendingCount> {
  const res = await apiClient.get<PendingCount>(
    "/member-registrations/count/pending"
  );
  return res.data;
}

export async function getRegistrations(
  status?: string
): Promise<MemberRegistration[]> {
  const res = await apiClient.get<MemberRegistration[]>(
    "/member-registrations",
    { params: status ? { status } : undefined }
  );
  return res.data;
}

export async function getRegistration(
  id: string
): Promise<MemberRegistration> {
  const res = await apiClient.get<MemberRegistration>(
    `/member-registrations/${id}`
  );
  return res.data;
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
