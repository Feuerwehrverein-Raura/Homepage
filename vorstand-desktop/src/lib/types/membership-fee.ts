/** Eine Beitragszahlung (1 Mitglied + 1 Jahr) inkl. Mitglieder-Daten via JOIN. */
export interface MembershipFeePayment {
  id: string;
  member_id: string;
  year: number;
  amount: string | null;
  reference_nr: string | null;
  bank_reference: string | null;
  /** "offen" oder "bezahlt" */
  status: string | null;
  paid_date: string | null;
  payment_method: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  // JOIN auf members
  vorname: string | null;
  nachname: string | null;
  email: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  member_status: string | null;
}

export interface MembershipFeeSummary {
  total: number;
  paid: number;
  open: number;
  total_amount: string | null;
  paid_amount: string | null;
  open_amount: string | null;
}

export interface MarkFeePaidRequest {
  paid_date?: string;
  payment_method?: string;
  notes?: string;
}

export interface MembershipFeeSettings {
  id: string | null;
  year: number;
  amount: string | null;
  gv_date: string | null;
  due_date: string | null;
  description: string | null;
}

export interface FeeSettingsUpsert {
  year: number;
  amount: string;
  gv_date?: string | null;
  due_date?: string | null;
  description?: string | null;
}

export interface GeneratePaymentsResponse {
  created: number;
  skipped: number;
  total: number;
}
