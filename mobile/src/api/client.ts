import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const ACCESS_KEY = 'befit.access';
const REFRESH_KEY = 'befit.refresh';
const BASE_URL_KEY = 'befit.baseUrl';

/**
 * Resolve the API host.
 *
 * The Android emulator reaches the host machine on 10.0.2.2, never localhost.
 * A physical device needs the LAN IP, which Expo already knows because it
 * served the bundle from there.
 */
function resolveBaseUrl(): string {
  const override = process.env.EXPO_PUBLIC_API_URL;
  if (override) return override;

  const hostUri =
    Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost ?? '';
  const lanHost = hostUri.split(':')[0];

  if (Platform.OS === 'android') {
    // An emulator reports localhost; a real device reports the LAN address.
    if (!lanHost || lanHost === 'localhost' || lanHost === '127.0.0.1') {
      return 'http://10.0.2.2:8000';
    }
    return `http://${lanHost}:8000`;
  }
  if (lanHost && lanHost !== 'localhost') return `http://${lanHost}:8000`;
  return 'http://127.0.0.1:8000';
}

/** The address compiled in at build time — the fallback, not the law. */
export const DEFAULT_BASE_URL = resolveBaseUrl();

/**
 * The address actually used, which the user can change from inside the app.
 *
 * A standalone build has no Metro to ask, so the host has to be baked in — and
 * a baked host is wrong the moment the network changes: a new DHCP lease, a
 * phone hotspot, a deployed server. Rebuilding the APK for each of those is not
 * a workable answer, so the value is editable and persisted instead.
 */
let currentBaseUrl = DEFAULT_BASE_URL;

export function getBaseUrl(): string {
  return currentBaseUrl;
}

/** Trims, adds a scheme if missing, and drops any trailing slash. */
export function normaliseBaseUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

/** Called once at startup, before anything issues a request. */
export async function loadStoredBaseUrl(): Promise<string> {
  try {
    const stored = await secure.get(BASE_URL_KEY);
    if (stored) currentBaseUrl = stored;
  } catch {
    // A failed read just means we keep the compiled-in default.
  }
  return currentBaseUrl;
}

export async function setStoredBaseUrl(url: string): Promise<string> {
  const next = normaliseBaseUrl(url);
  currentBaseUrl = next || DEFAULT_BASE_URL;
  if (next) await secure.set(BASE_URL_KEY, next);
  else await secure.remove(BASE_URL_KEY);
  return currentBaseUrl;
}

export async function resetBaseUrl(): Promise<string> {
  currentBaseUrl = DEFAULT_BASE_URL;
  await secure.remove(BASE_URL_KEY);
  return currentBaseUrl;
}

/** Unauthenticated reachability probe, used by the server settings screen. */
export async function pingServer(
  url: string,
  timeoutMs = 6000,
): Promise<{ ok: boolean; detail: string }> {
  const target = normaliseBaseUrl(url);
  if (!target) return { ok: false, detail: 'Enter an address first.' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${target}/health`, { signal: controller.signal });
    if (!response.ok) return { ok: false, detail: `Server replied ${response.status}.` };
    const data = await response.json().catch(() => null);
    const foods = data && typeof data.foods_indexed === 'number' ? data.foods_indexed : null;
    return {
      ok: true,
      detail: foods != null ? `Connected · ${foods} foods indexed` : 'Connected',
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return {
      ok: false,
      detail: aborted ? 'Timed out — no reply from that address.' : "Couldn't reach it.",
    };
  } finally {
    clearTimeout(timer);
  }
}

// SecureStore is unavailable on web; fall back to memory so the dev build runs.
const memory = new Map<string, string>();
const secure = {
  async get(key: string) {
    if (Platform.OS === 'web') return memory.get(key) ?? null;
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string) {
    if (Platform.OS === 'web') { memory.set(key, value); return; }
    await SecureStore.setItemAsync(key, value);
  },
  async remove(key: string) {
    if (Platform.OS === 'web') { memory.delete(key); return; }
    await SecureStore.deleteItemAsync(key);
  },
};

export const tokens = {
  get access() { return secure.get(ACCESS_KEY); },
  get refresh() { return secure.get(REFRESH_KEY); },
  async save(access: string, refresh: string) {
    await Promise.all([secure.set(ACCESS_KEY, access), secure.set(REFRESH_KEY, refresh)]);
  },
  async clear() {
    await Promise.all([secure.remove(ACCESS_KEY), secure.remove(REFRESH_KEY)]);
  },
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

function messageFrom(payload: unknown, fallback: string): string {
  if (typeof payload === 'object' && payload !== null && 'detail' in payload) {
    const detail = (payload as { detail: unknown }).detail;
    if (typeof detail === 'string') return detail;
    // FastAPI validation errors arrive as a list of field problems.
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: string };
      if (first?.msg) return first.msg;
    }
  }
  return fallback;
}

let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  // Collapse concurrent 401s into one refresh, so a screen firing three
  // queries at once doesn't trigger three refreshes and race.
  if (refreshing) return refreshing;

  refreshing = (async () => {
    const token = await tokens.refresh;
    if (!token) return false;
    try {
      const response = await fetch(`${getBaseUrl()}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: token }),
      });
      if (!response.ok) return false;
      const data = await response.json();
      await tokens.save(data.access_token, data.refresh_token);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();

  return refreshing;
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  retry?: boolean;
};

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, retry = true } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = await tokens.access;
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${getBaseUrl()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Can't reach BeFit. Check your connection.");
  }

  if (response.status === 401 && auth && retry) {
    if (await refreshTokens()) {
      return request<T>(path, { ...options, retry: false });
    }
    await tokens.clear();
    throw new ApiError(401, 'Your session expired. Please sign in again.');
  }

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, messageFrom(payload, 'Something went wrong.'));
  }
  return payload as T;
}

/** Multipart upload. Content-Type is deliberately unset so fetch generates the
 *  boundary itself — setting it by hand produces a body the server can't parse. */
export async function requestForm<T>(
  path: string,
  form: FormData,
  retry = true,
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = await tokens.access;
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${getBaseUrl()}${path}`, { method: 'POST', headers, body: form });
  } catch {
    throw new ApiError(0, "Can't reach BeFit. Check your connection.");
  }

  if (response.status === 401 && retry) {
    if (await refreshTokens()) return requestForm<T>(path, form, false);
    await tokens.clear();
    throw new ApiError(401, 'Your session expired. Please sign in again.');
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, messageFrom(payload, 'Upload failed.'));
  }
  return payload as T;
}
