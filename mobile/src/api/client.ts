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
export const secure = {
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

/**
 * Tokens are read from SecureStore once and then served from memory.
 *
 * SecureStore is a native round trip (Keychain / EncryptedSharedPreferences),
 * and every request used to pay it — a screen firing five queries paid it five
 * times before the first byte left the phone.
 */
type TokenPair = { access: string | null; refresh: string | null };
let tokenCache: TokenPair | null = null;
let tokenLoad: Promise<TokenPair> | null = null;
/** Bumped by every save/clear so a slow initial read can't clobber them. */
let tokenGeneration = 0;

function loadTokens(): Promise<TokenPair> {
  if (tokenCache) return Promise.resolve(tokenCache);
  if (tokenLoad) return tokenLoad;
  const generation = tokenGeneration;
  tokenLoad = Promise.all([secure.get(ACCESS_KEY), secure.get(REFRESH_KEY)])
    .then(([access, refresh]) => {
      if (generation === tokenGeneration) tokenCache = { access, refresh };
      return tokenCache ?? { access, refresh };
    })
    .catch(() => ({ access: null, refresh: null }))
    .finally(() => {
      tokenLoad = null;
    });
  return tokenLoad;
}

export const tokens = {
  get access(): Promise<string | null> {
    return loadTokens().then((pair) => pair.access);
  },
  get refresh(): Promise<string | null> {
    return loadTokens().then((pair) => pair.refresh);
  },
  async save(access: string, refresh: string) {
    tokenGeneration += 1;
    tokenCache = { access, refresh };
    await Promise.all([secure.set(ACCESS_KEY, access), secure.set(REFRESH_KEY, refresh)]);
  },
  async clear() {
    tokenGeneration += 1;
    tokenCache = { access: null, refresh: null };
    await Promise.all([secure.remove(ACCESS_KEY), secure.remove(REFRESH_KEY)]);
  },
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

const NETWORK_MESSAGE = "Can't reach BeFit. Check your connection.";
const TIMEOUT_MESSAGE =
  'The server took too long to answer. Check your connection and try again.';
const SESSION_EXPIRED_MESSAGE = 'Your session expired. Please sign in again.';

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

// ---------------------------------------------------------------- timeouts

const DEFAULT_TIMEOUT_MS = 15_000;
const SLOW_TIMEOUT_MS = 45_000;
const TRANSCRIBE_TIMEOUT_MS = 60_000;
/** Endpoints that call an LLM or speech model and legitimately take a while. */
const SLOW_PREFIXES = ['/voice/', '/food/resolve', '/food/photo', '/chat', '/body/composition/scan'];

export function timeoutFor(path: string): number {
  if (path.startsWith('/voice/transcribe')) return TRANSCRIBE_TIMEOUT_MS;
  if (SLOW_PREFIXES.some((prefix) => path.startsWith(prefix))) return SLOW_TIMEOUT_MS;
  return DEFAULT_TIMEOUT_MS;
}

function abortError(): Error {
  const error = new Error('Request cancelled.');
  error.name = 'AbortError';
  return error;
}

type Sent = { status: number; payload: unknown };

/**
 * One fetch, bounded by a timeout and an optional caller signal (TanStack
 * Query passes one so leaving a screen cancels its requests).
 *
 * The body is read inside the same window: a server that sends headers and
 * then stalls would otherwise hang forever on `response.json()`.
 */
async function send(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  external?: AbortSignal,
): Promise<Sent> {
  if (external?.aborted) throw abortError();

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const forward = () => controller.abort();
  external?.addEventListener('abort', forward);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    // `json()` swallows its own abort above, so re-check before trusting it.
    if (timedOut) throw new ApiError(0, TIMEOUT_MESSAGE);
    if (external?.aborted) throw abortError();
    return { status: response.status, payload };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (timedOut) throw new ApiError(0, TIMEOUT_MESSAGE);
    if (external?.aborted) throw abortError();
    throw new ApiError(0, NETWORK_MESSAGE);
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', forward);
  }
}

// ---------------------------------------------------------------- auth

type RefreshResult = 'ok' | 'invalid' | 'network';
let refreshing: Promise<RefreshResult> | null = null;

/**
 * Exchange the refresh token for a new pair.
 *
 * Three outcomes, because they need different handling: `invalid` means the
 * server definitively rejected the token (sign out); `network` means we never
 * got a verdict (keep the tokens — the phone is just offline, and signing her
 * out for walking into a lift would be absurd).
 *
 * Concurrent 401s share one in-flight refresh, so a screen firing three queries
 * at once doesn't trigger three refreshes and race on rotation.
 */
function refreshTokens(): Promise<RefreshResult> {
  if (refreshing) return refreshing;

  refreshing = (async (): Promise<RefreshResult> => {
    const token = await tokens.refresh;
    if (!token) return 'invalid';
    let sent: Sent;
    try {
      sent = await send(
        `${getBaseUrl()}/auth/refresh`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: token }),
        },
        DEFAULT_TIMEOUT_MS,
      );
    } catch {
      return 'network';
    }
    // A verdict on the token itself. 408/429 and 5xx are the server being
    // busy, not the token being bad, so they fall through to `network`.
    if ([400, 401, 403, 422].includes(sent.status)) return 'invalid';
    const data = sent.payload as { access_token?: string; refresh_token?: string } | null;
    if (sent.status >= 300 || !data?.access_token || !data.refresh_token) return 'network';
    await tokens.save(data.access_token, data.refresh_token);
    return 'ok';
  })().finally(() => {
    refreshing = null;
  });

  return refreshing;
}

let authFailureHandler: (() => void | Promise<void>) | null = null;
let authFailureInFlight = false;

/**
 * Registered by the auth store. Kept as a callback rather than an import so
 * this module doesn't depend on the store (which depends on this module).
 */
export function onAuthFailure(handler: (() => void | Promise<void>) | null) {
  authFailureHandler = handler;
}

async function failAuth(): Promise<never> {
  await tokens.clear();
  // Several parallel requests can all land here; sign out once.
  if (authFailureHandler && !authFailureInFlight) {
    authFailureInFlight = true;
    Promise.resolve()
      .then(() => authFailureHandler?.())
      .catch(() => {})
      .finally(() => {
        authFailureInFlight = false;
      });
  }
  throw new ApiError(401, SESSION_EXPIRED_MESSAGE);
}

/**
 * Called on a 401 from an authenticated request. Resolves true if the request
 * is worth retrying with the (possibly new) access token; otherwise throws.
 */
async function recoverFrom401(usedToken: string | null): Promise<true> {
  // Another request already refreshed while this one was in flight.
  const current = await tokens.access;
  if (current && current !== usedToken) return true;

  const result = await refreshTokens();
  if (result === 'ok') return true;
  if (result === 'network') throw new ApiError(0, NETWORK_MESSAGE);
  return failAuth();
}

// ---------------------------------------------------------------- requests

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  retry?: boolean;
  /** Cancels the request — pass TanStack Query's `signal` through here. */
  signal?: AbortSignal;
  /** Overrides the per-path default. */
  timeoutMs?: number;
};

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, retry = true, signal, timeoutMs } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = auth ? await tokens.access : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  const { status, payload } = await send(
    `${getBaseUrl()}${path}`,
    { method, headers, body: body === undefined ? undefined : JSON.stringify(body) },
    timeoutMs ?? timeoutFor(path),
    signal,
  );

  if (status === 401 && auth) {
    if (!retry) return failAuth();
    await recoverFrom401(token);
    return request<T>(path, { ...options, retry: false });
  }

  if (status === 204) return undefined as T;
  if (status < 200 || status >= 300) {
    throw new ApiError(status, messageFrom(payload, 'Something went wrong.'));
  }
  return payload as T;
}

export type FormOptions = {
  retry?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
};

/** Multipart upload. Content-Type is deliberately unset so fetch generates the
 *  boundary itself — setting it by hand produces a body the server can't parse.
 *
 *  The third argument is still accepted as a bare `retry` boolean for older
 *  callers. */
export async function requestForm<T>(
  path: string,
  form: FormData,
  retryOrOptions: boolean | FormOptions = true,
): Promise<T> {
  const options: FormOptions =
    typeof retryOrOptions === 'boolean' ? { retry: retryOrOptions } : retryOrOptions;
  const { retry = true, signal, timeoutMs } = options;

  const headers: Record<string, string> = {};
  const token = await tokens.access;
  if (token) headers.Authorization = `Bearer ${token}`;

  const { status, payload } = await send(
    `${getBaseUrl()}${path}`,
    { method: 'POST', headers, body: form },
    timeoutMs ?? timeoutFor(path),
    signal,
  );

  if (status === 401) {
    if (!retry) return failAuth();
    await recoverFrom401(token);
    return requestForm<T>(path, form, { ...options, retry: false });
  }

  if (status < 200 || status >= 300) {
    throw new ApiError(status, messageFrom(payload, 'Upload failed.'));
  }
  return payload as T;
}
