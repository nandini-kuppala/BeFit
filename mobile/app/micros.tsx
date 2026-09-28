import { useQuery } from '@tanstack/react-query';
import { ScrollView, StyleSheet, View } from 'react-native';

import { logs } from '../src/api/befit';
import type { MicroProgress } from '../src/api/types';
import { Card } from '../src/components/Card';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Text } from '../src/components/Text';
import { radius, semantic, spacing, useTheme } from '../src/theme';

const GROUPS: { priority: number; title: string; blurb: string }[] = [
  {
    priority: 1,
    title: 'Watch these',
    blurb:
      'The ones that matter most for your thyroid, your energy and holding onto muscle while you lose fat.',
  },
  { priority: 2, title: 'Also tracked', blurb: 'Worth keeping an eye on across a week.' },
  { priority: 3, title: 'Everything else', blurb: '' },
];

export default function Micros() {
  const theme = useTheme();
  const day = useQuery({ queryKey: ['day'], queryFn: () => logs.day() });

  const micros = day.data?.micros ?? [];
  const grouped = GROUPS.map((group) => ({
    ...group,
    items: micros.filter((micro) =>
      group.priority === 3 ? micro.priority >= 3 : micro.priority === group.priority,
    ),
  })).filter((group) => group.items.length > 0);

  const overLimit = micros.filter((micro) => micro.exceeded);

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas }}>
      <ScreenHeader title="Micronutrients" subtitle="Today" />

      <ScrollView contentContainerStyle={styles.page}>
        {overLimit.length > 0 ? (
          <Card variant="tinted">
            <Text variant="smallMedium" style={{ color: semantic.danger }}>
              Over a safe limit
            </Text>
            <Text variant="small" tone="secondary" style={{ marginTop: spacing.xs }}>
              {overLimit.map((micro) => micro.label).join(', ')} went past the ceiling
              today. These are limits, not targets — more is not better.
            </Text>
          </Card>
        ) : null}

        {grouped.map((group) => (
          <View key={group.priority} style={{ gap: spacing.sm }}>
            <View style={styles.groupHeader}>
              <Text variant="caption" tone="muted">
                {group.title}
              </Text>
              {group.blurb ? (
                <Text variant="small" tone="muted" style={{ marginTop: 2 }}>
                  {group.blurb}
                </Text>
              ) : null}
            </View>

            <Card padded={false}>
              {group.items.map((micro, index) => (
                <MicroRow key={micro.key} micro={micro} first={index === 0} />
              ))}
            </Card>
          </View>
        ))}

        {day.isLoading ? (
          <Text variant="small" tone="muted" center>
            Loading…
          </Text>
        ) : null}

        <Text variant="small" tone="muted" style={{ marginTop: spacing.sm }}>
          Targets follow ICMR-NIN recommendations for Indian women, adjusted for your
          thyroid: selenium is promoted because it drives T4-to-T3 conversion, and iodine
          is capped rather than chased.
        </Text>
      </ScrollView>
    </View>
  );
}

function MicroRow({ micro, first }: { micro: MicroProgress; first: boolean }) {
  const theme = useTheme();
  const ratio = Math.min(micro.percent / 100, 1);
  const color = micro.exceeded
    ? semantic.danger
    : micro.is_upper_limit
      ? semantic.warning
      : micro.percent >= 90
        ? semantic.success
        : theme.primary;

  return (
    <View
      style={[
        styles.row,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
      ]}
    >
      <View style={styles.rowHeader}>
        <View style={styles.labelRow}>
          <Text variant="smallMedium">{micro.label}</Text>
          {micro.is_upper_limit ? (
            <View style={[styles.limitTag, { backgroundColor: theme.surfaceSunken }]}>
              <Text variant="caption" style={{ color: semantic.warning, fontSize: 9 }}>
                Limit
              </Text>
            </View>
          ) : null}
        </View>
        <Text variant="small" tone="secondary" tabular>
          {micro.consumed < 10 ? micro.consumed.toFixed(1) : Math.round(micro.consumed)}
          <Text variant="small" tone="muted" tabular>
            {` / ${micro.target} ${micro.unit}`}
          </Text>
        </Text>
      </View>

      <View style={[styles.track, { backgroundColor: theme.surfaceSunken }]}>
        <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: color }]} />
      </View>

      <Text variant="caption" tone="muted" tabular style={{ fontSize: 9.5 }}>
        {Math.round(micro.percent)}%{micro.is_upper_limit ? ' of the ceiling' : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: spacing.base, gap: spacing.lg, paddingBottom: spacing['4xl'] },
  groupHeader: { paddingHorizontal: spacing.xs },
  row: { paddingHorizontal: spacing.base, paddingVertical: spacing.md, gap: spacing.xs + 2 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  limitTag: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  track: { height: 6, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
});
