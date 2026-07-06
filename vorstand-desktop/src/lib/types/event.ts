export interface Event {
  id: string;
  title: string;
  subtitle: string | null;
  slug: string | null;
  category: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  description: string | null;
  registration_deadline: string | null;
  registration_required: boolean | null;
  max_participants: number | null;
  cost: string | null;
  organizer_name: string | null;
  organizer_email: string | null;
  /** Verknuepftes Organisator-Mitglied — verwaltet den Anlass in der Mitglieder-App. */
  organizer_id?: string | null;
  /** Organisator-Zugang (Event-Dashboard): Login-E-Mail, falls eingerichtet. */
  event_email?: string | null;
  /** Menue-Optionen fuer GV-Events (Anmeldung mit Essenswahl). */
  meal_options?: string[] | null;
  pdf_filename?: string | null;
  shifts: Shift[];
  /** Backend sendet camelCase; snake_case bleibt fuer Abwaertskompat. der Reads. */
  direct_registrations?: DirectRegistrations | null;
  directRegistrations?: DirectRegistrations | null;
  created_at: string | null;
}

export interface EventCreate {
  title: string;
  subtitle?: string | null;
  category?: string | null;
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  location?: string | null;
  description?: string | null;
  registration_deadline?: string | null;
  registration_required?: boolean | null;
  max_participants?: number | null;
  cost?: string | null;
  organizer_name?: string | null;
  organizer_email?: string | null;
  /**
   * Organisator ist ein verknuepftes Mitglied (Member.id). Ist es gesetzt,
   * ueberspringt das Backend den separaten Token-Zugang — das Mitglied
   * verwaltet den Anlass direkt in der Mitglieder-App.
   */
  organizer_id?: string | null;
  slug?: string | null;
  /** Menue-Optionen fuer GV-Events. */
  meal_options?: string[] | null;
  /** Beim Erstellen/Bearbeiten: Organisator-Zugang (Event-Dashboard) einrichten. */
  create_access?: boolean;
  /** PDF-Aushang als base64 (data-URL-Inhalt ohne Prefix) + Dateiname. */
  pdf_attachment?: string | null;
  pdf_filename?: string | null;
}

export interface Shift {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  needed: number | null;
  bereich: string | null;
  filled: number | null;
  registrations: ShiftRegistrations | null;
}

export interface ShiftCreate {
  event_id?: string;
  name: string;
  description?: string | null;
  date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  needed?: number | null;
  bereich?: string | null;
}

export interface EventRegistration {
  id: string;
  name: string | null;
  shift_id: string | null;
  member_id: string | null;
  guest_name: string | null;
  guest_email: string | null;
  /** Aufgeloeste E-Mail (Mitglied oder Gast) — auch bei Schicht-Anmeldungen. */
  email?: string | null;
  phone: string | null;
  notes: string | null;
  status: string;
  created_at: string | null;
  vorname: string | null;
  nachname: string | null;
}

// Wire-Format vom Backend ist camelCase.
export interface ShiftRegistrations {
  approved: EventRegistration[];
  pending: EventRegistration[];
  approvedCount: number;
  pendingCount: number;
  spotsLeft: number | null;
}

export interface DirectRegistrations {
  approved: EventRegistration[];
  pending: EventRegistration[];
  approvedCount: number;
  pendingCount: number;
}
