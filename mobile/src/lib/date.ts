/**
 * Calendar helpers that work in the device's local time.
 *
 * `new Date().toISOString().slice(0, 10)` is UTC, which in India (UTC+5:30)
 * reports yesterday's date until 5:30 am — so a midnight snack lands on the
 * wrong day. Everything that means "today" should go through here.
 */

const pad = (value: number) => String(value).padStart(2, '0');

/** YYYY-MM-DD for the given moment, in device local time. */
export function localISODate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export type MealSlot = 'breakfast' | 'mid_morning' | 'lunch' | 'snack' | 'dinner';

/** The meal a log most likely belongs to, from the local hour (0–23). */
export function mealForHour(hour: number): MealSlot {
  if (hour < 10) return 'breakfast';
  if (hour < 12) return 'mid_morning';
  if (hour < 16) return 'lunch';
  if (hour < 19) return 'snack';
  return 'dinner';
}
