import { apiClient } from "./client";
import type {
  EmailTemplate,
  SendEmailRequest,
  EmailSendResponse,
  BulkEmailRequest,
  BulkEmailResponse,
  SmartDispatchRequest,
  SmartDispatchResponse,
  PingenAccount,
  PingenStats,
  PingenLetter,
  PingenLetterStatus,
  PingenSendManualRequest,
  PingenSendResponse,
  PingenSendPdfRequest,
  PingenBulkPdfRequest,
  PingenBulkPdfResponse,
  PostMembersResponse,
  DispatchLogEntry,
} from "@/lib/types/dispatch";

// Templates
export async function getTemplates(type?: string): Promise<EmailTemplate[]> {
  const qs = type ? `?type=${encodeURIComponent(type)}` : "";
  return await apiClient.get<EmailTemplate[]>(`/templates${qs}`);
}

// Email
export async function sendEmail(
  data: SendEmailRequest
): Promise<EmailSendResponse> {
  return await apiClient.post<EmailSendResponse>("/email/send", data);
}

export async function sendBulkEmail(
  data: BulkEmailRequest
): Promise<BulkEmailResponse> {
  return await apiClient.post<BulkEmailResponse>("/email/bulk", data);
}

// Smart Dispatch
export async function smartDispatch(
  data: SmartDispatchRequest
): Promise<SmartDispatchResponse> {
  return await apiClient.post<SmartDispatchResponse>(
    "/dispatch/smart",
    data
  );
}

// Pingen
export async function getPingenAccount(
  staging?: boolean
): Promise<PingenAccount> {
  const qs = staging !== undefined ? `?staging=${staging}` : "";
  return await apiClient.get<PingenAccount>(`/pingen/account${qs}`);
}

export async function getPingenStats(): Promise<PingenStats> {
  return await apiClient.get<PingenStats>("/pingen/stats");
}

export async function getPingenLetters(params?: {
  event_id?: string;
  member_id?: string;
  limit?: number;
}): Promise<PingenLetter[]> {
  const query = new URLSearchParams();
  if (params?.event_id) query.set("event_id", params.event_id);
  if (params?.member_id) query.set("member_id", params.member_id);
  if (params?.limit !== undefined) query.set("limit", String(params.limit));
  const qs = query.toString();
  return await apiClient.get<PingenLetter[]>(`/pingen/letters${qs ? `?${qs}` : ""}`);
}

export async function getPingenLetterStatus(
  letterId: string
): Promise<PingenLetterStatus> {
  return await apiClient.get<PingenLetterStatus>(
    `/pingen/letters/${letterId}/status`
  );
}

export async function sendPingenManual(
  data: PingenSendManualRequest
): Promise<PingenSendResponse> {
  return await apiClient.post<PingenSendResponse>(
    "/pingen/send-manual",
    data
  );
}

export async function getPostMembers(): Promise<PostMembersResponse> {
  return await apiClient.get<PostMembersResponse>("/pingen/post-members");
}

export async function sendPingenPdf(
  data: PingenSendPdfRequest
): Promise<PingenSendResponse> {
  return await apiClient.post<PingenSendResponse>("/pingen/send", data);
}

export async function sendPingenBulkPdf(
  data: PingenBulkPdfRequest
): Promise<PingenBulkPdfResponse> {
  return await apiClient.post<PingenBulkPdfResponse>(
    "/pingen/send-bulk-pdf",
    data
  );
}

// Dispatch Log
export async function getDispatchLog(params?: {
  type?: string;
  status?: string;
  member_id?: string;
  event_id?: string;
  limit?: number;
}): Promise<DispatchLogEntry[]> {
  const query = new URLSearchParams();
  if (params?.type) query.set("type", params.type);
  if (params?.status) query.set("status", params.status);
  if (params?.member_id) query.set("member_id", params.member_id);
  if (params?.event_id) query.set("event_id", params.event_id);
  if (params?.limit !== undefined) query.set("limit", String(params.limit));
  const qs = query.toString();
  return await apiClient.get<DispatchLogEntry[]>(`/dispatch-log${qs ? `?${qs}` : ""}`);
}
