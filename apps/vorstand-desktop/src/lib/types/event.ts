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
  max_participants: number | null;
  cost: string | null;
  organizer_name: string | null;
  organizer_email: string | null;
  shifts: Shift[];
  direct_registrations: DirectRegistrations | null;
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
  max_participants?: number | null;
  cost?: string | null;
  organizer_name?: string | null;
  organizer_email?: string | null;
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
  phone: string | null;
  notes: string | null;
  status: string;
  created_at: string | null;
  vorname: string | null;
  nachname: string | null;
}

export interface ShiftRegistrations {
  approved: EventRegistration[];
  pending: EventRegistration[];
  approved_count: number;
  pending_count: number;
  spots_left: number | null;
}

export interface DirectRegistrations {
  approved: EventRegistration[];
  pending: EventRegistration[];
  approved_count: number;
  pending_count: number;
}
