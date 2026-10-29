import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
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
  food as foodApi,
  logs,
  me,
  savedMeals,
  sleep as sleepApi,
  supplements as supplementsApi,
} from '../../src/api/befit';
import { ApiError } from '../../src/api/client';
import {
  MEAL_LABELS,
  type DaySummary,
  type LoggedFood,
  type Meal,
  type MealGroup,
  type SleepTrend,
  type SupplementToday,
} from '../../src/api/types';
import { FoodSheet } from '../../src/components/FoodSheet';
import { localISODate } from '../../src/lib/date';
import { formatQuantity } from '../../src/lib/portions';
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

function shiftDay(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return localISODate(new Date(y, m - 1, d + days));
}

function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export default function Today() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const today = localISODate();
  const [date, setDate] = useState(today);
  const isToday = date === today;

  // Keyed by date: the old ['day'] key had no date, so an app left open
  // overnight kept showing yesterday as "today".
  const day = useQuery({
    queryKey: ['day', date],
    queryFn: ({ signal }) => logs.day(date, signal),
    placeholderData: keepPreviousData,
  });
  const history = useQuery({
    queryKey: ['day-history', today],
    queryFn: () => logs.history(7, today),
    staleTime: 60_000,
  });
  const profile = useQuery({ queryKey: ['profile'], queryFn: () => me.profile() });
  const sleepTrend = useQuery({ queryKey: ['sleep-trend'], queryFn: () => sleepApi.trend(7) });
  const supplements = useQuery({
    queryKey: ['supplements-today'],
    queryFn: () => supplementsApi.today(),
  });

  const data = day.data?.date === date ? day.data : undefined;
  const now = new Date();
  const addFood = (meal?: Meal) =>
    router.push(`/food-add?date=${date}${meal ? `&meal=${meal}` : ''}`);

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
            history.refetch();
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
            {longDate(date)}
          </Text>
          <Text variant="h1" style={{ marginTop: 1 }}>
            {isToday
              ? `${greeting(now.getHours())}${profile.data ? `, ${profile.data.profile.name.split(' ')[0]}` : ''}`
              : date === shiftDay(today, -1)
                ? 'Yesterday'
                : 'Looking back'}
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

      <WeekStrip
        selected={date}
        today={today}
        days={history.data ?? []}
        onSelect={setDate}
      />

      {day.isError && !data ? (
        <Card variant="tinted">
          <Text variant="smallMedium">Couldn't load {isToday ? 'today' : 'that day'}</Text>
          <Text variant="small" tone="secondary" style={{ marginTop: 2 }}>
            {(day.error as Error).message}
          </Text>
          <Button
            label="Try again"
            size="sm"
            variant="secondary"
            onPress={() => day.refetch()}
            style={{ marginTop: spacing.md, alignSelf: 'flex-start' }}
          />
        </Card>
      ) : null}

      {!data && day.isLoading ? (
        <View style={styles.loadingBlock}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : null}

      {data ? (
        <>
          <CalorieCard data={data} />
          <MealsCard date={date} meals={data.meals} onAdd={addFood} />
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

          <WaterCard date={date} consumed={data.water_ml} target={data.targets.water_ml} />
          {isToday ? (
            <>
              <SleepCard trend={sleepTrend.data} targetHours={data.targets.sleep_hours} />
              <SupplementCard data={supplements.data} onManage={() => router.push('/supplements')} />
            </>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** The last seven days at a glance — tap one to see or fill it in. A dot
 *  under each shows whether anything was logged, so gaps are obvious. */
function WeekStrip({
  selected,
  today,
  days,
  onSelect,
}: {
  selected: string;
  today: string;
  days: { date: string; kcal: number; target_kcal: number }[];
  onSelect: (date: string) => void;
}) {
  const theme = useTheme();
  const byDate = new Map(days.map((d) => [d.date, d]));
  const dates = Array.from({ length: 7 }, (_, i) => shiftDay(today, i - 6));

  return (
    <View style={styles.weekStrip}>
      {dates.map((iso) => {
        const [y, m, d] = iso.split('-').map(Number);
        const date = new Date(y, m - 1, d);
        const info = byDate.get(iso);
        const active = iso === selected;
        const ratio = info && info.target_kcal ? info.kcal / info.target_kcal : 0;
        const dot =
          !info || info.kcal === 0
            ? theme.border
            : ratio > 1.1
              ? semantic.warning
              : ratio >= 0.8
                ? semantic.success
                : theme.primary;
        return (
          <Pressable
            key={iso}
            onPress={() => onSelect(iso)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={date.toDateString()}
            style={[
              styles.weekDay,
              {
                backgroundColor: active ? theme.primary : theme.surface,
                borderColor: active ? theme.primary : theme.border,
              },
            ]}
          >
            <Text variant="caption" tone={active ? 'inverse' : 'muted'} style={{ fontSize: 9.5 }}>
              {DAY_INITIALS[date.getDay()]}
            </Text>
            <Text variant="smallMedium" tone={active ? 'inverse' : 'default'} tabular>
              {d}
            </Text>
            <View style={[styles.weekDot, { backgroundColor: active ? theme.onPrimary : dot }]} />
          </Pressable>
        );
      })}
    </View>
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

function WaterCard({ date, consumed, target }: { date: string; consumed: number; target: number }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const key = ['day', date];

  // Optimistic: the glass fills on tap, and rolls back if the server says no.
  const adjust = (delta: number) => {
    const previous = queryClient.getQueryData<DaySummary>(key);
    if (previous) {
      queryClient.setQueryData<DaySummary>(key, {
        ...previous,
        water_ml: Math.max(0, previous.water_ml + delta),
      });
    }
    return { previous };
  };
  const rollback = (_e: unknown, _v: unknown, context?: { previous?: DaySummary }) => {
    if (context?.previous) queryClient.setQueryData(key, context.previous);
  };
  const settle = () => queryClient.invalidateQueries({ queryKey: key });

  const add = useMutation({
    mutationFn: (ml: number) => logs.water(ml, date),
    onMutate: (ml) => adjust(ml),
    onError: rollback,
    onSettled: settle,
  });
  const undo = useMutation({
    mutationFn: () => logs.undoWater(date),
    onError: rollback,
    onSettled: settle,
  });

  // The bar is drawn in 200 ml glasses, so the units on screen match the units
  // on the buttons.
  const glasses = Math.max(1, Math.round(target / 200));
  const filled = Math.floor(consumed / 200);

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
              disabled={undo.isPending}
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

const WEEKDAY_INITIALS = DAY_INITIALS;

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
    onSuccess: () => {
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['day'] });
      queryClient.invalidateQueries({ queryKey: ['sleep-trend'] });
    },
  });

  const nights = trend?.nights ?? [];
  const lastNight = nights.length ? nights[nights.length - 1] : undefined;
  const hours = lastNight?.minutes != null ? lastNight.minutes / 60 : null;
  const validTime = (value: string) => {
    const match = value.match(/^(\d{1,2}):(\d{2})$/);
    return !!match && Number(match[1]) < 24 && Number(match[2]) < 60;
  };
  const valid = validTime(bed) && validTime(wake) && bed !== wake;

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
    // Tick immediately; a second quick tap then sends the right value instead
    // of re-sending the stale one.
    onMutate: ({ id, taken }) => {
      const previous = queryClient.getQueryData<SupplementToday>(['supplements-today']);
      if (previous) {
        const items = previous.items.map((item) => (item.id === id ? { ...item, taken } : item));
        queryClient.setQueryData<SupplementToday>(['supplements-today'], {
          ...previous,
          items,
          taken_count: items.filter((item) => item.taken).length,
        });
      }
      return { previous };
    },
    onError: (_e, _v, context) => {
      if (context?.previous) queryClient.setQueryData(['supplements-today'], context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['supplements-today'] }),
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

type Editing = { item: LoggedFood; logId: string; meal: Meal };

/**
 * Every meal slot, always — an empty breakfast is something to fill, not
 * something to hide. Items open the same sheet used to add them, so changing
 * "2 idli" to "3" or moving it to lunch is one tap and a stepper.
 */
function MealsCard({
  date,
  meals,
  onAdd,
}: {
  date: string;
  meals: MealGroup[];
  onAdd: (meal?: Meal) => void;
}) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [savingMeal, setSavingMeal] = useState<MealGroup | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['day'] });
    queryClient.invalidateQueries({ queryKey: ['day-history'] });
    queryClient.invalidateQueries({ queryKey: ['food-recent'] });
  };

  const detail = useQuery({
    queryKey: ['food-detail', editing?.item.food_id],
    queryFn: ({ signal }) => foodApi.detail(editing!.item.food_id!, signal),
    enabled: !!editing?.item.food_id,
    staleTime: 10 * 60_000,
  });

  const update = useMutation({
    mutationFn: (value: { quantity: number; portionKey: string; meal: Meal }) =>
      logs.updateItem(editing!.logId, editing!.item.id, {
        quantity: value.quantity,
        unit: value.portionKey,
        ...(value.meal !== editing!.meal ? { meal: value.meal } : {}),
      }),
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
  });

  const remove = useMutation({
    mutationFn: ({ logId, itemId }: { logId: string; itemId: string }) => logs.deleteItem(logId, itemId),
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
  });

  const copy = useMutation({
    mutationFn: (meal: Meal) => logs.copyMeal(shiftDay(date, -1), meal, date, meal),
    onSuccess: refresh,
    onError: (err, meal) =>
      setNotice(
        err instanceof ApiError && err.status === 404
          ? `Nothing was logged for ${MEAL_LABELS[meal].toLowerCase()} the day before.`
          : (err as Error).message,
      ),
  });

  const openItem = (item: LoggedFood, meal: MealGroup) => {
    if (!meal.log_id) return;
    if (!item.food_id) {
      // Quick-add entries have no food behind them; the only edit is removal.
      Alert.alert(item.name, `${Math.round(item.nutrients.kcal)} kcal, added as a quick entry.`, [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => remove.mutate({ logId: meal.log_id!, itemId: item.id }),
        },
      ]);
      return;
    }
    update.reset();
    setEditing({ item, logId: meal.log_id, meal: meal.meal });
  };

  return (
    <Card padded={false}>
      <View style={[styles.cardHeader, styles.blockHeader]}>
        <Text variant="caption" tone="muted">
          Meals
        </Text>
        <Pressable onPress={() => onAdd()} hitSlop={10} style={styles.rowCenter}>
          <Icon name="plus" size={16} color={theme.primary} />
          <Text variant="smallMedium" tone="primary">
            Add food
          </Text>
        </Pressable>
      </View>

      {notice ? (
        <Pressable onPress={() => setNotice(null)} style={[styles.notice, { backgroundColor: theme.surfaceSunken }]}>
          <Text variant="small" tone="secondary">
            {notice}
          </Text>
        </Pressable>
      ) : null}

      {meals.map((meal) => (
        <View key={meal.meal} style={[styles.mealBlock, { borderTopColor: theme.border }]}>
          <View style={styles.cardHeader}>
            <Pressable onPress={() => onAdd(meal.meal)} style={{ flex: 1 }} hitSlop={6}>
              <Text variant="smallMedium">{MEAL_LABELS[meal.meal]}</Text>
              {meal.items.length ? (
                <Text variant="small" tone="muted" tabular style={{ fontSize: 11.5 }}>
                  {Math.round(meal.kcal)} kcal · {Math.round(meal.protein_g)} g protein
                </Text>
              ) : null}
            </Pressable>
            <View style={styles.rowCenter}>
              {meal.items.length ? (
                <Pressable onPress={() => setSavingMeal(meal)} hitSlop={8} accessibilityLabel={`Save ${MEAL_LABELS[meal.meal]} as a meal`}>
                  <Text variant="caption" tone="muted" style={{ fontSize: 10 }}>
                    Save
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => copy.mutate(meal.meal)}
                  disabled={copy.isPending}
                  hitSlop={8}
                  accessibilityLabel={`Copy yesterday's ${MEAL_LABELS[meal.meal]}`}
                >
                  {copy.isPending && copy.variables === meal.meal ? (
                    <ActivityIndicator size="small" color={theme.primary} />
                  ) : (
                    <Icon name="copy" size={16} color={theme.textMuted} />
                  )}
                </Pressable>
              )}
              <Pressable
                onPress={() => onAdd(meal.meal)}
                hitSlop={8}
                accessibilityLabel={`Add to ${MEAL_LABELS[meal.meal]}`}
                style={[styles.mealAdd, { backgroundColor: theme.primarySoft }]}
              >
                <Icon name="plus" size={16} color={theme.primary} strokeWidth={2.3} />
              </Pressable>
            </View>
          </View>
          {meal.items.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => openItem(item, meal)}
              style={({ pressed }) => [styles.item, pressed && { opacity: 0.6 }]}
              accessibilityHint="Edit amount, move or remove"
            >
              <ConfidenceDot level={item.confidence} />
              <View style={{ flex: 1 }}>
                <Text variant="small" numberOfLines={1}>
                  {item.name}
                </Text>
                <Text variant="small" tone="muted" tabular style={{ fontSize: 11 }}>
                  {item.unit === 'entry'
                    ? 'quick entry'
                    : `${formatQuantity(item.quantity)} ${item.unit}${item.unit === 'g' ? '' : ` · ${Math.round(item.grams)} g`}`}
                </Text>
              </View>
              <Text variant="small" tone="secondary" tabular>
                {Math.round(item.nutrients.kcal)}
              </Text>
            </Pressable>
          ))}
        </View>
      ))}

      <FoodSheet
        visible={!!editing && !!detail.data}
        food={detail.data ?? null}
        mode="edit"
        meal={editing?.meal ?? 'breakfast'}
        initialQuantity={editing?.item.quantity}
        initialPortionKey={editing?.item.portion_key ?? editing?.item.unit}
        busy={update.isPending}
        error={update.isError ? (update.error as Error).message : null}
        onSubmit={(value) => update.mutate(value)}
        onDelete={() =>
          editing && remove.mutate({ logId: editing.logId, itemId: editing.item.id })
        }
        onClose={() => setEditing(null)}
      />
      {editing && detail.isLoading ? (
        <View style={styles.sheetLoading}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : null}

      <SaveMealModal
        meal={savingMeal}
        onClose={() => setSavingMeal(null)}
        onSaved={(name) => {
          setSavingMeal(null);
          setNotice(`Saved "${name}" — log it again from Add food in one tap.`);
          queryClient.invalidateQueries({ queryKey: ['saved-meals'] });
        }}
      />
    </Card>
  );
}

function SaveMealModal({
  meal,
  onClose,
  onSaved,
}: {
  meal: MealGroup | null;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const theme = useTheme();
  const [name, setName] = useState('');
  const save = useMutation({
    mutationFn: () => savedMeals.fromLog(name.trim(), meal!.log_id!),
    onSuccess: () => onSaved(name.trim()),
  });

  return (
    <Modal
      visible={!!meal}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      onShow={() => {
        setName(meal ? `My ${MEAL_LABELS[meal.meal].toLowerCase()}` : '');
        save.reset();
      }}
    >
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <View style={styles.modalCenter} pointerEvents="box-none">
        <View style={[styles.modalCard, { backgroundColor: theme.canvas }]}>
          <Text variant="h3">Save as a meal</Text>
          <Text variant="small" tone="secondary">
            {meal?.items.map((i) => i.name).join(', ')}
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            autoFocus
            placeholder="Meal name"
            placeholderTextColor={theme.textMuted}
            style={[styles.sleepInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface }]}
          />
          {save.isError ? (
            <Text variant="small" style={{ color: semantic.danger }}>
              {(save.error as Error).message}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button label="Cancel" variant="secondary" size="sm" onPress={onClose} style={{ flex: 1 }} />
            <Button
              label="Save"
              size="sm"
              onPress={() => save.mutate()}
              loading={save.isPending}
              disabled={!name.trim()}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </View>
    </Modal>
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
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 2 },
  mealAdd: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: { marginHorizontal: spacing.base, marginBottom: spacing.sm, padding: spacing.md, borderRadius: radius.sm },
  sheetLoading: { paddingVertical: spacing.md, alignItems: 'center' },
  loadingBlock: { paddingVertical: spacing['3xl'], alignItems: 'center' },
  weekStrip: { flexDirection: 'row', gap: spacing.xs + 2 },
  weekDay: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  weekDot: { width: 5, height: 5, borderRadius: radius.pill, marginTop: 2 },
  modalBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(12, 8, 20, 0.45)' },
  modalCenter: { flex: 1, justifyContent: 'center', padding: spacing.xl },
  modalCard: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  empty: { alignItems: 'center', paddingVertical: spacing.xl, paddingHorizontal: spacing.xl },
  emptySmall: {
    alignItems: 'center',
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
});
