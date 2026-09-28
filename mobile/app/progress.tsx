import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { workouts } from '../src/api/befit';
import type { PeriodStats, WorkoutProgress } from '../src/api/types';
import { BarChart, type Bar } from '../src/components/BarChart';
import { Card } from '../src/components/Card';
import { Icon } from '../src/components/Icon';
import { MonthCalendar } from '../src/components/MonthCalendar';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Text } from '../src/components/Text';
import { radius, semantic, series, spacing, useTheme } from '../src/theme';

type Metric = 'sessions' | 'minutes' | 'kcal' | 'volume_kg';

const METRICS: { key: Metric; label: string; format: (value: number) => string }[] = [
  { key: 'sessions', label: 'Sessions', format: (v) => `${v}` },
  { key: 'minutes', label: 'Minutes', format: (v) => `${v}` },
  { key: 'kcal', label: 'Calories', format: (v) => `${Math.round(v)}` },
  { key: 'volume_kg', label: 'Volume', format: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}t` : `${Math.round(v)}`) },
];

export default function Progress() {
  const theme = useTheme();
  const [metric, setMetric] = useState<Metric>('sessions');

  const progress = useQuery({
    queryKey: ['workout-progress'],
    queryFn: () => workouts.progress(120),
  });

  const data = progress.data;

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas }}>
      <ScreenHeader title="Your progress" subtitle="Training consistency" />

      <ScrollView contentContainerStyle={styles.page}>
        {data ? (
          <>
            <StreakCard data={data} />

            <View style={styles.statRow}>
              <PeriodCard title="This week" stats={data.this_week} />
              <PeriodCard title="This month" stats={data.this_month} />
            </View>

            <Card>
              <View style={styles.cardHeader}>
                <Text variant="caption" tone="muted">
                  Last 8 weeks
                </Text>
              </View>

              <View style={[styles.segments, { backgroundColor: theme.surfaceSunken }]}>
                {METRICS.map((option) => {
                  const active = metric === option.key;
                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => setMetric(option.key)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
                      style={[styles.segment, active && { backgroundColor: theme.surface }]}
                    >
                      <Text
                        variant="caption"
                        tone={active ? 'default' : 'muted'}
                        style={{ fontSize: 10 }}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <WeeklyChart data={data} metric={metric} />
            </Card>

            <Card>
              <View style={styles.cardHeader}>
                <Text variant="caption" tone="muted">
                  {new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                </Text>
              </View>
              <View style={{ marginTop: spacing.md }}>
                <MonthCalendar
                  marks={data.calendar}
                  month={new Date()}
                  color={series.workout}
                />
              </View>
            </Card>

            <Card variant="tinted">
              <Text variant="smallMedium" tone="primary">
                About the calorie figures
              </Text>
              <Text variant="small" tone="secondary" style={{ marginTop: spacing.xs }}>
                Burn is estimated from MET values at {data.bodyweight_kg} kg. It is shown
                here for progress only and is deliberately not added to your daily calorie
                budget — your target already assumes you train six days a week, so counting
                it twice would quietly hand you an extra 300–400 kcal.
              </Text>
            </Card>
          </>
        ) : null}

        {progress.isLoading ? (
          <Text variant="small" tone="muted" center>
            Loading…
          </Text>
        ) : null}

        {progress.isError ? (
          <Card variant="tinted">
            <Text variant="small" tone="secondary">
              {(progress.error as Error).message}
            </Text>
          </Card>
        ) : null}
      </ScrollView>
    </View>
  );
}

function StreakCard({ data }: { data: WorkoutProgress }) {
  const theme = useTheme();
  const active = data.streak_days > 0;

  return (
    <Card style={styles.streakCard}>
      <View
        style={[
          styles.flame,
          {
            backgroundColor: active ? series.workout + '1F' : theme.surfaceSunken,
          },
        ]}
      >
        <Icon
          name="flame"
          size={26}
          color={active ? series.workout : theme.textMuted}
        />
      </View>

      <View style={{ flex: 1 }}>
        <Text variant="display" tabular>
          {data.streak_days}
          <Text variant="h3" tone="muted">
            {data.streak_days === 1 ? ' day' : ' days'}
          </Text>
        </Text>
        <Text variant="small" tone="secondary" style={{ marginTop: 1 }}>
          {active
            ? 'Current streak — rest days don’t break it'
            : 'No streak yet. Log a session to start one.'}
        </Text>
        <Text variant="small" tone="muted" tabular style={{ marginTop: 2, fontSize: 11.5 }}>
          Best {data.best_streak} · {data.total_sessions} sessions all time
        </Text>
      </View>
    </Card>
  );
}

function PeriodCard({ title, stats }: { title: string; stats: PeriodStats }) {
  const theme = useTheme();
  const ratio = stats.planned > 0 ? Math.min(stats.sessions / stats.planned, 1) : 0;
  const complete = stats.planned > 0 && stats.sessions >= stats.planned;

  return (
    <Card style={{ flex: 1 }}>
      <Text variant="caption" tone="muted">
        {title}
      </Text>
      <Text variant="h1" tabular style={{ marginTop: spacing.sm }}>
        {stats.sessions}
        <Text variant="body" tone="muted" tabular>
          /{stats.planned}
        </Text>
      </Text>
      <View style={[styles.track, { backgroundColor: theme.surfaceSunken }]}>
        <View
          style={[
            styles.fill,
            {
              width: `${ratio * 100}%`,
              backgroundColor: complete ? semantic.success : series.workout,
            },
          ]}
        />
      </View>
      <Text variant="small" tone="muted" tabular style={{ marginTop: spacing.sm, fontSize: 11.5 }}>
        {stats.minutes} min · {Math.round(stats.kcal)} kcal
      </Text>
    </Card>
  );
}

function WeeklyChart({ data, metric }: { data: WorkoutProgress; metric: Metric }) {
  const config = METRICS.find((option) => option.key === metric)!;

  const bars: Bar[] = data.weekly.map((bucket, index) => {
    const date = new Date(`${bucket.week_start}T00:00:00`);
    return {
      label: `${date.getDate()}/${date.getMonth() + 1}`,
      value: bucket[metric],
      highlight: index === data.weekly.length - 1,
    };
  });

  const max = Math.max(1, ...bars.map((bar) => bar.value ?? 0));

  return (
    <View style={{ marginTop: spacing.base }}>
      <BarChart
        bars={bars}
        max={max}
        color={series.workout}
        height={104}
        format={(value) => (value > 0 ? config.format(value) : '')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: spacing.base, gap: spacing.md, paddingBottom: spacing['4xl'] * 2 },
  streakCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.base },
  flame: {
    width: 54,
    height: 54,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statRow: { flexDirection: 'row', gap: spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  track: { height: 5, borderRadius: radius.pill, overflow: 'hidden', marginTop: spacing.sm },
  fill: { height: '100%', borderRadius: radius.pill },
  segments: { flexDirection: 'row', borderRadius: radius.sm, padding: 3, gap: 2, marginTop: spacing.md },
  segment: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm - 2, borderRadius: radius.sm - 3 },
});
