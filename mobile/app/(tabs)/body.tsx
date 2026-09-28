import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { bodyApi, logs, me, type BodyZone } from '../../src/api/befit';
import type { WeightLog } from '../../src/api/types';
import { BodyMap, IntensityKey, ZONE_LABELS, type View3D } from '../../src/components/BodyMap';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { Icon } from '../../src/components/Icon';
import { Text } from '../../src/components/Text';
import { radius, semantic, series, spacing, useTheme } from '../../src/theme';

type Segment = 'weight' | 'composition' | 'focus';

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: 'weight', label: 'Weight' },
  { key: 'composition', label: 'Composition' },
  { key: 'focus', label: 'Focus areas' },
];

export default function BodyTab() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [segment, setSegment] = useState<Segment>('weight');

  return (
    <ScrollView
      style={{ backgroundColor: theme.canvas }}
      contentContainerStyle={[
        styles.page,
        { paddingTop: insets.top + spacing.base, paddingBottom: spacing['4xl'] * 2 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Text variant="h1">Body</Text>

      <View style={[styles.segments, { backgroundColor: theme.surfaceSunken }]}>
        {SEGMENTS.map((item) => {
          const active = segment === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => setSegment(item.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={[
                styles.segment,
                active && { backgroundColor: theme.surface },
              ]}
            >
              <Text
                variant="smallMedium"
                tone={active ? 'default' : 'muted'}
                style={{ fontSize: 12.5 }}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {segment === 'weight' ? <WeightSection /> : null}
      {segment === 'composition' ? <CompositionSection /> : null}
      {segment === 'focus' ? <FocusSection /> : null}
    </ScrollView>
  );
}

// ------------------------------------------------------------------ weight

function WeightSection() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [weight, setWeight] = useState('');

  const profile = useQuery({ queryKey: ['profile'], queryFn: () => me.profile() });
  const history = useQuery({ queryKey: ['weights'], queryFn: () => logs.weightHistory() });

  const save = useMutation({
    mutationFn: () => logs.weight(Number(weight)),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['weights'] }),
        queryClient.invalidateQueries({ queryKey: ['day'] }),
      ]);
      setWeight('');
    },
  });

  const entries = [...(history.data ?? [])].reverse();
  const current = entries.at(-1)?.kg ?? profile.data?.profile.start_weight_kg ?? 0;
  const start = profile.data?.profile.start_weight_kg ?? current;
  const goal = profile.data?.profile.goal_weight_kg ?? current;

  const totalToLose = Math.abs(start - goal);
  const lost = Math.max(0, start - current);
  const progress = totalToLose > 0 ? Math.min(lost / totalToLose, 1) : 0;

  return (
    <>
      <Card>
        <Text variant="caption" tone="muted">
          Progress to goal
        </Text>
        <View style={styles.progressRow}>
          <View>
            <Text variant="display" tabular>
              {current.toFixed(1)}
            </Text>
            <Text variant="small" tone="muted">
              kg now
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text variant="h2" tabular style={{ color: series.weight }}>
              {lost >= 0.05 ? `−${lost.toFixed(1)}` : '0.0'} kg
            </Text>
            <Text variant="small" tone="muted">
              of {totalToLose.toFixed(0)} kg
            </Text>
          </View>
        </View>

        <View style={[styles.track, { backgroundColor: theme.surfaceSunken }]}>
          <View
            style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: theme.primary }]}
          />
        </View>
        <View style={styles.trackLabels}>
          <Text variant="small" tone="muted" tabular>
            {start.toFixed(0)} kg
          </Text>
          <Text variant="small" tone="muted" tabular>
            {goal.toFixed(0)} kg
          </Text>
        </View>
      </Card>

      <Card>
        <Text variant="caption" tone="muted">
          Log today's weight
        </Text>
        <View style={styles.logRow}>
          <TextInput
            value={weight}
            onChangeText={setWeight}
            placeholder={current.toFixed(1)}
            placeholderTextColor={theme.textMuted}
            keyboardType="decimal-pad"
            style={[
              styles.input,
              { backgroundColor: theme.surfaceSunken, borderColor: theme.border, color: theme.text },
            ]}
          />
          <Button
            label="Save"
            onPress={() => save.mutate()}
            loading={save.isPending}
            disabled={!Number(weight)}
          />
        </View>
        <Text variant="small" tone="muted" style={{ marginTop: spacing.md }}>
          Weigh in first thing, after the bathroom, before eating. Day-to-day swings of
          1–2 kg are water, not fat — judge yourself on the trend line.
        </Text>
      </Card>

      {entries.length >= 2 ? (
        <Card>
          <Text variant="caption" tone="muted" style={{ marginBottom: spacing.md }}>
            Trend · last {entries.length} entries
          </Text>
          <WeightChart entries={entries} goal={goal} />
        </Card>
      ) : (
        <Card variant="tinted">
          <Text variant="smallMedium" tone="primary">
            Your trend appears after two entries
          </Text>
          <Text variant="small" tone="secondary" style={{ marginTop: spacing.xs }}>
            Weigh in daily. The single number is noise; the line through them is the
            signal.
          </Text>
        </Card>
      )}
    </>
  );
}

function WeightChart({ entries, goal }: { entries: WeightLog[]; goal: number }) {
  const theme = useTheme();
  const width = 300;
  const height = 130;
  const pad = 8;

  const values = entries.map((entry) => entry.kg);
  const min = Math.min(...values, goal) - 0.5;
  const max = Math.max(...values) + 0.5;
  const range = max - min || 1;

  const x = (index: number) =>
    pad + (index / Math.max(entries.length - 1, 1)) * (width - pad * 2);
  const y = (value: number) => pad + (1 - (value - min) / range) * (height - pad * 2);

  const line = values
    .map((value, index) => `${index === 0 ? 'M' : 'L'}${x(index)},${y(value)}`)
    .join(' ');

  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Path
          d={`M${pad},${y(goal)} L${width - pad},${y(goal)}`}
          stroke={theme.borderStrong}
          strokeWidth={1}
          strokeDasharray="4 4"
        />
        <Path d={line} stroke={series.weight} strokeWidth={2.5} fill="none" strokeLinejoin="round" />
        {values.map((value, index) => (
          <Circle
            key={index}
            cx={x(index)}
            cy={y(value)}
            r={index === values.length - 1 ? 4.5 : 2.5}
            fill={series.weight}
          />
        ))}
      </Svg>
      <View style={styles.chartLabels}>
        <Text variant="small" tone="muted" tabular>
          {entries[0].date.slice(5)}
        </Text>
        <Text variant="small" tone="muted" tabular>
          goal {goal.toFixed(0)} kg
        </Text>
        <Text variant="small" tone="muted" tabular>
          {entries.at(-1)!.date.slice(5)}
        </Text>
      </View>
    </View>
  );
}

// ------------------------------------------------------------- composition

function CompositionSection() {
  const theme = useTheme();
  const router = useRouter();
  const history = useQuery({ queryKey: ['composition'], queryFn: () => bodyApi.history() });
  const entries = history.data ?? [];
  const latest = entries[0];

  return (
    <>
      <Pressable onPress={() => router.push('/body-scan')}>
        <Card variant="tinted" style={styles.scanPrompt}>
          <Icon name="body" size={24} color={theme.primary} />
          <View style={{ flex: 1 }}>
            <Text variant="smallMedium" tone="primary">
              Scan a body composition report
            </Text>
            <Text variant="small" tone="secondary">
              Photograph an InBody printout and the numbers are read out for you to
              check. The photo is never stored.
            </Text>
          </View>
          <Icon name="chevronRight" size={18} color={theme.primary} />
        </Card>
      </Pressable>

      {latest ? (
        <Card>
          <View style={styles.cardHeader}>
            <Text variant="caption" tone="muted">
              Latest scan
            </Text>
            <Text variant="small" tone="muted" tabular>
              {latest.date}
            </Text>
          </View>
          <View style={styles.statGrid}>
            {[
              { label: 'Body fat', value: latest.body_fat_pct, unit: '%' },
              { label: 'Muscle', value: latest.skeletal_muscle_kg, unit: 'kg' },
              { label: 'Visceral fat', value: latest.visceral_fat_level, unit: '' },
              { label: 'Body water', value: latest.body_water_l, unit: 'L' },
            ]
              .filter((stat) => stat.value != null)
              .map((stat) => (
                <View key={stat.label} style={styles.statCell}>
                  <Text variant="h2" tabular>
                    {stat.value}
                    <Text variant="small" tone="muted">
                      {stat.unit ? ` ${stat.unit}` : ''}
                    </Text>
                  </Text>
                  <Text variant="small" tone="muted">
                    {stat.label}
                  </Text>
                </View>
              ))}
          </View>
        </Card>
      ) : (
        <Card variant="flat">
          <Text variant="small" tone="muted" center>
            No scans yet. Your gym's InBody machine prints one — photograph it and
            BeFit will track the trend alongside your weight.
          </Text>
        </Card>
      )}

      {entries.length > 1 ? (
        <Card padded={false}>
          <View style={styles.sectionHeader}>
            <Text variant="caption" tone="muted">
              History
            </Text>
          </View>
          {entries.slice(1).map((entry, index) => (
            <View
              key={`${entry.date}-${index}`}
              style={[styles.historyRow, { borderTopColor: theme.border }]}
            >
              <Text variant="small" tabular>
                {entry.date}
              </Text>
              <Text variant="small" tone="secondary" tabular>
                {entry.body_fat_pct != null ? `${entry.body_fat_pct}% fat` : '—'}
                {entry.skeletal_muscle_kg != null ? ` · ${entry.skeletal_muscle_kg} kg muscle` : ''}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}
    </>
  );
}

// ------------------------------------------------------------------ focus

function FocusSection() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<'fat' | 'focus'>('fat');
  const [view, setView] = useState<View3D>('back');
  const [marks, setMarks] = useState<Record<string, number>>({});

  const map = useQuery({
    queryKey: ['body-map', kind],
    queryFn: () => bodyApi.getMap(kind),
  });

  // Reload local marks whenever the stored map for this kind arrives.
  useEffect(() => {
    const zones = map.data?.zones ?? [];
    setMarks(Object.fromEntries(zones.map((z) => [z.zone, z.intensity])));
  }, [map.data, kind]);

  const save = useMutation({
    mutationFn: (next: Record<string, number>) =>
      bodyApi.putMap(
        kind,
        Object.entries(next).map(([zone, intensity]) => ({
          zone: zone as BodyZone,
          intensity,
        })),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['body-map', kind] }),
  });

  function toggle(zone: BodyZone) {
    setMarks((current) => {
      const level = current[zone] ?? 0;
      const next = { ...current };
      // 1 → 2 → 3 → off, so one control sets both "where" and "how much".
      if (level >= 3) delete next[zone];
      else next[zone] = level + 1;
      save.mutate(next);
      return next;
    });
  }

  const tint = kind === 'fat' ? semantic.warning : theme.primary;
  const selected = useMemo(
    () =>
      Object.entries(marks)
        .sort((a, b) => b[1] - a[1])
        .map(([zone, intensity]) => ({ zone, intensity })),
    [marks],
  );

  return (
    <>
      <View style={[styles.segments, { backgroundColor: theme.surfaceSunken }]}>
        {(['fat', 'focus'] as const).map((option) => {
          const active = kind === option;
          return (
            <Pressable
              key={option}
              onPress={() => setKind(option)}
              style={[styles.segment, active && { backgroundColor: theme.surface }]}
            >
              <Text variant="smallMedium" tone={active ? 'default' : 'muted'} style={{ fontSize: 12.5 }}>
                {option === 'fat' ? 'Where I carry fat' : 'What I want to focus on'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Card>
        <View style={styles.viewToggle}>
          {(['front', 'back'] as const).map((option) => {
            const active = view === option;
            return (
              <Pressable
                key={option}
                onPress={() => setView(option)}
                style={[
                  styles.viewChip,
                  {
                    backgroundColor: active ? theme.primary : theme.surfaceSunken,
                    borderColor: active ? theme.primary : theme.border,
                  },
                ]}
              >
                <Text variant="caption" tone={active ? 'inverse' : 'secondary'}>
                  {option}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <BodyMap view={view} marks={marks} onToggle={toggle} tint={tint} />

        <Text variant="small" tone="muted" center style={{ marginTop: spacing.base }}>
          Tap an area to mark it. Tap again to raise it, a fourth time to clear.
        </Text>
        <View style={{ marginTop: spacing.md }}>
          <IntensityKey tint={tint} />
        </View>
      </Card>

      {selected.length > 0 ? (
        <Card padded={false}>
          <View style={styles.sectionHeader}>
            <Text variant="caption" tone="muted">
              {kind === 'fat' ? 'Marked areas' : 'Focus areas'}
            </Text>
          </View>
          {selected.map((item) => (
            <View
              key={item.zone}
              style={[styles.historyRow, { borderTopColor: theme.border }]}
            >
              <Text variant="small">{ZONE_LABELS[item.zone] ?? item.zone}</Text>
              <Text variant="small" style={{ color: tint }}>
                {'•'.repeat(item.intensity)}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}

      {marks.saddle_bags || marks.outer_thighs ? (
        <Card variant="tinted">
          <Text variant="smallMedium" tone="primary">
            About this area
          </Text>
          <Text variant="small" tone="secondary" style={{ marginTop: spacing.xs }}>
            Gluteofemoral fat — outer hip and thigh — is the most metabolically
            stubborn depot, and it comes off last. Marking it here shapes your training
            emphasis, not the order your body burns fat. Expect it to change toward the
            end of your 10 kg, not the start.
          </Text>
        </Card>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: spacing.base, gap: spacing.md },
  segments: { flexDirection: 'row', borderRadius: radius.md, padding: 3, gap: 3 },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm + 1,
    borderRadius: radius.md - 3,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: spacing.sm,
    marginBottom: spacing.base,
  },
  track: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
  trackLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  logRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  input: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    fontFamily: 'Inter_400Regular',
    fontSize: 17,
  },
  chartLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  scanPrompt: { flexDirection: 'row', alignItems: 'center', gap: spacing.base },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.base, gap: spacing.base },
  statCell: { flexBasis: '40%', flexGrow: 1, gap: 2 },
  sectionHeader: { padding: spacing.base, paddingBottom: spacing.md },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  viewToggle: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', marginBottom: spacing.base },
  viewChip: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm - 2,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
