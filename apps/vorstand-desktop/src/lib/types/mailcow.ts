export interface Mailbox {
  username: string;
  name: string;
  domain: string;
  quota: number;
  quota_used: number;
  active: boolean;
}

export interface MailboxCreateRequest {
  local_part: string;
  name: string;
  password: string;
  quota: number;
  active: boolean;
}

export interface MailAlias {
  id: number;
  address: string;
  goto: string;
  domain: string;
  active: boolean;
}

export interface QuotaInfo {
  email: string;
  name: string;
  quota: number;
  quota_used: number;
  percent_used: number;
}

export interface ZustellungResponse {
  count: number;
  emails: string[];
  formatted: string;
  members: ZustellungMember[];
}

export interface ZustellungMember {
  id: string;
  vorname: string | null;
  nachname: string | null;
  email: string | null;
  status: string | null;
}

export interface SyncAliasResponse {
  success: boolean;
  action?: string;
  alias?: string;
  recipients?: number;
  emails?: string[];
}
