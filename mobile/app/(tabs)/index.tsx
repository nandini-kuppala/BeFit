import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  WATER_PRESETS,
  logs,
  me,
  sleep as sleepApi,
  supplements as supplementsApi,
} from '../../src/api/befit';
import {
  MEAL_LABELS,
  type DaySummary,
  type MealGroup,
  type SleepTrend,
  type SupplementToday,
} from '../../src/api/types';
import { BarChart, type Bar } from '../../src/components/BarChart';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { Checkbox } from '../../src/components/Checkbox';
import { ConfidenceDot } from '../../src/components/ConfidenceDot';
import { Icon } from '../../src/components/Icon';
import { MacroBar } from '../../src/components/MacroBar';
import { NavRow } from '../../src/components/NavRow';
import { ProgressRing } from '../../src/components/ProgressRing';
import { Text } from '../../src/components/Text';
import { radius, semantic, series, spacing, useTheme } from '../../src/theme';

function greeting(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Today() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const day = useQuery({ queryKey: ['day'], queryFn: () => logs.day() });
  const profile = useQuery({ queryKey: ['profile'], queryFn: () => me.profile() });
  const sleepTrend = useQuery({ queryKey: ['sleep-trend'], queryFn: () => sleepApi.trend(7) });
  const supplements = useQuery({
    queryKey: ['supplements-today'],
    queryFn: () => supplementsApi.today(),
  });

  const data = day.data;
  const now = new Date();

  return (
    <ScrollView
      style={{ backgroundColor: theme.canvas }}
      contentContainerStyle={[
        styles.page,
        { paddingTop: insets.top + spacing.md, paddingBottom: spacing['4xl'] * 2 },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={day.isRefetching}
          onRefresh={() => {
            day.refetch();
            sleepTrend.refetch();
            supplements.refetch();
          }}
          tintColor={theme.primary}
        />
      }
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text variant="caption" tone="muted">
            {now.toLocaleDateString(undefined, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </Text>
          <Text variant="h1" style={{ marginTop: 1 }}>
            {greeting(now.getHours())}
            {profile.data ? `, ${profile.data.profile.name.split(' ')[0]}` : ''}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ask the coach"
          onPress={() => router.push('/coach')}
          style={({ pressed }) => [
            styles.coachButton,
            { backgroundColor: theme.primarySoft, borderColor: theme.primarySoftBorder },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Icon name="sparkle" size={20} color={theme.primary} />
        </Pressable>
      </View>

      {day.isError ? (
        <Card variant="tinted">
          <Text variant="smallMedium">Couldn't load today</Text>
          <Text variant="small" tone="secondary" style={{ marginTop: 2 }}>
            {(day.error as Error).message}
          </Text>
        </Card>
      ) : null}

      {data ? (
        <>
          <CalorieCard data={data} />
          <MealsCard meals={data.meals} onAdd={() => router.push('/log')} />
          <MacroCard data={data} />

          <NavRow
            title="Track your micronutrients"
            subtitle={microSubtitle(data)}
            icon="sparkle"
            onPress={() => router.push('/micros')}
          />

          {data.estimated_share > 0.4 ? (
            <EstimateNotice share={data.estimated_share} />
          ) : null}

          <WaterCard consumed={data.water_ml} target={data.targets.water_ml} />
          <SleepCard trend={sleepTrend.data} targetHours={data.targets.sleep_hours} />
          <SupplementCard data={supplements.data} onManage={() => router.push('/supplements')} />
        </>
      ) : null}
    </ScrollView>
  );
}

/** Surfaces the one micronutrient worth her attention, so the row earns its
 *  space even when she doesn't tap it. */
function microSubtitle(data: DaySummary): string {
  const exceeded = data.micros.find((micro) => micro.exceeded);
  if (exceeded) return `${exceeded.label} over its safe limit`;

  const priority = data.micros.filter((micro) => micro.priority === 1 && !micro.is_upper_limit);
  if (priority.length === 0) return 'Vitamins, minerals and omega-3';

  const lowest = priority.reduce((worst, micro) =>
    micro.percent < worst.percent ? micro : worst,
  );
  const hit = priority.filter((micro) => micro.percent >= 90).length;
  if (lowest.percent >= 90) return `All ${priority.length} key nutrients on track`;
  return `${hit}/${priority.length} on track · ${lowest.label} lowest`;
}

/**
 * Compact by design. The ring used to be 208px and owned the whole first
 * screen; at 96px it still answers "how much is left" at a glance while
 * leaving room for the things she actually taps.
 */
function CalorieCard({ data }: { data: DaySummary }) {
  const theme = useTheme();
  const consumed = data.consumed.kcal;
  const target = data.targets.kcal;
  const remaining = Math.round(data.remaining_kcal);
  const over = remaining < 0;

  return (
    <Card style={styles.calorieCard}>
      <ProgressRing
        progress={target > 0 ? consumed / target : 0}
        size={96}
        strokeWidth={10}
        color={over ? semantic.warning : theme.primary}
      >
        <Text variant="h2" tabular>
          {Math.abs(remaining).toLocaleString()}
        </Text>
        <Text variant="caption" tone="muted" style={{ fontSize: 9 }}>
          {over ? 'over' : 'left'}
        </Text>
      </ProgressRing>

      <View style={styles.calorieStats}>
        <Stat label="Eaten" value={Math.round(consumed).toLocaleString()} />
        <View style={[styles.hairline, { backgroundColor: theme.border }]} />
        <Stat label="Target" value={Math.round(target).toLocaleString()} />
      </View>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text variant="caption" tone="muted" style={{ fontSize: 9.5 }}>
        {label}
      </Text>
      <Text variant="h3" tabular style={{ marginTop: 1 }}>
        {value}
      </Text>
    </View>
  );
}

function MacroCard({ data }: { data: DaySummary }) {
  return (
    <Card>
      <Text variant="caption" tone="muted" style={{ marginBottom: spacing.md }}>
        Macros
      </Text>
      <View style={{ gap: spacing.md }}>
        <MacroBar
          label="Protein"
          consumed={data.consumed.protein_g}
          target={data.targets.protein_g}
          color={series.protein}
        />
        <MacroBar
          label="Carbs"
          consumed={data.consumed.carbs_g}
          target={data.targets.carbs_g}
          color={series.carbs}
        />
        <MacroBar
          label="Fat"
          consumed={data.consumed.fat_g}
          target={data.targets.fat_g}
          color={series.fat}
        />
        <MacroBar
          label="Fibre"
          consumed={data.consumed.fibre_g}
          target={data.targets.fibre_g}
          color={series.fibre}
        />
      </View>
    </Card>
  );
}

/**
 * Honesty about data quality. If a large share of the day came from AI
 * estimates, the number at the top of the screen deserves less trust — and the
 * app says so rather than pretending.
 */
function EstimateNotice({ share }: { share: number }) {
  return (
    <Card variant="tinted">
      <View style={styles.rowCenter}>
        <ConfidenceDot level="estimated" showLabel />
      </View>
      <Text variant="small" tone="secondary" style={{ marginTop: spacing.sm }}>
        {Math.round(share * 100)}% of today's calories came from estimated data. Tap any
        item to correct it — BeFit remembers your correction and uses it from then on.
      </Text>
    </Card>
  );
}

function WaterCard({ consumed, target }: { consumed: number; target: number }) {
  const theme = useTheme();
  const queryClient = useQueryClient();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['day'] });
  const add = useMutation({ mutationFn: (ml: number) => logs.water(ml), onSuccess: invalidate });
  const undo = useMutation({ mutationFn: () => logs.undoWater(), onSuccess: invalidate });

  // The bar is drawn in 200 ml glasses, so the units on screen match the units
  // on the buttons.
  const glasses = Math.max(1, Math.round(target / 200));
  const filled = Math.floor(consumed / 200);
  const busy = add.isPending || undo.isPending;

  return (
    <Card>
      <View style={styles.cardHeader}>
        <Text variant="caption" tone="muted">
          Water
        </Text>
        <View style={styles.rowCenter}>
          <Text variant="smallMedium" tabular>
            {(consumed / 1000).toFixed(2)} / {(target / 1000).toFixed(1)} L
          </Text>
          {consumed > 0 ? (
            <Pressable
              onPress={() => undo.mutate()}
              disabled={busy}
              hitSlop={10}
              accessibilityLabel="Undo last water entry"
            >
              <Text variant="caption" tone="primary" style={{ fontSize: 10 }}>
                Undo
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.glasses}>
        {Array.from({ length: glasses }).map((_, index) => (
          <View
            key={index}
            style={[
              styles.glass,
              {
                backgroundColor: index < filled ? series.water : theme.surfaceSunken,
                borderColor: index < filled ? series.water : theme.border,
              },
            ]}
          />
        ))}
      </View>

      <View style={styles.waterButtons}>
        {WATER_PRESETS.map((preset) => (
          <Pressable
            key={preset.ml}
            disabled={busy}
            onPress={() => add.mutate(preset.ml)}
            accessibilityRole="button"
            accessibilityLabel={`Add ${preset.sub} of water`}
            style={({ pressed }) => [
              styles.waterButton,
              { borderColor: theme.border, backgroundColor: theme.surfaceSunken },
              pressed && { opacity: 0.65 },
            ]}
          >
            <Icon name="water" size={15} color={series.water} />
            <View>
              <Text variant="smallMedium" style={{ fontSize: 12.5 }}>
                {preset.label}
              </Text>
              <Text variant="caption" tone="muted" style={{ fontSize: 9, letterSpacing: 0.2 }}>
                {preset.sub}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Sleep is entered as bed and wake time, not a duration — nobody knows how
 *  many hours they slept, but everyone knows when they went to bed. */
function SleepCard({
  trend,
  targetHours,
}: {
  trend: SleepTrend | undefined;
  targetHours: number;
}) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [bed, setBed] = useState('22:30');
  const [wake, setWake] = useState('06:30');
  const [editing, setEditing] = useState(false);

  const save = useMutation({
    mutationFn: () => {
      const today = new Date();
      const [bedH, bedM] = bed.split(':').map(Number);
      const [wakeH, wakeM] = wake.split(':').map(Number);

      const wakeAt = new Date(today);
      wakeAt.setHours(wakeH, wakeM, 0, 0);
      const bedAt = new Date(today);
      bedAt.setHours(bedH, bedM, 0, 0);
      // Going to bed at 22:30 and waking at 06:30 means bedtime was yesterday.
      if (bedAt >= wakeAt) bedAt.setDate(bedAt.getDate() - 1);

      return sleepApi.log(bedAt.toISOString(), wakeAt.toISOString());
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['day'] }),
        queryClient.invalidateQueries({ queryKey: ['sleep-trend'] }),
      ]);
      setEditing(false);
    },
  });

  const nights = trend?.nights ?? [];
  const lastNight = nights.length ? nights[nights.length - 1] : undefined;
  const hours = lastNight?.minutes != null ? lastNight.minutes / 60 : null;
  const valid = /^\d{1,2}:\d{2}$/.test(bed) && /^\d{1,2}:\d{2}$/.test(wake);

  const bars: Bar[] = nights.map((night, index) => {
    const date = new Date(`${night.date}T00:00:00`);
    return {
      label: WEEKDAY_INITIALS[date.getDay()],
      value: night.minutes != null ? night.minutes / 60 : null,
      highlight: index === nights.length - 1,
    };
  });

  // Scale to the target plus a little headroom, so a 9-hour night has somewhere
  // to go and the target line never sits flush against the top.
  const chartMax = Math.max(targetHours + 1.5, ...bars.map((bar) => bar.value ?? 0));

  return (
    <Card>
      <View style={styles.cardHeader}>
        <Text variant="caption" tone="muted">
          Sleep · last 7 nights
        </Text>
        {hours != null && !editing ? (
          <Pressable onPress={() => setEditing(true)} hitSlop={10}>
            <Text variant="smallMedium" tone="primary">
              Edit
            </Text>
          </Pressable>
        ) : null}
      </View>

      {nights.length > 0 ? (
        <View style={{ marginTop: spacing.md }}>
          <BarChart
            bars={bars}
            max={chartMax}
            color={series.sleep}
            target={targetHours}
            height={92}
            format={(value) => (value >= 1 ? `${value.toFixed(1)}` : '')}
          />
        </View>
      ) : null}

      {trend?.average_minutes != null ? (
        <View style={[styles.sleepMeta, { borderTopColor: theme.border }]}>
          <Text variant="small" tone="secondary" tabular>
            Average{' '}
            <Text variant="smallMedium" tabular>
              {Math.floor(trend.average_minutes / 60)}h {trend.average_minutes % 60}m
            </Text>
          </Text>
          <Text variant="small" tone="muted" tabular>
            {trend.nights_on_target}/{nights.length} hit the {targetHours}h line
          </Text>
        </View>
      ) : null}

      {hours != null && !editing ? (
        <View style={styles.sleepSummary}>
          <Text variant="small" tone={hours >= targetHours - 0.5 ? 'secondary' : 'muted'}>
            {hours >= targetHours - 0.5
              ? 'Last night was on target — this is when recovery happens'
              : `Last night was ${(targetHours - hours).toFixed(1)}h short of ${targetHours}h`}
          </Text>
        </View>
      ) : (
        <View style={styles.sleepRow}>
          <View style={styles.sleepField}>
            <Text variant="small" tone="muted">
              Bed
            </Text>
            <TextInput
              value={bed}
              onChangeText={setBed}
              placeholder="22:30"
              placeholderTextColor={theme.textMuted}
              style={[
                styles.sleepInput,
                {
                  backgroundColor: theme.surfaceSunken,
                  borderColor: theme.border,
                  color: theme.text,
                },
              ]}
            />
          </View>
          <View style={styles.sleepField}>
            <Text variant="small" tone="muted">
              Woke up
            </Text>
            <TextInput
              value={wake}
              onChangeText={setWake}
              placeholder="06:30"
              placeholderTextColor={theme.textMuted}
              style={[
                styles.sleepInput,
                {
                  backgroundColor: theme.surfaceSunken,
                  borderColor: theme.border,
                  color: theme.text,
                },
              ]}
            />
          </View>
          <Button
            label="Log"
            size="sm"
            onPress={() => save.mutate()}
            loading={save.isPending}
            disabled={!valid}
            style={styles.sleepButton}
          />
        </View>
      )}
    </Card>
  );
}

function SupplementCard({
  data,
  onManage,
}: {
  data: SupplementToday | undefined;
  onManage: () => void;
}) {
  const theme = useTheme();
  const queryClient = useQueryClient();

  const toggle = useMutation({
    mutationFn: ({ id, taken }: { id: string; taken: boolean }) =>
      supplementsApi.setTaken(id, taken),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['supplements-today'] }),
  });

  const items = data?.items ?? [];

  return (
    <Card padded={false}>
      <View style={[styles.cardHeader, styles.blockHeader]}>
        <Text variant="caption" tone="muted">
          Supplements today
        </Text>
        <View style={styles.rowCenter}>
          {items.length > 0 ? (
            <Text variant="small" tone="secondary" tabular>
              {data?.taken_count ?? 0}/{data?.due_count ?? 0}
            </Text>
          ) : null}
          <Pressable onPress={onManage} hitSlop={10}>
            <Text variant="smallMedium" tone="primary">
              {items.length > 0 ? 'Manage' : 'Add'}
            </Text>
          </Pressable>
        </View>
      </View>

      {items.length === 0 ? (
        <Pressable onPress={onManage} style={styles.emptySmall}>
          <Icon name="pill" size={22} color={theme.textMuted} />
          <Text variant="small" tone="secondary" center style={{ marginTop: spacing.sm }}>
            No supplements set up
          </Text>
          <Text variant="small" tone="muted" center style={{ marginTop: 1, fontSize: 12 }}>
            Add vitamin D, omega-3, iron and anything else you take
          </Text>
        </Pressable>
      ) : (
        items.map((item) => (
          <View key={item.id} style={[styles.supplementRow, { borderTopColor: theme.border }]}>
            <Checkbox
              checked={item.taken}
              onToggle={() => toggle.mutate({ id: item.id, taken: !item.taken })}
              label={item.name}
              size={24}
            />
            <View style={{ flex: 1 }}>
              <Text
                variant="smallMedium"
                style={item.taken ? { color: theme.textMuted } : undefined}
              >
                {item.name}
                {item.dose ? (
                  <Text variant="small" tone="muted">
                    {'  '}
                    {item.dose}
                  </Text>
                ) : null}
              </Text>
              <Text variant="small" tone="muted" style={{ fontSize: 11.5, marginTop: 1 }}>
                {item.time_label}
              </Text>
              {item.interaction_warning ? (
                <View style={[styles.warnTag, { backgroundColor: theme.surfaceSunken }]}>
                  <Text variant="small" style={{ color: semantic.warning, fontSize: 11 }}>
                    {item.interaction_warning}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        ))
      )}
    </Card>
  );
}

function MealsCard({ meals, onAdd }: { meals: MealGroup[]; onAdd: () => void }) {
  const theme = useTheme();
  const logged = meals.filter((meal) => meal.items.length > 0);

  return (
    <Card padded={false}>
      <View style={[styles.cardHeader, styles.blockHeader]}>
        <Text variant="caption" tone="muted">
          Log today's meals
        </Text>
        <Pressable onPress={onAdd} hitSlop={10}>
          <Text variant="smallMedium" tone="primary">
            Add
          </Text>
        </Pressable>
      </View>

      {logged.length === 0 ? (
        <Pressable onPress={onAdd} style={styles.empty}>
          <Icon name="mic" size={24} color={theme.textMuted} />
          <Text variant="body" tone="secondary" center style={{ marginTop: spacing.sm }}>
            Nothing logged yet
          </Text>
          <Text variant="small" tone="muted" center style={{ marginTop: 1 }}>
            Tap the mic and just say what you ate
          </Text>
        </Pressable>
      ) : (
        logged.map((meal) => (
          <View key={meal.meal} style={[styles.mealBlock, { borderTopColor: theme.border }]}>
            <View style={styles.cardHeader}>
              <Text variant="smallMedium">{MEAL_LABELS[meal.meal]}</Text>
              <Text variant="small" tone="muted" tabular>
                {Math.round(meal.kcal)} kcal
              </Text>
            </View>
            {meal.items.map((item, index) => (
              <View key={`${item.name}-${index}`} style={styles.item}>
                <ConfidenceDot level={item.confidence} />
                <View style={{ flex: 1 }}>
                  <Text variant="small" numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text variant="small" tone="muted" tabular style={{ fontSize: 11 }}>
                    {item.quantity % 1 === 0 ? item.quantity : item.quantity.toFixed(1)}{' '}
                    {item.unit} · {Math.round(item.grams)} g
                  </Text>
                </View>
                <Text variant="small" tone="secondary" tabular>
                  {Math.round(item.nutrients.kcal)}
                </Text>
              </View>
            ))}
          </View>
        ))
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: spacing.base, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
  coachButton: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  calorieCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  calorieStats: { flex: 1, gap: spacing.md },
  stat: {},
  hairline: { height: StyleSheet.hairlineWidth },

  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  blockHeader: { padding: spacing.base },

  glasses: { flexDirection: 'row', gap: 3, marginVertical: spacing.md },
  glass: { flex: 1, height: 22, borderRadius: radius.sm - 5, borderWidth: 1 },
  waterButtons: { flexDirection: 'row', gap: spacing.sm },
  waterButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
  },

  sleepMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sleepSummary: { marginTop: spacing.sm },
  sleepRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md, marginTop: spacing.md },
  sleepField: { flex: 1, gap: spacing.xs },
  sleepInput: {
    height: 44,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
  },
  sleepButton: { paddingHorizontal: spacing.base },

  supplementRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  warnTag: {
    marginTop: spacing.xs + 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm - 4,
  },

  mealBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  empty: { alignItems: 'center', paddingVertical: spacing.xl, paddingHorizontal: spacing.xl },
  emptySmall: {
    alignItems: 'center',
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
});
