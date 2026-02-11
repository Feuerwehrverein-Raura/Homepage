import { create } from "zustand";
import * as eventsApi from "@/lib/api/events";
import type { Event, EventCreate, ShiftCreate } from "@/lib/types/event";

interface EventsState {
  events: Event[];
  selectedEvent: Event | null;
  isLoading: boolean;
  error: string | null;
  fetchEvents: () => Promise<void>;
  fetchEvent: (id: string) => Promise<void>;
  createEvent: (data: EventCreate) => Promise<Event>;
  updateEvent: (id: string, data: Partial<EventCreate>) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  createShift: (data: ShiftCreate) => Promise<void>;
  updateShift: (id: string, data: Partial<ShiftCreate>) => Promise<void>;
  deleteShift: (id: string) => Promise<void>;
  approveRegistration: (id: string) => Promise<void>;
  rejectRegistration: (id: string) => Promise<void>;
}

export const useEventsStore = create<EventsState>((set, get) => ({
  events: [],
  selectedEvent: null,
  isLoading: false,
  error: null,

  fetchEvents: async () => {
    set({ isLoading: true, error: null });
    try {
      const events = await eventsApi.getEvents();
      set({ events, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Fehler beim Laden",
        isLoading: false,
      });
    }
  },

  fetchEvent: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const event = await eventsApi.getEvent(id);
      set({ selectedEvent: event, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Fehler beim Laden",
        isLoading: false,
      });
    }
  },

  createEvent: async (data: EventCreate) => {
    const event = await eventsApi.createEvent(data);
    get().fetchEvents();
    return event;
  },

  updateEvent: async (id: string, data: Partial<EventCreate>) => {
    await eventsApi.updateEvent(id, data);
    get().fetchEvents();
    get().fetchEvent(id);
  },

  deleteEvent: async (id: string) => {
    await eventsApi.deleteEvent(id);
    set({ selectedEvent: null });
    get().fetchEvents();
  },

  createShift: async (data: ShiftCreate) => {
    await eventsApi.createShift(data);
    const event = get().selectedEvent;
    if (event) get().fetchEvent(event.id);
  },

  updateShift: async (id: string, data: Partial<ShiftCreate>) => {
    await eventsApi.updateShift(id, data);
    const event = get().selectedEvent;
    if (event) get().fetchEvent(event.id);
  },

  deleteShift: async (id: string) => {
    await eventsApi.deleteShift(id);
    const event = get().selectedEvent;
    if (event) get().fetchEvent(event.id);
  },

  approveRegistration: async (id: string) => {
    await eventsApi.approveRegistration(id);
    const event = get().selectedEvent;
    if (event) get().fetchEvent(event.id);
  },

  rejectRegistration: async (id: string) => {
    await eventsApi.rejectRegistration(id);
    const event = get().selectedEvent;
    if (event) get().fetchEvent(event.id);
  },
}));
