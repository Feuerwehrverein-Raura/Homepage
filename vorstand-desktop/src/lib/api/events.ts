import { apiClient } from "./client";
import type { Event, EventCreate, ShiftCreate } from "@/lib/types/event";

export async function getEvents(): Promise<Event[]> {
  const res = await apiClient.get<Event[]>("/events");
  return res.data;
}

export async function getEvent(id: string): Promise<Event> {
  const res = await apiClient.get<Event>(`/events/${id}`);
  return res.data;
}

export async function createEvent(data: EventCreate): Promise<Event> {
  const res = await apiClient.post<Event>("/events", data);
  return res.data;
}

export async function updateEvent(
  id: string,
  data: Partial<EventCreate>
): Promise<Event> {
  const res = await apiClient.put<Event>(`/events/${id}`, data);
  return res.data;
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
