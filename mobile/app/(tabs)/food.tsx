import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { diet, me, savedMeals } from '../../src/api/befit';
import { MEAL_LABELS, type SavedMeal } from '../../src/api/types';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { ConfidenceDot } from '../../src/components/ConfidenceDot';
import { Icon, type IconName } from '../../src/components/Icon';
import { Text } from '../../src/components/Text';
import { radius, semantic, spacing, useTheme } from '../../src/theme';

export default function FoodTab() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [tab, setTab] = useState<'log' | 'meals' | 'plan'>('log');

  return (
    <ScrollView
      style={{ backgroundColor: theme.canvas }}
      contentContainerStyle={[
        styles.page,
        { paddingTop: insets.top + spacing.base, paddingBottom: spacing['4xl'] * 2 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Text variant="h1">Food</Text>

      <View style={[styles.segments, { backgroundColor: theme.surfaceSunken }]}>
        {(
          [
            { key: 'log', label: 'Log food' },
            { key: 'meals', label: 'My meals' },
            { key: 'plan', label: 'Weekly plan' },
          ] as const
        ).map((option) => {
          const active = tab === option.key;
          return (
            <Pressable
              key={option.key}
              onPress={() => setTab(option.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={[styles.segment, active && { backgroundColor: theme.surface }]}
            >
              <Text variant="smallMedium" tone={active ? 'default' : 'muted'}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tab === 'plan' ? <WeeklyPlan /> : null}
      {tab === 'meals' ? <MyMeals /> : null}
      {tab === 'log' ? <LogLauncher /> : null}
    </ScrollView>
  );
}

/** Entry points into the one add-food flow, so there is a single place where
 *  portions, variations and meal choice work the same way every time. */
function LogLauncher() {
  const theme = useTheme();
  const router = useRouter();

  const entries: { icon: IconName; title: string; subtitle: string; href: string }[] = [
    { icon: 'search', title: 'Search foods', subtitle: 'Indian dishes, ingredients, packaged foods', href: '/food-add' },
    { icon: 'mic', title: 'Say it', subtitle: '"Two idli, sambar and a filter coffee"', href: '/log' },
    { icon: 'camera', title: 'Snap your plate', subtitle: 'Photo → items to confirm', href: '/food-photo' },
    { icon: 'barcode', title: 'Scan a barcode', subtitle: 'Packaged foods via Open Food Facts', href: '/food-scan' },
    { icon: 'recipe', title: 'Build a recipe', subtitle: 'Home cooking, exact to the ingredient', href: '/recipe-edit' },
    { icon: 'edit', title: 'Add from a label', subtitle: 'Your own food, verified', href: '/food-new' },
  ];

  return (
    <>
      <Pressable
        onPress={() => router.push('/food-add')}
        style={[styles.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}
        accessibilityRole="search"
      >
        <Icon name="search" size={19} color={theme.textMuted} />
        <Text variant="body" tone="muted">
          Search idli, roti, dal, paneer…
        </Text>
      </Pressable>
      {entries.map((entry) => (
        <Pressable key={entry.title} onPress={() => router.push(entry.href as never)}>
          <Card padded={false} variant="flat">
            <View style={styles.launchRow}>
              <View style={[styles.launchIcon, { backgroundColor: theme.primarySoft }]}>
                <Icon name={entry.icon} size={20} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="bodyMedium">{entry.title}</Text>
                <Text variant="small" tone="muted" numberOfLines={1}>
                  {entry.subtitle}
                </Text>
              </View>
              <Icon name="chevronRight" size={18} color={theme.textMuted} />
            </View>
          </Card>
        </Pressable>
      ))}
    </>
  );
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function WeeklyPlan() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState((new Date().getDay() + 6) % 7);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const week = useQuery({ queryKey: ['diet-week'], queryFn: () => diet.week() });
  const profile = useQuery({ queryKey: ['profile'], queryFn: () => me.profile() });
  // Medicines taken on an empty stomach open the day, from her profile —
  // not a hard-coded tablet and time.
  const morningMeds = (profile.data?.profile.medications ?? []).filter((m) => m.empty_stomach);

  const createPlan = useMutation({
    mutationFn: (fromTemplate: boolean) => diet.createPlan(fromTemplate),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['diet-week'] }),
  });

  const update = useMutation({
    mutationFn: ({ meal, text }: { meal: string; text: string }) =>
      diet.updateMeal(selected, meal, text),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['diet-week'] });
      setEditing(null);
    },
  });

  const day = week.data?.days.find((d) => d.weekday === selected);
  const times = week.data?.meal_times ?? {};
  const isToday = selected === (new Date().getDay() + 6) % 7;

  // A profile with no plan gets an example and two ways forward, rather than a
  // blank screen it has to guess its way out of.
  if (week.data && !week.data.has_plan) {
    const example = week.data.example_day ?? {};
    return (
      <>
        <Card variant="tinted">
          <Text variant="smallMedium" tone="primary">
            No diet plan yet
          </Text>
          <Text variant="small" tone="secondary" style={{ marginTop: spacing.xs }}>
            A plan is one option per meal per day, built from food you actually eat — so
            mornings need no decisions. Here's what a day looks like:
          </Text>
        </Card>

        <Card padded={false}>
          <View style={styles.panelHeader}>
            <Text variant="caption" tone="muted">
              Example day
            </Text>
          </View>
          {Object.entries(example).map(([meal, text]) => (
            <View key={meal} style={[styles.planMealRow, { borderTopColor: theme.border }]}>
              <Text variant="caption" tone="primary" tabular style={styles.mealTime}>
                {times[meal] ?? ''}
              </Text>
              <Text variant="small" style={{ flex: 1 }}>
                {text}
              </Text>
            </View>
          ))}
        </Card>

        <Button
          label="Add a plan for me"
          onPress={() => createPlan.mutate(true)}
          loading={createPlan.isPending && createPlan.variables === true}
          fullWidth
        />
        <Button
          label="Start from an empty week"
          variant="secondary"
          onPress={() => createPlan.mutate(false)}
          loading={createPlan.isPending && createPlan.variables === false}
          fullWidth
        />
        {createPlan.isError ? (
          <Text variant="small" style={{ color: semantic.danger }}>
            {(createPlan.error as Error).message}
          </Text>
        ) : null}
      </>
    );
  }

  return (
    <>
      <View style={styles.dayRail}>
        {DAY_SHORT.map((label, index) => {
          const active = index === selected;
          const dayData = week.data?.days.find((d) => d.weekday === index);
          return (
            <Pressable
              key={label}
              onPress={() => {
                setSelected(index);
                setEditing(null);
              }}
              style={[
                styles.dayChip,
                {
                  backgroundColor: active ? theme.primary : theme.surface,
                  borderColor: active ? theme.primary : theme.border,
                },
              ]}
            >
              <Text variant="caption" tone={active ? 'inverse' : 'secondary'} style={{ fontSize: 11 }}>
                {label}
              </Text>
              <View
                style={[
                  styles.dayDot,
                  {
                    backgroundColor: dayData?.is_veg
                      ? semantic.success
                      : active
                        ? theme.onPrimary
                        : theme.borderStrong,
                  },
                ]}
              />
            </Pressable>
          );
        })}
      </View>

      {day ? (
        <>
          <View style={styles.planHeader}>
            <View style={styles.planTitleRow}>
              <Text variant="h2">{DAY_NAMES[selected]}</Text>
              <Pressable
                onPress={() => router.push(`/diet-edit?weekday=${selected}`)}
                hitSlop={10}
                style={styles.editLink}
              >
                <Icon name="edit" size={15} color={theme.primary} />
                <Text variant="smallMedium" tone="primary">
                  Edit plan
                </Text>
              </Pressable>
            </View>
            <View style={styles.tagRow}>
              {isToday ? (
                <View style={[styles.tag, { backgroundColor: theme.primarySoft }]}>
                  <Text variant="caption" tone="primary" style={{ fontSize: 9 }}>
                    Today
                  </Text>
                </View>
              ) : null}
              {day.is_veg ? (
                <View style={[styles.tag, { backgroundColor: theme.surfaceSunken }]}>
                  <Text variant="caption" style={{ color: semantic.success, fontSize: 9 }}>
                    Vegetarian
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          <Card padded={false}>
            {morningMeds.map((med, index) => (
              <View
                key={`${med.name}-${index}`}
                style={[styles.planMealRow, index === 0 ? { borderTopWidth: 0 } : { borderTopColor: theme.border }]}
              >
                <Text variant="caption" tone="primary" tabular style={styles.mealTime}>
                  {med.time}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text variant="smallMedium">
                    {med.name}
                    {med.dose ? ` ${med.dose}` : ''} + plain water
                  </Text>
                  {med.food_gap_minutes ? (
                    <Text variant="small" tone="muted" style={{ marginTop: 2 }}>
                      Nothing else for {med.food_gap_minutes} min — no coffee, chai or milk
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}

            {Object.entries(day.meals).map(([meal, text]) => (
              <View key={meal} style={[styles.planMealRow, { borderTopColor: theme.border }]}>
                <Text variant="caption" tone="primary" tabular style={styles.mealTime}>
                  {times[meal] ?? ''}
                </Text>
                <View style={{ flex: 1 }}>
                  {editing === meal ? (
                    <View style={{ gap: spacing.sm }}>
                      <TextInput
                        value={draft}
                        onChangeText={setDraft}
                        multiline
                        autoFocus
                        style={[
                          styles.mealInput,
                          {
                            backgroundColor: theme.surfaceSunken,
                            borderColor: theme.border,
                            color: theme.text,
                          },
                        ]}
                      />
                      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                        <Button
                          label="Cancel"
                          variant="secondary"
                          size="sm"
                          onPress={() => setEditing(null)}
                          style={{ flex: 1 }}
                        />
                        <Button
                          label="Save"
                          size="sm"
                          onPress={() => update.mutate({ meal, text: draft })}
                          loading={update.isPending}
                          style={{ flex: 1 }}
                        />
                      </View>
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => {
                        setEditing(meal);
                        setDraft(text);
                      }}
                    >
                      <Text variant="small">{text}</Text>
                      <Text variant="caption" tone="muted" style={{ marginTop: 3, fontSize: 9 }}>
                        Tap to edit
                      </Text>
                    </Pressable>
                  )}
                </View>
              </View>
            ))}
          </Card>

          {day.note ? (
            <Card variant="tinted">
              <Text variant="smallMedium" tone="primary">
                Prep tonight
              </Text>
              <Text variant="small" tone="secondary" style={{ marginTop: spacing.xs }}>
                {day.note}
              </Text>
            </Card>
          ) : null}
        </>
      ) : null}

      {week.data?.pg_swaps?.length ? (
        <Card padded={false}>
          <View style={styles.panelHeader}>
            <Text variant="caption" tone="muted">
              When you eat PG food
            </Text>
            <Text variant="small" tone="secondary" style={{ marginTop: spacing.xs }}>
              Whatever the canteen serves: add a protein, halve the starch.
            </Text>
          </View>
          {week.data.pg_swaps.map((swap) => (
            <View key={swap.item} style={[styles.swapRow, { borderTopColor: theme.border }]}>
              <View style={{ flex: 1 }}>
                <Text variant="smallMedium">{swap.item}</Text>
                <Text variant="small" tone="muted">
                  {swap.portion}
                </Text>
              </View>
              <View style={[styles.addTag, { backgroundColor: theme.primarySoft }]}>
                <Text variant="caption" tone="primary" style={{ fontSize: 9.5 }}>
                  + {swap.add}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      ) : null}
    </>
  );
}

/**
 * Saved meals.
 *
 * The thing she eats four mornings a week should cost one tap, not four
 * searches. Sorted by how often each is logged, so the list organises itself.
 */
function MyMeals() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [justLogged, setJustLogged] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const meals = useQuery({ queryKey: ['saved-meals'], queryFn: () => savedMeals.list() });

  const logMeal = useMutation({
    mutationFn: (meal: SavedMeal) => savedMeals.log(meal.id),
    onSuccess: (_result, meal) => {
      queryClient.invalidateQueries({ queryKey: ['day'] });
      queryClient.invalidateQueries({ queryKey: ['saved-meals'] });
      setJustLogged(meal.id);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setJustLogged(null), 2200);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => savedMeals.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['saved-meals'] }),
  });

  const confirmDelete = (meal: SavedMeal) =>
    Alert.alert('Delete meal', `Delete "${meal.name}"? Past logs are unaffected.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(meal.id) },
    ]);

  const items = meals.data ?? [];

  return (
    <>
      {items.length === 0 && !meals.isLoading ? (
        <Card variant="tinted">
          <Text variant="smallMedium" tone="primary">
            Save the meals you eat often
          </Text>
          <Text variant="small" tone="secondary" style={{ marginTop: spacing.xs }}>
            Build "Oats with dry fruits — 40 g oats, 20 g almonds, 1 apple" once, then log
            the whole thing with one tap every morning.
          </Text>
          <Button
            label="Create a meal"
            size="sm"
            onPress={() => router.push('/meal-edit?id=new')}
            style={{ marginTop: spacing.md }}
          />
        </Card>
      ) : null}

      {items.map((meal) => (
        <Card key={meal.id} padded={false}>
          <View style={styles.mealCardRow}>
            <Pressable
              style={{ flex: 1 }}
              onPress={() => router.push(`/meal-edit?id=${meal.id}`)}
            >
              <View style={styles.mealTitleRow}>
                <Text variant="bodyMedium" numberOfLines={1}>
                  {meal.name}
                </Text>
                <ConfidenceDot level={meal.confidence} />
              </View>
              <Text variant="small" tone="secondary" tabular style={{ marginTop: 2 }}>
                {Math.round(meal.totals.kcal)} kcal · {Math.round(meal.totals.protein_g)}g
                protein · {meal.items.length} items
              </Text>
              <Text variant="small" tone="muted" numberOfLines={1} style={{ marginTop: 2, fontSize: 11.5 }}>
                {meal.items.map((item) => item.name).join(', ')}
              </Text>
            </Pressable>

            <View style={styles.mealActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Log ${meal.name}`}
                disabled={logMeal.isPending && logMeal.variables?.id === meal.id}
                onPress={() => logMeal.mutate(meal)}
                style={({ pressed }) => [
                  styles.logButton,
                  {
                    backgroundColor:
                      justLogged === meal.id ? semantic.success : theme.primary,
                  },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Icon
                  name={justLogged === meal.id ? 'check' : 'plus'}
                  size={20}
                  color={theme.onPrimary}
                  strokeWidth={2.4}
                />
              </Pressable>
              <Pressable onPress={() => confirmDelete(meal)} hitSlop={8}>
                <Icon name="trash" size={16} color={theme.textMuted} />
              </Pressable>
            </View>
          </View>

          {justLogged === meal.id ? (
            <View style={[styles.loggedBanner, { borderTopColor: theme.border }]}>
              <Text variant="small" style={{ color: semantic.success }}>
                Added to {MEAL_LABELS[meal.default_meal]}
              </Text>
            </View>
          ) : null}
        </Card>
      ))}

      {items.length > 0 ? (
        <Pressable
          onPress={() => router.push('/meal-edit?id=new')}
          style={({ pressed }) => [
            styles.addRow,
            { borderColor: theme.borderStrong },
            pressed && { opacity: 0.6 },
          ]}
        >
          <Icon name="plus" size={17} color={theme.primary} />
          <Text variant="smallMedium" tone="primary">
            New meal
          </Text>
        </Pressable>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: spacing.base, gap: spacing.md },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    height: 50,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
  },
  searchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 16 },
  loading: { paddingVertical: spacing.lg },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.base,
  },
  selectedHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  macroRow: { flexDirection: 'row', marginTop: spacing.lg, gap: spacing.sm },
  macroCell: { flex: 1, alignItems: 'center', gap: 2 },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.sm },
  stepButton: { width: 40, height: 36, alignItems: 'center', justifyContent: 'center' },
  stepValue: { minWidth: 32, textAlign: 'center' },
  mealRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.base },
  mealChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  panelHeader: { padding: spacing.base, paddingBottom: spacing.md },
  voicePrompt: { flexDirection: 'row', alignItems: 'center', gap: spacing.base },
  launchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.base },
  launchIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },

  mealCardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.base },
  mealTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  mealActions: { alignItems: 'center', gap: spacing.sm },
  logButton: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loggedBanner: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.base,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  planTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 1 },
  segments: { flexDirection: 'row', borderRadius: radius.md, padding: 3, gap: 3 },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm + 1,
    borderRadius: radius.md - 3,
  },
  dayRail: { flexDirection: 'row', gap: spacing.xs + 2 },
  dayChip: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  dayDot: { width: 5, height: 5, borderRadius: radius.pill },
  planHeader: { gap: spacing.sm, paddingTop: spacing.xs },
  tagRow: { flexDirection: 'row', gap: spacing.sm },
  tag: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: 5 },
  planMealRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  mealTime: { width: 44, paddingTop: 2 },
  mealInput: {
    minHeight: 64,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    textAlignVertical: 'top',
  },
  swapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  addTag: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm - 4 },
});
