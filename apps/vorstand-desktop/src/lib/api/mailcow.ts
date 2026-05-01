import { apiClient } from "./client";
import type {
  Mailbox,
  MailboxCreateRequest,
  MailAlias,
  QuotaInfo,
  ZustellungResponse,
  SyncAliasResponse,
} from "@/lib/types/mailcow";

// Mailboxes
export async function getMailboxes(): Promise<Mailbox[]> {
  return await apiClient.get<Mailbox[]>("/mailcow/mailboxes");
}

export async function getMailbox(email: string): Promise<Mailbox> {
  return await apiClient.get<Mailbox>(`/mailcow/mailboxes/${email}`);
}

export async function createMailbox(data: MailboxCreateRequest): Promise<void> {
  await apiClient.post("/mailcow/mailboxes", data);
}

export async function updateMailbox(
  email: string,
  data: Partial<MailboxCreateRequest>
): Promise<void> {
  await apiClient.put(`/mailcow/mailboxes/${email}`, data);
}

export async function deleteMailbox(email: string): Promise<void> {
  await apiClient.delete(`/mailcow/mailboxes/${email}`);
}

// Aliases
export async function getAliases(): Promise<MailAlias[]> {
  return await apiClient.get<MailAlias[]>("/mailcow/aliases");
}

export async function createAlias(data: {
  address: string;
  goto: string;
  active: boolean;
}): Promise<void> {
  await apiClient.post("/mailcow/aliases", data);
}

export async function updateAlias(
  id: number,
  data: { goto?: string; active?: boolean }
): Promise<void> {
  await apiClient.put(`/mailcow/aliases/${id}`, data);
}

export async function deleteAlias(id: number): Promise<void> {
  await apiClient.delete(`/mailcow/aliases/${id}`);
}

// Quota
export async function getQuota(): Promise<QuotaInfo[]> {
  return await apiClient.get<QuotaInfo[]>("/mailcow/quota");
}

// Zustellung
export async function getZustellung(): Promise<ZustellungResponse> {
  return await apiClient.get<ZustellungResponse>(
    "/members/emails/zustellung"
  );
}

export async function syncAlias(): Promise<SyncAliasResponse> {
  return await apiClient.post<SyncAliasResponse>(
    "/members/emails/sync-alias"
  );
}
