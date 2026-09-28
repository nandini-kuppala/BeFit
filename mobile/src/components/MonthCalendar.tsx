import { StyleSheet, View } from 'react-native';

import type { DayMark } from '../api/types';
import { radius, spacing, useTheme } from '../theme';
import { Text } from './Text';

const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

type MonthCalendarProps = {
  /** Any subset of days; anything outside the rendered month is ignored. */
  marks: DayMark[];
  month: Date;
  color: string;
};

/**
 * A month grid where a trained day is filled, a planned rest day is outlined
 * and a missed day is a bare dot.
 *
 * Three states rather than two, because "I rested on Sunday as planned" and
 * "I skipped Wednesday" mean opposite things and a two-colour heatmap would
 * show them identically.
 */
export function MonthCalendar({ marks, month, color }: MonthCalendarProps) {
  const theme = useTheme();

  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const first = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  // JS weeks start Sunday; the whole app is Monday-first.
  const leading = (first.getDay() + 6) % 7;

  const byDate = new Map(marks.map((mark) => [mark.date, mark]));
  const today = new Date();
  const isCurrentMonth =
    today.getFullYear() === year && today.getMonth() === monthIndex;

  const cells: ({ day: number; mark: DayMark | undefined; future: boolean } | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const key = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return {
        day,
        mark: byDate.get(key),
        future: isCurrentMonth && day > today.getDate(),
      };
    }),
  ];

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.row}>
        {WEEKDAY_INITIALS.map((initial, index) => (
          <View key={`${initial}-${index}`} style={styles.cell}>
            <Text variant="caption" tone="muted" style={{ fontSize: 9.5 }}>
              {initial}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((cell, index) => {
          if (cell === null) {
            return <View key={`pad-${index}`} style={styles.cell} />;
          }

          const done = cell.mark?.done ?? false;
          const rest = cell.mark?.is_rest ?? false;
          const isToday =
            isCurrentMonth && cell.day === today.getDate();

          return (
            <View key={cell.day} style={styles.cell}>
              <View
                style={[
                  styles.day,
                  done && { backgroundColor: color, borderColor: color },
                  // Rest is filled grey, missed is a bare outline. Two outline
                  // shades were indistinguishable at this size, and the whole
                  // point of three states is telling them apart.
                  !done &&
                    rest && {
                      backgroundColor: theme.surfaceSunken,
                      borderColor: theme.surfaceSunken,
                    },
                  !done && !rest && !cell.future && { borderColor: theme.borderStrong },
                  !done && cell.future && { borderColor: 'transparent' },
                  isToday && !done && { borderColor: theme.primary, borderWidth: 1.6 },
                ]}
              >
                <Text
                  variant="caption"
                  tabular
                  style={{
                    fontSize: 10,
                    textTransform: 'none',
                    letterSpacing: 0,
                    color: done
                      ? theme.onPrimary
                      : cell.future
                        ? theme.textMuted
                        : theme.textSecondary,
                  }}
                >
                  {cell.day}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.legend}>
        <Legend swatch={{ backgroundColor: color, borderColor: color }} label="Trained" />
        <Legend
          swatch={{
            backgroundColor: theme.surfaceSunken,
            borderColor: theme.surfaceSunken,
          }}
          label="Rest day"
        />
        <Legend swatch={{ borderColor: theme.borderStrong }} label="Missed" />
      </View>
    </View>
  );
}

function Legend({ swatch, label }: { swatch: object; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, swatch]} />
      <Text variant="caption" tone="muted" style={{ fontSize: 9.5 }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.xs + 2 },
  // Seven columns with no gap property, so partial weeks stay aligned.
  cell: { width: `${100 / 7}%`, alignItems: 'center' },
  day: {
    width: 30,
    height: 30,
    borderRadius: radius.sm - 2,
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legend: { flexDirection: 'row', gap: spacing.base, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 1 },
  legendSwatch: { width: 11, height: 11, borderRadius: 3.5, borderWidth: 1.2 },
});
