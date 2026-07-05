import { apiClient } from "./client";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { useAuthStore } from "@/stores/auth-store";
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

export interface TemplateInput {
  name: string;
  type: string;
  subject: string;
  body: string;
  variables?: string[] | null;
}

export async function createTemplate(data: TemplateInput): Promise<EmailTemplate> {
  return await apiClient.post<EmailTemplate>("/templates", data);
}

export async function updateTemplate(
  id: string,
  data: TemplateInput
): Promise<EmailTemplate> {
  return await apiClient.put<EmailTemplate>(`/templates/${id}`, data);
}

export async function deleteTemplate(
  id: string
): Promise<{ success: boolean; deleted: string }> {
  return await apiClient.delete<{ success: boolean; deleted: string }>(
    `/templates/${id}`
  );
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

// Post-Versand: fertiges Brief-HTML pro Empfaenger -> Puppeteer-PDF -> Pingen
export interface DispatchPostRecipient {
  name: string;
  street: string | null;
  zip: string | null;
  city: string | null;
  country: string;
}

export interface SendPostRequest {
  html: string;
  recipient: DispatchPostRecipient;
  member_id?: string;
  subject?: string;
  staging?: boolean;
  pdf_margin?: { top: string; right: string; bottom: string; left: string };
}

export interface SendPostResponse {
  success: boolean;
  letter_id?: string;
}

export async function sendPost(
  data: SendPostRequest
): Promise<SendPostResponse> {
  return await apiClient.post<SendPostResponse>("/dispatch/send-post", data);
}

// PDF-Brief mit Deckblatt: Deckblatt-HTML + hochgeladenes PDF (base64) -> Pingen
export interface SendPdfPostRequest {
  cover_html: string;
  pdf_base64: string;
  recipient: DispatchPostRecipient;
  member_id?: string;
  subject?: string;
  staging?: boolean;
}

export async function sendPdfPost(
  data: SendPdfPostRequest
): Promise<SendPostResponse> {
  return await apiClient.post<SendPostResponse>("/dispatch/send-pdf-post", data);
}

// Vorschau: Brief-HTML serverseitig zu PDF rendern (Blob) — zum Anzeigen vor
// dem echten Versand. Binaer, daher tauriFetch statt apiClient.
export async function previewLetterPdf(
  html: string,
  pdfMargin?: { top: string; right: string; bottom: string; left: string }
): Promise<Blob> {
  const token = useAuthStore.getState().token;
  const res = await tauriFetch(
    "https://api.fwv-raura.ch/dispatch/preview-pdf?zones=1",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ html, pdf_margin: pdfMargin }),
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return await res.blob();
}

// Pingen-Webhooks (automatische Brief-Status-Updates)
export interface PingenWebhook {
  id: string;
  attributes?: {
    url?: string;
    event_category?: string;
    [k: string]: unknown;
  };
}

export async function getPingenWebhooks(
  staging = false
): Promise<PingenWebhook[]> {
  return await apiClient.get<PingenWebhook[]>(
    `/pingen/webhooks?staging=${staging}`
  );
}

export async function registerPingenWebhook(staging = false): Promise<unknown> {
  return await apiClient.post("/pingen/webhooks/register", { staging });
}

export async function deletePingenWebhook(
  id: string,
  staging = false
): Promise<unknown> {
  return await apiClient.delete(`/pingen/webhooks/${id}?staging=${staging}`);
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
  // Backend erwartet snake_case (member_id/event_id) — Mapping hier.
  return await apiClient.post<PingenSendResponse>("/pingen/send-manual", {
    member_id: data.memberId,
    event_id: data.eventId,
    subject: data.subject,
    body: data.body,
    staging: data.staging,
  });
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
