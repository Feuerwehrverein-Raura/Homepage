import { create } from "zustand";
import * as membersApi from "@/lib/api/members";
import type { Member, MemberCreate, MemberStats } from "@/lib/types/member";

interface MembersState {
  members: Member[];
  stats: MemberStats | null;
  selectedMember: Member | null;
  filter: string;
  searchQuery: string;
  isLoading: boolean;
  error: string | null;
  fetchMembers: () => Promise<void>;
  fetchStats: () => Promise<void>;
  fetchMember: (id: string) => Promise<void>;
  createMember: (data: MemberCreate) => Promise<Member>;
  updateMember: (id: string, data: Partial<MemberCreate>) => Promise<void>;
  deleteMember: (id: string) => Promise<void>;
  setFilter: (filter: string) => void;
  setSearch: (query: string) => void;
}

export const useMembersStore = create<MembersState>((set, get) => ({
  members: [],
  stats: null,
  selectedMember: null,
  filter: "",
  searchQuery: "",
  isLoading: false,
  error: null,

  fetchMembers: async () => {
    set({ isLoading: true, error: null });
    try {
      const { filter, searchQuery } = get();
      const params: { status?: string; search?: string } = {};
      if (filter) params.status = filter;
      if (searchQuery) params.search = searchQuery;
      const members = await membersApi.getMembers(params);
      set({ members, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Fehler beim Laden",
        isLoading: false,
      });
    }
  },

  fetchStats: async () => {
    try {
      const stats = await membersApi.getStats();
      set({ stats });
    } catch {
      // non-critical
    }
  },

  fetchMember: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const member = await membersApi.getMember(id);
      set({ selectedMember: member, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Fehler beim Laden",
        isLoading: false,
      });
    }
  },

  createMember: async (data: MemberCreate) => {
    const member = await membersApi.createMember(data);
    get().fetchMembers();
    return member;
  },

  updateMember: async (id: string, data: Partial<MemberCreate>) => {
    await membersApi.updateMember(id, data);
    get().fetchMembers();
    get().fetchMember(id);
  },

  deleteMember: async (id: string) => {
    await membersApi.deleteMember(id);
    set({ selectedMember: null });
    get().fetchMembers();
    get().fetchStats();
  },

  setFilter: (filter: string) => {
    set({ filter });
    get().fetchMembers();
  },

  setSearch: (query: string) => {
    set({ searchQuery: query });
    get().fetchMembers();
  },
}));
