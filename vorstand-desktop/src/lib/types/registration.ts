export interface MemberRegistration {
  id: string;
  vorname: string;
  nachname: string;
  email: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  telefon: string | null;
  mobile: string | null;
  feuerwehr_status: string | null;
  korrespondenz_methode: string | null;
  status: string;
  processed_by: string | null;
  processed_at: string | null;
  rejection_reason: string | null;
  created_at: string | null;
}

export interface PendingCount {
  count: number;
}

export interface ApproveRequest {
  memberStatus: string;
}

export interface RejectRequest {
  reason?: string;
}
