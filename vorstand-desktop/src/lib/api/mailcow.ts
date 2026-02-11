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
  const res = await apiClient.get<Mailbox[]>("/mailcow/mailboxes");
  return res.data;
}

export async function getMailbox(email: string): Promise<Mailbox> {
  const res = await apiClient.get<Mailbox>(`/mailcow/mailboxes/${email}`);
  return res.data;
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
  const res = await apiClient.get<MailAlias[]>("/mailcow/aliases");
  return res.data;
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
  const res = await apiClient.get<QuotaInfo[]>("/mailcow/quota");
  return res.data;
}

// Zustellung
export async function getZustellung(): Promise<ZustellungResponse> {
  const res = await apiClient.get<ZustellungResponse>(
    "/members/emails/zustellung"
  );
  return res.data;
}

export async function syncAlias(): Promise<SyncAliasResponse> {
  const res = await apiClient.post<SyncAliasResponse>(
    "/members/emails/sync-alias"
  );
  return res.data;
}
