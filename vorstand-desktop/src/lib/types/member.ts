export interface Member {
  id: string;
  vorname: string;
  nachname: string;
  email: string | null;
  versand_email: string | null;
  anrede: string | null;
  geschlecht: string | null;
  geburtstag: string | null;
  strasse: string | null;
  adresszusatz: string | null;
  plz: string | null;
  ort: string | null;
  telefon: string | null;
  mobile: string | null;
  status: string | null;
  funktion: string | null;
  eintrittsdatum: string | null;
  feuerwehr_zugehoerigkeit: boolean | null;
  zustellung_email: boolean | null;
  zustellung_post: boolean | null;
  foto: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface MemberCreate {
  vorname: string;
  nachname: string;
  email?: string | null;
  versand_email?: string | null;
  anrede?: string | null;
  geschlecht?: string | null;
  geburtstag?: string | null;
  strasse?: string | null;
  adresszusatz?: string | null;
  plz?: string | null;
  ort?: string | null;
  telefon?: string | null;
  mobile?: string | null;
  status?: string | null;
  funktion?: string | null;
  eintrittsdatum?: string | null;
  feuerwehr_zugehoerigkeit?: boolean | null;
  zustellung_email?: boolean | null;
  zustellung_post?: boolean | null;
}

export interface MemberStats {
  total: number;
  aktiv: number;
  passiv: number;
  ehren: number;
}
