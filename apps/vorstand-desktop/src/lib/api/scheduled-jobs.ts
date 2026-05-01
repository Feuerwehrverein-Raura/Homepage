import { apiClient } from "./client";
import type { ScheduledJob, ScheduledJobCreate } from "@/lib/types/scheduled-job";

export async function listJobs(status?: string): Promise<ScheduledJob[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return await apiClient.get<ScheduledJob[]>(`/scheduled-jobs${qs}`);
}

export async function createJob(body: ScheduledJobCreate): Promise<ScheduledJob> {
  return await apiClient.post<ScheduledJob>(`/scheduled-jobs`, body);
}

export async function cancelJob(id: string): Promise<ScheduledJob> {
  return await apiClient.delete<ScheduledJob>(`/scheduled-jobs/${id}`);
}
