import { apiClient } from "./client";
import type { Event, EventCreate, ShiftCreate } from "@/lib/types/event";

export async function getEvents(): Promise<Event[]> {
  return await apiClient.get<Event[]>("/events");
}

export async function getEvent(id: string): Promise<Event> {
  return await apiClient.get<Event>(`/events/${id}`);
}

export async function createEvent(data: EventCreate): Promise<Event> {
  return await apiClient.post<Event>("/events", data);
}

export async function updateEvent(
  id: string,
  data: Partial<EventCreate>
): Promise<Event> {
  return await apiClient.put<Event>(`/events/${id}`, data);
}

export async function deleteEvent(id: string): Promise<void> {
  await apiClient.delete(`/events/${id}`);
}

export async function createShift(data: ShiftCreate): Promise<void> {
  await apiClient.post("/shifts", data);
}

export async function updateShift(
  id: string,
  data: Partial<ShiftCreate>
): Promise<void> {
  await apiClient.put(`/shifts/${id}`, data);
}

export async function deleteShift(id: string): Promise<void> {
  await apiClient.delete(`/shifts/${id}`);
}

export async function approveRegistration(id: string): Promise<void> {
  await apiClient.post(`/registrations/${id}/approve`);
}

export async function rejectRegistration(id: string): Promise<void> {
  await apiClient.post(`/registrations/${id}/reject`);
}

export async function updateRegistration(
  id: string,
  data: Record<string, unknown>
): Promise<void> {
  await apiClient.put(`/registrations/${id}`, data);
}

export async function createRegistration(
  data: Record<string, unknown>
): Promise<void> {
  await apiClient.post("/registrations", data);
}

export interface AlternativeShiftSuggestion {
  newShiftId: string;
  shiftInfo: {
    id?: string;
    bereich?: string | null;
    name: string;
    date?: string | null;
    time?: string;
  };
  comment?: string;
  email: string;
}

export async function suggestAlternativeShift(
  registrationId: string,
  data: AlternativeShiftSuggestion
): Promise<void> {
  await apiClient.post(
    `/registrations/${registrationId}/suggest-alternative`,
    data
  );
}

export interface NotifyRegistrantsResult {
  success: boolean;
  emailed: number;
  posted: number;
  skipped: number;
  unreachable: string[];
}

/**
 * Informiert alle Angemeldeten (bestaetigt + offen) ueber eine Event-Aenderung.
 * Kanal je Empfaenger nach Zustellpraeferenz (E-Mail bzw. Brief via Pingen).
 */
export async function notifyRegistrants(
  eventId: string,
  message: string,
  subject?: string
): Promise<NotifyRegistrantsResult> {
  return await apiClient.post<NotifyRegistrantsResult>(
    `/events/${eventId}/notify-registrants`,
    { message, subject }
  );
}
