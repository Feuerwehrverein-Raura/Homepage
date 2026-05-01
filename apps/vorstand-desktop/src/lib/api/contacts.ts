import { apiClient as api } from "./client";

export interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string;
  organisation: string;
  notes: string;
  source: "shared" | "member" | "discovered";
}

export interface ContactsResponse {
  shared: Contact[];
  members: Contact[];
  discovered: Contact[];
}

export const listContacts = () => api.get<ContactsResponse>("/contacts");

export const createContact = (data: Partial<Contact>) =>
  api.post<Contact>("/contacts", data);

export const updateContact = (id: string, data: Partial<Contact>) =>
  api.put<Contact>(`/contacts/${id}`, data);

export const deleteContact = (id: string) =>
  api.delete<{ success: boolean }>(`/contacts/${id}`);
