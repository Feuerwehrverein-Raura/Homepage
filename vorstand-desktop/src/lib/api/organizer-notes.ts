import { apiClient } from "./client";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { useAuthStore } from "@/stores/auth-store";
import type { OrganizerNote, OrganizerNoteCreate } from "@/lib/types/event";

const API_BASE = "https://api.fwv-raura.ch";

// Notizen eines Anlasses laden (Backend liefert neueste zuerst).
export async function listOrganizerNotes(
  eventId: string
): Promise<OrganizerNote[]> {
  return await apiClient.get<OrganizerNote[]>(
    `/events/${eventId}/organizer-notes`
  );
}

// Neue Notiz anlegen. Mind. `content` ODER 1 Anhang muss gesetzt sein.
export async function createOrganizerNote(
  eventId: string,
  data: OrganizerNoteCreate
): Promise<OrganizerNote> {
  return await apiClient.post<OrganizerNote>(
    `/events/${eventId}/organizer-notes`,
    data
  );
}

export async function deleteOrganizerNote(
  eventId: string,
  noteId: string
): Promise<void> {
  await apiClient.delete(`/events/${eventId}/organizer-notes/${noteId}`);
}

export async function deleteOrganizerNoteAttachment(
  eventId: string,
  noteId: string,
  attachmentId: string
): Promise<void> {
  await apiClient.delete(
    `/events/${eventId}/organizer-notes/${noteId}/attachments/${attachmentId}`
  );
}

// Anhang authentifiziert (Bearer) laden und als Blob zurueckgeben. Nutzt
// tauriFetch direkt statt apiClient, da die Antwort binaer ist und nicht als
// JSON geparst werden darf (analog downloadTelefonlistePdf / previewLetterPdf).
export async function fetchOrganizerNoteAttachment(
  eventId: string,
  noteId: string,
  attachmentId: string
): Promise<Blob> {
  const token = useAuthStore.getState().token;
  const res = await tauriFetch(
    `${API_BASE}/events/${eventId}/organizer-notes/${noteId}/attachments/${attachmentId}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return await res.blob();
}
