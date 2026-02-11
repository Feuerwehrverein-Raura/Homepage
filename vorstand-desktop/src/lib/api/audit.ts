import { apiClient } from "./client";
import type { AuditEntry } from "@/lib/types/audit";

export async function getAuditLog(params?: {
  action?: string;
  limit?: number;
  since?: string;
}): Promise<AuditEntry[]> {
  const res = await apiClient.get<AuditEntry[]>("/audit", { params });
  return res.data;
}
