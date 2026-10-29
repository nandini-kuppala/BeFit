import { create } from 'zustand';

import { auth as authApi } from '../api/befit';
import { onAuthFailure, secure, tokens } from '../api/client';
import { queryClient } from '../lib/queryClient';

type Status = 'loading' | 'signed-out' | 'needs-onboarding' | 'ready';

/**
 * Whether the server last told us onboarding was done. Only consulted when the
 * server can't be asked — offline at launch, or the backend down — so a
 * returning user lands on her dashboard (with cached data) instead of being
 * marched back through onboarding.
 */
const HAS_PROFILE_KEY = 'befit.hasProfile';

function rememberHasProfile(value: boolean) {
  return secure.set(HAS_PROFILE_KEY, value ? '1' : '0').catch(() => {});
}

async function cachedHasProfile(): Promise<boolean | null> {
  try {
    const value = await secure.get(HAS_PROFILE_KEY);
    if (value === '1') return true;
    if (value === '0') return false;
  } catch {
    // Unreadable is the same as unknown.
  }
  return null;
}

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
    // the server rather than trusting local state — when it can be asked.
    try {
      const { me } = await import('../api/befit');
      await me.profile();
      rememberHasProfile(true);
      set({ status: 'ready' });
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 409) {
        rememberHasProfile(false);
        set({ status: 'needs-onboarding' });
      } else if (status === 401) {
        // The client has already cleared the tokens.
        set({ status: 'signed-out', userId: null });
      } else {
        // Offline, timed out, or the server is having a bad day. None of that
        // is evidence she hasn't onboarded; fall back to what we last knew.
        const known = await cachedHasProfile();
        set({ status: known === false ? 'needs-onboarding' : 'ready' });
      }
    }
  },

  signIn: async (email, password) => {
    const result = await authApi.login(email.trim(), password);
    await tokens.save(result.access_token, result.refresh_token);
    rememberHasProfile(result.has_profile);
    set({
      userId: result.user_id,
      status: result.has_profile ? 'ready' : 'needs-onboarding',
    });
  },

  register: async (email, password) => {
    const result = await authApi.register(email.trim(), password);
    await tokens.save(result.access_token, result.refresh_token);
    rememberHasProfile(false);
    set({ userId: result.user_id, status: 'needs-onboarding' });
  },

  signOut: async () => {
    await tokens.clear();
    await secure.remove(HAS_PROFILE_KEY).catch(() => {});
    // The next account on this phone must not see the last one's data.
    await queryClient.cancelQueries();
    queryClient.clear();
    set({ status: 'signed-out', userId: null });
  },

  completeOnboarding: () => {
    rememberHasProfile(true);
    set({ status: 'ready' });
  },
}));

// A definitive auth failure anywhere (refresh token rejected) signs out, which
// the root layout turns into a trip to the sign-in screen.
onAuthFailure(() => useAuth.getState().signOut());
