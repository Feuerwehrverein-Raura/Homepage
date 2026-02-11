export interface AuditEntry {
  id: string;
  action: string;
  new_values: Record<string, unknown> | null;
  email: string | null;
  ip_address: string | null;
  created_at: string | null;
}
