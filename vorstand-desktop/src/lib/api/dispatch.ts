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
  const res = await apiClient.get<EmailTemplate[]>("/templates", {
    params: type ? { type } : undefined,
  });
  return res.data;
}

// Email
export async function sendEmail(
  data: SendEmailRequest
): Promise<EmailSendResponse> {
  const res = await apiClient.post<EmailSendResponse>("/email/send", data);
  return res.data;
}

export async function sendBulkEmail(
  data: BulkEmailRequest
): Promise<BulkEmailResponse> {
  const res = await apiClient.post<BulkEmailResponse>("/email/bulk", data);
  return res.data;
}

// Smart Dispatch
export async function smartDispatch(
  data: SmartDispatchRequest
): Promise<SmartDispatchResponse> {
  const res = await apiClient.post<SmartDispatchResponse>(
    "/dispatch/smart",
    data
  );
  return res.data;
}

// Pingen
export async function getPingenAccount(
  staging?: boolean
): Promise<PingenAccount> {
  const res = await apiClient.get<PingenAccount>("/pingen/account", {
    params: staging !== undefined ? { staging } : undefined,
  });
  return res.data;
}

export async function getPingenStats(): Promise<PingenStats> {
  const res = await apiClient.get<PingenStats>("/pingen/stats");
  return res.data;
}

export async function getPingenLetters(params?: {
  event_id?: string;
  member_id?: string;
  limit?: number;
}): Promise<PingenLetter[]> {
  const res = await apiClient.get<PingenLetter[]>("/pingen/letters", {
    params,
  });
  return res.data;
}

export async function getPingenLetterStatus(
  letterId: string
): Promise<PingenLetterStatus> {
  const res = await apiClient.get<PingenLetterStatus>(
    `/pingen/letters/${letterId}/status`
  );
  return res.data;
}

export async function sendPingenManual(
  data: PingenSendManualRequest
): Promise<PingenSendResponse> {
  const res = await apiClient.post<PingenSendResponse>(
    "/pingen/send-manual",
    data
  );
  return res.data;
}

export async function getPostMembers(): Promise<PostMembersResponse> {
  const res = await apiClient.get<PostMembersResponse>("/pingen/post-members");
  return res.data;
}

export async function sendPingenPdf(
  data: PingenSendPdfRequest
): Promise<PingenSendResponse> {
  const res = await apiClient.post<PingenSendResponse>("/pingen/send", data);
  return res.data;
}

export async function sendPingenBulkPdf(
  data: PingenBulkPdfRequest
): Promise<PingenBulkPdfResponse> {
  const res = await apiClient.post<PingenBulkPdfResponse>(
    "/pingen/send-bulk-pdf",
    data
  );
  return res.data;
}

// Dispatch Log
export async function getDispatchLog(params?: {
  type?: string;
  status?: string;
  member_id?: string;
  event_id?: string;
  limit?: number;
}): Promise<DispatchLogEntry[]> {
  const res = await apiClient.get<DispatchLogEntry[]>("/dispatch-log", {
    params,
  });
  return res.data;
}
