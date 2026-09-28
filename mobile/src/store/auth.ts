import { create } from 'zustand';

import { auth as authApi } from '../api/befit';
import { tokens } from '../api/client';

type Status = 'loading' | 'signed-out' | 'needs-onboarding' | 'ready';

type AuthState = {
  status: Status;
  userId: string | null;
  restore: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  completeOnboarding: () => void;
};

export const useAuth = create<AuthState>((set) => ({
  status: 'loading',
  userId: null,

  restore: async () => {
    const token = await tokens.access;
    if (!token) {
      set({ status: 'signed-out', userId: null });
      return;
    }
    // A stored token says nothing about whether onboarding finished, so ask
    // the server rather than trusting local state.
    try {
      const { me } = await import('../api/befit');
      await me.profile();
      set({ status: 'ready' });
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 409) set({ status: 'needs-onboarding' });
      else if (status === 401) { await tokens.clear(); set({ status: 'signed-out' }); }
      else set({ status: 'needs-onboarding' });
    }
  },

  signIn: async (email, password) => {
    const result = await authApi.login(email.trim(), password);
    await tokens.save(result.access_token, result.refresh_token);
    set({
      userId: result.user_id,
      status: result.has_profile ? 'ready' : 'needs-onboarding',
    });
  },

  register: async (email, password) => {
    const result = await authApi.register(email.trim(), password);
    await tokens.save(result.access_token, result.refresh_token);
    set({ userId: result.user_id, status: 'needs-onboarding' });
  },

  signOut: async () => {
    await tokens.clear();
    set({ status: 'signed-out', userId: null });
  },

  completeOnboarding: () => set({ status: 'ready' }),
}));
