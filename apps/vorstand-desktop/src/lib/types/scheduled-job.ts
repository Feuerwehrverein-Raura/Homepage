export interface ScheduledJob {
  id: string;
  action: string;
  payload: Record<string, unknown> | null;
  label: string | null;
  scheduled_at: string;
  /** scheduled | running | done | failed | cancelled */
  status: string;
  result: Record<string, unknown> | null;
  started_at: string | null;
  finished_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ScheduledJobCreate {
  action: string;
  payload?: Record<string, unknown>;
  label?: string;
  scheduled_at: string;
}
