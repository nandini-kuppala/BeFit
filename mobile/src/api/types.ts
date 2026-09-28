export type Confidence = 'verified' | 'database' | 'estimated';
export type Meal = 'breakfast' | 'mid_morning' | 'lunch' | 'snack' | 'dinner';

export const MEAL_LABELS: Record<Meal, string> = {
  breakfast: 'Breakfast',
  mid_morning: 'Mid-morning',
  lunch: 'Lunch',
  snack: 'Snack',
  dinner: 'Dinner',
};

export const MEAL_ORDER: Meal[] = [
  'breakfast',
  'mid_morning',
  'lunch',
  'snack',
  'dinner',
];

export type Nutrients = {
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  fibre_g: number;
  sugar_g: number;
  iron_mg: number;
  calcium_mg: number;
  zinc_mg: number;
  magnesium_mg: number;
  selenium_ug: number;
  iodine_ug: number;
  sodium_mg: number;
  potassium_mg: number;
  vit_a_ug: number;
  vit_c_mg: number;
  vit_d_iu: number;
  vit_e_mg: number;
  vit_b12_ug: number;
  folate_ug: number;
  omega3_mg: number;
};

export type HouseholdUnit = { label: string; grams: number };

export type FoodSummary = {
  id: string;
  name: string;
  category: string | null;
  source: string;
  confidence: Confidence;
  is_veg: boolean;
  per_100g: Nutrients;
  household_units: HouseholdUnit[];
  default_grams: number;
  /** 0-1, how well this answers the query. 1.0 for a non-search context. */
  match_score: number;
};

export type SearchResponse = {
  results: FoodSummary[];
  /** False when nothing matched closely enough to trust — the UI should offer
   *  lookup or manual entry rather than presenting near misses as answers. */
  has_exact_match: boolean;
  query: string;
};

/** What a hand-entered food looks like, in the terms a packet states them. */
export type CustomFoodBody = {
  name: string;
  /** What the figures describe: 100 for a per-100g label, or the serving weight. */
  basis_grams: number;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  fibre_g: number;
  sugar_g: number;
  serving_label: string;
  serving_grams: number | null;
  is_veg: boolean;
};

export type LoggedFood = {
  food_id: string | null;
  name: string;
  quantity: number;
  unit: string;
  grams: number;
  nutrients: Nutrients;
  source: string;
  confidence: Confidence;
};

export type MicroTarget = {
  key: string;
  label: string;
  amount: number;
  unit: string;
  is_upper_limit: boolean;
  priority: number;
};

export type Targets = {
  bmr_kcal: number;
  tdee_kcal: number;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  fibre_g: number;
  water_ml: number;
  sleep_hours: number;
  rate_kg_per_week: number;
  micros: MicroTarget[];
};

export type MicroProgress = {
  key: string;
  label: string;
  unit: string;
  consumed: number;
  target: number;
  percent: number;
  is_upper_limit: boolean;
  exceeded: boolean;
  priority: number;
};

export type MealGroup = {
  meal: Meal;
  log_id: string | null;
  items: LoggedFood[];
  kcal: number;
};

export type DaySummary = {
  date: string;
  targets: Targets;
  consumed: Nutrients;
  remaining_kcal: number;
  meals: MealGroup[];
  micros: MicroProgress[];
  estimated_share: number;
  water_ml: number;
  sleep_minutes: number | null;
  weight_kg: number | null;
};

export type DraftItem = {
  food_id: string | null;
  name: string;
  quantity: number;
  unit: string;
  grams: number;
  nutrients: Nutrients;
  source: string;
  confidence: Confidence;
  resolved: boolean;
};

export type ParseResponse = {
  transcript: string;
  meal: Meal | null;
  items: DraftItem[];
};

export type HealthCondition = { name: string; notes?: string | null };

export type Profile = {
  name: string;
  sex: string;
  age: number;
  height_cm: number;
  start_weight_kg: number;
  goal_weight_kg: number;
  activity_factor: number;
  metabolic_adjustment: number;
  health_conditions: HealthCondition[];
  medications: {
    name: string;
    dose: string;
    time: string;
    empty_stomach: boolean;
    food_gap_minutes: number;
    mineral_gap_minutes: number;
  }[];
  dietary_rules: { veg_days: number[]; excluded_foods: string[]; allergies: string[] };
  routine: {
    wake: string;
    sleep: string;
    gym_start: string | null;
    gym_end: string | null;
    work_start: string | null;
    work_end: string | null;
  };
};

export type ProfileResponse = { profile: Profile; targets: Targets };

// ---------------------------------------------------------------- sleep

export type SleepNight = {
  date: string;
  /** null means no entry for that night — the chart shows the gap rather than
   *  hiding it, because a missing night is information. */
  minutes: number | null;
  bed_at: string | null;
  wake_at: string | null;
  quality: number | null;
};

export type SleepTrend = {
  nights: SleepNight[];
  target_hours: number;
  average_minutes: number | null;
  nights_on_target: number;
};

// ---------------------------------------------------------- supplements

export type SupplementTime = 'morning' | 'breakfast' | 'midday' | 'evening' | 'bedtime';

export const SUPPLEMENT_TIME_LABELS: Record<SupplementTime, string> = {
  morning: 'Morning, empty stomach',
  breakfast: 'With breakfast',
  midday: 'Midday',
  evening: 'Evening',
  bedtime: 'Before bed',
};

export const SUPPLEMENT_TIME_ORDER: SupplementTime[] = [
  'morning',
  'breakfast',
  'midday',
  'evening',
  'bedtime',
];

export type Supplement = {
  id: string;
  name: string;
  dose: string;
  time_of_day: SupplementTime;
  time_label: string;
  /** Empty means every day. */
  days: number[];
  note: string | null;
  is_active: boolean;
  sort_order: number;
};

export type TodaySupplement = Supplement & {
  taken: boolean;
  interaction_warning: string | null;
};

export type SupplementToday = {
  date: string;
  items: TodaySupplement[];
  taken_count: number;
  due_count: number;
};

// --------------------------------------------------------- saved meals

export type SavedMealItem = {
  food_id: string | null;
  name: string;
  quantity: number;
  unit: string;
  grams: number;
  nutrients: Nutrients;
  confidence: Confidence;
};

export type SavedMeal = {
  id: string;
  name: string;
  default_meal: Meal;
  items: SavedMealItem[];
  totals: Nutrients;
  confidence: Confidence;
  times_logged: number;
  last_logged_on: string | null;
};

// ------------------------------------------------------ workout progress

export type DayMark = {
  date: string;
  done: boolean;
  is_rest: boolean;
  focus: string | null;
  kcal: number;
  exercises_done: number;
};

export type WeekBucket = {
  week_start: string;
  sessions: number;
  minutes: number;
  kcal: number;
  volume_kg: number;
};

export type PeriodStats = {
  sessions: number;
  planned: number;
  minutes: number;
  kcal: number;
  volume_kg: number;
};

export type WorkoutProgress = {
  streak_days: number;
  best_streak: number;
  this_week: PeriodStats;
  this_month: PeriodStats;
  total_sessions: number;
  calendar: DayMark[];
  weekly: WeekBucket[];
  bodyweight_kg: number;
};

export type CompletedExercise = {
  name: string;
  sets_done: number;
  reps: string | null;
  weight_kg: number | null;
};

export type WorkoutSession = {
  date: string;
  weekday: number;
  focus: string;
  completed: CompletedExercise[];
  video_done: boolean;
  cardio_minutes: number;
  duration_minutes: number | null;
  felt: number | null;
  note: string | null;
  kcal_burned: number;
};

export type TokenPair = {
  access_token: string;
  refresh_token: string;
  user_id: string;
  has_profile: boolean;
};

export type WeightLog = { date: string; kg: number; note: string | null };
