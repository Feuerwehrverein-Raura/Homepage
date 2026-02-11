import { apiClient } from "./client";
import type { AuditEntry } from "@/lib/types/audit";

export async function getAuditLog(params?: {
  action?: string;
  limit?: number;
  since?: string;
}): Promise<AuditEntry[]> {
  const query = new URLSearchParams();
  if (params?.action) query.set("action", params.action);
  if (params?.limit !== undefined) query.set("limit", String(params.limit));
  if (params?.since) query.set("since", params.since);
  const qs = query.toString();
  return await apiClient.get<AuditEntry[]>(`/audit${qs ? `?${qs}` : ""}`);
}
