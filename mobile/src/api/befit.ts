import { request, requestForm } from './client';
import type {
  DaySummary,
  FoodSummary,
  Meal,
  Nutrients,
  ParseResponse,
  ProfileResponse,
  SavedMeal,
  SleepTrend,
  Supplement,
  SupplementTime,
  SupplementToday,
  TokenPair,
  WeightLog,
  WorkoutProgress,
  WorkoutSession,
} from './types';

export const auth = {
  register: (email: string, password: string) =>
    request<TokenPair>('/auth/register', {
      method: 'POST',
      body: { email, password },
      auth: false,
    }),
  login: (email: string, password: string) =>
    request<TokenPair>('/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    }),
};

export type OnboardingPayload = {
  name: string;
  sex: string;
  age: number;
  height_cm: number;
  weight_kg: number;
  goal_weight_kg: number;
  activity_factor: number;
  health_conditions: { name: string; notes?: string }[];
  medications: {
    name: string;
    dose: string;
    time: string;
    empty_stomach: boolean;
    food_gap_minutes: number;
    mineral_gap_minutes: number;
  }[];
  dietary_rules: { veg_days: number[]; excluded_foods: string[] };
  routine: { wake: string; sleep: string; gym_start?: string; gym_end?: string };
};

export const me = {
  onboard: (payload: OnboardingPayload) =>
    request<ProfileResponse>('/me/onboard', { method: 'POST', body: payload }),
  profile: () => request<ProfileResponse>('/me/profile'),
};

export const food = {
  search: (query: string) =>
    request<FoodSummary[]>(`/food/search?q=${encodeURIComponent(query)}`),
  resolve: (name: string) =>
    request<FoodSummary>('/food/resolve', { method: 'POST', body: { name } }),
};

export type LogItem = {
  food_id?: string | null;
  name?: string;
  quantity: number;
  unit: string;
};

export const logs = {
  day: (on?: string) => request<DaySummary>(`/logs/day${on ? `?on=${on}` : ''}`),
  logFood: (meal: Meal, items: LogItem[], viaVoice = false) =>
    request<unknown>('/logs/food', {
      method: 'POST',
      body: { meal, items, via_voice: viaVoice },
    }),
  deleteItem: (logId: string, index: number) =>
    request<void>(`/logs/food/${logId}/item/${index}`, { method: 'DELETE' }),
  water: (ml: number) => request<unknown>('/logs/water', { method: 'POST', body: { ml } }),
  undoWater: () => request<unknown>('/logs/water/last', { method: 'DELETE' }),
  weight: (kg: number) => request<unknown>('/logs/weight', { method: 'POST', body: { kg } }),
  weightHistory: () => request<WeightLog[]>('/logs/weight'),
};

/** The three containers she actually drinks from. Anything finer is a form,
 *  not a tap. */
export const WATER_PRESETS = [
  { ml: 200, label: 'Glass', sub: '200 ml' },
  { ml: 500, label: 'Bottle', sub: '500 ml' },
  { ml: 1000, label: 'Large', sub: '1 L' },
] as const;

export const supplements = {
  list: () => request<Supplement[]>('/supplements'),
  today: () => request<SupplementToday>('/supplements/today'),
  create: (body: SupplementBody) =>
    request<Supplement>('/supplements', { method: 'POST', body }),
  update: (id: string, body: SupplementBody) =>
    request<Supplement>(`/supplements/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => request<void>(`/supplements/${id}`, { method: 'DELETE' }),
  addStarterSet: () => request<Supplement[]>('/supplements/starter', { method: 'POST' }),
  setTaken: (id: string, taken: boolean) =>
    request<void>(`/supplements/${id}/taken`, { method: taken ? 'PUT' : 'DELETE' }),
};

export type SupplementBody = {
  name: string;
  dose: string;
  time_of_day: SupplementTime;
  days: number[];
  note?: string | null;
  is_active: boolean;
};

export type SavedMealBody = {
  name: string;
  default_meal: Meal;
  items: { food_id?: string | null; name?: string; quantity: number; unit: string }[];
};

export const savedMeals = {
  list: () => request<SavedMeal[]>('/meals'),
  create: (body: SavedMealBody) => request<SavedMeal>('/meals', { method: 'POST', body }),
  update: (id: string, body: SavedMealBody) =>
    request<SavedMeal>(`/meals/${id}`, { method: 'PUT', body }),
  remove: (id: string) => request<void>(`/meals/${id}`, { method: 'DELETE' }),
  fromLog: (name: string, logId: string) =>
    request<SavedMeal>('/meals/from-log', {
      method: 'POST',
      body: { name, log_id: logId },
    }),
  log: (id: string, meal?: Meal) =>
    request<{ logged_to: Meal; kcal: number; items: number }>(`/meals/${id}/log`, {
      method: 'POST',
      body: { meal: meal ?? null },
    }),
};

export const voice = {
  parse: (text: string, meal?: Meal) =>
    request<ParseResponse>('/voice/parse', { method: 'POST', body: { text, meal } }),
};

export type PlanDay = {
  weekday: number;
  focus: string;
  summary: string;
  is_rest: boolean;
  is_veg: boolean;
  exercises: { name: string; prescription: string }[];
  video_url: string | null;
  video_title: string | null;
  video_channel: string | null;
  video_unavailable: boolean;
};

export type ExampleWorkoutDay = {
  focus: string;
  summary: string;
  exercises: { name: string; prescription: string }[];
};

export type WeekResponse = {
  has_plan: boolean;
  days: PlanDay[];
  session_blocks: { minutes: number; title: string; note: string | null }[];
  easy_day_video: { url: string; title: string; channel: string };
  example_day: ExampleWorkoutDay | null;
};

export type WorkoutDayBody = {
  focus: string;
  summary: string;
  is_rest: boolean;
  exercises: { name: string; prescription: string }[];
};

export type SessionBody = {
  completed: { name: string; sets_done: number; reps?: string | null; weight_kg?: number | null }[];
  video_done: boolean;
  cardio_minutes: number;
  duration_minutes?: number | null;
  felt?: number | null;
  note?: string | null;
};

export const workouts = {
  week: () => request<WeekResponse>('/workouts/week'),
  createPlan: (fromTemplate = true) =>
    request<WeekResponse>('/workouts/plan', {
      method: 'POST',
      body: { from_template: fromTemplate },
    }),
  updateVideo: (weekday: number, url: string, title?: string, channel?: string) =>
    request<PlanDay>(`/workouts/day/${weekday}/video`, {
      method: 'PATCH',
      body: { video_url: url, video_title: title, video_channel: channel },
    }),
  replaceDay: (weekday: number, body: WorkoutDayBody) =>
    request<PlanDay>(`/workouts/day/${weekday}`, { method: 'PUT', body }),
  copyDay: (weekday: number, fromWeekday: number) =>
    request<PlanDay>(`/workouts/day/${weekday}/copy`, {
      method: 'POST',
      body: { from_weekday: fromWeekday },
    }),
  session: (on?: string) =>
    request<WorkoutSession | null>(`/workouts/session${on ? `?on=${on}` : ''}`),
  logSession: (body: SessionBody) =>
    request<WorkoutSession>('/workouts/session', { method: 'POST', body }),
  clearSession: () => request<void>('/workouts/session', { method: 'DELETE' }),
  progress: (days = 90) => request<WorkoutProgress>(`/workouts/progress?days=${days}`),
};

// ---------------------------------------------------------------- coach

export type ChatMessage = { role: 'user' | 'assistant'; content: string; at: string };

export type ChatResponse = {
  thread_id: string;
  reply: string;
  messages: ChatMessage[];
};

export const coach = {
  suggestions: () => request<string[]>('/chat/suggestions'),
  send: (message: string, threadId?: string | null) =>
    request<ChatResponse>('/chat', {
      method: 'POST',
      body: { message, thread_id: threadId ?? null },
    }),
};

// ---------------------------------------------------------------- body

export type SegmentalLean = {
  left_arm_kg: number | null;
  right_arm_kg: number | null;
  trunk_kg: number | null;
  left_leg_kg: number | null;
  right_leg_kg: number | null;
};

export type ScanDraft = {
  weight_kg: number | null;
  body_fat_pct: number | null;
  skeletal_muscle_kg: number | null;
  visceral_fat_level: number | null;
  bmr_kcal: number | null;
  body_water_l: number | null;
  segmental_lean: SegmentalLean | null;
  found_any: boolean;
};

export type BodyZone =
  | 'upper_arms' | 'forearms' | 'chest' | 'upper_back' | 'abdomen'
  | 'lower_belly' | 'waist' | 'hips' | 'saddle_bags' | 'glutes'
  | 'outer_thighs' | 'inner_thighs' | 'front_thighs' | 'hamstrings' | 'calves';

export type ZoneMark = { zone: BodyZone; intensity: number };
export type BodyMapData = { kind: 'fat' | 'focus'; date: string; zones: ZoneMark[] };
export type CompositionEntry = ScanDraft & { date: string };

export const bodyApi = {
  /** Multipart upload — the image is read, extracted and discarded server-side. */
  scan: async (uri: string, mimeType: string) => {
    const form = new FormData();
    form.append('file', {
      uri,
      name: `scan.${mimeType.split('/')[1] ?? 'jpg'}`,
      type: mimeType,
    } as unknown as Blob);
    return requestForm<ScanDraft>('/body/composition/scan', form);
  },
  saveScan: (draft: Partial<ScanDraft>) =>
    request<unknown>('/body/composition', { method: 'POST', body: draft }),
  history: () => request<CompositionEntry[]>('/body/composition'),
  getMap: (kind: 'fat' | 'focus') => request<BodyMapData | null>(`/body/map/${kind}`),
  putMap: (kind: 'fat' | 'focus', zones: ZoneMark[]) =>
    request<BodyMapData>(`/body/map/${kind}`, { method: 'PUT', body: { zones } }),
};

// ---------------------------------------------------------------- diet

export type DietDay = {
  weekday: number;
  is_veg: boolean;
  meals: Record<string, string>;
  note: string | null;
};

export type DietWeek = {
  has_plan: boolean;
  days: DietDay[];
  meal_times: Record<string, string>;
  pg_swaps: { item: string; portion: string; add: string }[];
  example_day: Record<string, string> | null;
};

export type DietDayBody = {
  is_veg: boolean;
  note?: string | null;
  /** Ordered, so renaming and reordering slots round-trips cleanly. */
  meals: { key: string; text: string }[];
};

export const diet = {
  week: () => request<DietWeek>('/diet/week'),
  createPlan: (fromTemplate = true) =>
    request<DietWeek>('/diet/plan', {
      method: 'POST',
      body: { from_template: fromTemplate },
    }),
  updateMeal: (weekday: number, meal: string, text: string) =>
    request<DietDay>(`/diet/day/${weekday}`, { method: 'PATCH', body: { meal, text } }),
  replaceDay: (weekday: number, body: DietDayBody) =>
    request<DietDay>(`/diet/day/${weekday}`, { method: 'PUT', body }),
  copyDay: (weekday: number, fromWeekday: number) =>
    request<DietDay>(`/diet/day/${weekday}/copy`, {
      method: 'POST',
      body: { from_weekday: fromWeekday },
    }),
};

export const sleep = {
  log: (bedAt: string, wakeAt: string, quality?: number) =>
    request<unknown>('/logs/sleep', {
      method: 'POST',
      body: { bed_at: bedAt, wake_at: wakeAt, quality },
    }),
  trend: (days = 7) => request<SleepTrend>(`/logs/sleep?days=${days}`),
};

export type { Nutrients };
