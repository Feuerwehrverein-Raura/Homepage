import { apiClient as api } from "./client";

export interface MailFolder {
  path: string;
  name: string;
  specialUse: string | null;
  flags: string[];
}

export interface MailListItem {
  uid: number;
  seq: number;
  subject: string;
  from: string;
  to: string;
  date: string;
  size: number;
  seen: boolean;
  flagged: boolean;
  answered: boolean;
  messageId: string;
}

export interface MailMessage {
  uid: number;
  subject: string;
  from: string;
  to: string;
  cc: string;
  date: string;
  text: string;
  html: string | null;
  messageId: string;
  inReplyTo: string | null;
  attachments: Array<{
    index: number;
    filename: string;
    contentType: string;
    size: number;
  }>;
}

export interface AccountsResponse {
  accounts: string[];
  missing: string[];
}

export interface MessagesResponse {
  messages: MailListItem[];
  total: number;
  unseen: number;
}

export const listAccounts = () => api.get<AccountsResponse>("/imap/accounts");

export const listFolders = (account: string) =>
  api.get<MailFolder[]>(`/imap/folders?account=${encodeURIComponent(account)}`);

export const listMessages = (account: string, folder: string, limit = 100) =>
  api.get<MessagesResponse>(
    `/imap/messages?account=${encodeURIComponent(account)}&folder=${encodeURIComponent(folder)}&limit=${limit}`
  );

export const getMessage = (uid: number, account: string, folder: string) =>
  api.get<MailMessage>(
    `/imap/messages/${uid}?account=${encodeURIComponent(account)}&folder=${encodeURIComponent(folder)}`
  );

export const setFlags = (
  uid: number,
  account: string,
  folder: string,
  add: string[],
  remove: string[]
) =>
  api.post<{ success: boolean }>(
    `/imap/messages/${uid}/flags?account=${encodeURIComponent(account)}&folder=${encodeURIComponent(folder)}`,
    { add, remove }
  );

export const deleteMessage = (uid: number, account: string, folder: string) =>
  api.delete<{ success: boolean }>(
    `/imap/messages/${uid}?account=${encodeURIComponent(account)}&folder=${encodeURIComponent(folder)}`
  );

export const attachmentUrl = (uid: number, index: number, account: string, folder: string) =>
  `/imap/messages/${uid}/attachments/${index}?account=${encodeURIComponent(account)}&folder=${encodeURIComponent(folder)}`;
