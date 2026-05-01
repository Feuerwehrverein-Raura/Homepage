export interface EmailTemplate {
  id: string;
  name: string;
  type: string;
  subject: string;
  body: string;
  variables: string[] | null;
  created_at: string | null;
}

export interface SendEmailRequest {
  to?: string;
  subject?: string;
  body?: string;
  templateId?: string;
  variables?: Record<string, string>;
  memberId?: string;
  eventId?: string;
}

export interface BulkEmailRequest {
  memberIds: string[];
  templateId?: string;
  subject?: string;
  body?: string;
  variables?: Record<string, string>;
}

export interface EmailSendResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface BulkEmailResponse {
  success: boolean;
  sent?: number;
  failed?: number;
  errors?: string[];
}

export interface SmartDispatchRequest {
  templateGroup: string;
  memberIds: string[];
  variables?: Record<string, string>;
  staging: boolean;
}

export interface SmartDispatchResponse {
  success: boolean;
  summary?: DispatchSummary;
  details?: unknown[];
}

export interface DispatchSummary {
  email: number;
  briefCh: number;
  briefDe: number;
  skipped: number;
}

export interface PingenAccount {
  name: string | null;
  balance: number;
  currency: string;
  isStaging: boolean;
}

export interface PingenStats {
  total: number;
  sent: number;
  pending: number;
  failed: number;
  last30Days: number;
  last7Days: number;
}

export interface PingenLetter {
  id: string;
  external_id: string | null;
  member_id: string | null;
  member_name: string | null;
  event_id: string | null;
  event_title: string | null;
  subject: string;
  status: string;
  created_at: string | null;
}

export interface PingenLetterStatus {
  letterId: string;
  status: string;
  price: number | null;
  pages: number | null;
  sentAt: string | null;
}

export interface PingenSendManualRequest {
  memberId: string;
  eventId?: string;
  subject: string;
  body: string;
  staging: boolean;
}

export interface PingenSendResponse {
  success: boolean;
  letterId?: string;
  error?: string;
}

export interface PingenSendPdfRequest {
  memberId?: string;
  eventId?: string;
  pdfBase64: string;
  recipient?: unknown;
  staging: boolean;
}

export interface PingenBulkPdfRequest {
  pdfBase64: string;
  subject?: string;
  memberIds?: string[];
  staging: boolean;
}

export interface PingenBulkPdfResponse {
  totalRecipients: number;
  successCount: number;
  failedCount: number;
  success?: unknown[];
  failed?: unknown[];
  staging: boolean;
}

export interface PostMembersResponse {
  count: number;
  members: Array<{
    id: string;
    vorname: string;
    nachname: string;
    strasse: string | null;
    plz: string | null;
    ort: string | null;
  }>;
}

export interface DispatchLogEntry {
  id: string;
  type: string;
  member_id: string | null;
  member_name: string | null;
  event_id: string | null;
  subject: string | null;
  status: string;
  created_at: string | null;
}
