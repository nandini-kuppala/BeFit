import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { diet, food, logs, savedMeals } from '../../src/api/befit';
import {
  MEAL_LABELS,
  MEAL_ORDER,
  type FoodSummary,
  type Meal,
  type SavedMeal,
} from '../../src/api/types';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { ConfidenceDot } from '../../src/components/ConfidenceDot';
import { Icon } from '../../src/components/Icon';
import { Text } from '../../src/components/Text';
import { radius, semantic, spacing, useTheme } from '../../src/theme';

/** Keeps a search request off every keystroke. */
function useDebounced(value: string, delay = 280) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

export default function FoodTab() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<'log' | 'meals' | 'plan'>('log');
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query);
  const [selected, setSelected] = useState<FoodSummary | null>(null);
  const [meal, setMeal] = useState<Meal>('lunch');
  const [quantity, setQuantity] = useState(1);

  const search = useQuery({
    queryKey: ['food-search', debouncedQuery],
    queryFn: () => food.search(debouncedQuery),
    enabled: debouncedQuery.trim().length >= 2,
  });

  const resolve = useMutation({
    mutationFn: () => food.resolve(query.trim()),
    onSuccess: (result) => setSelected(result),
  });

  const log = useMutation({
    mutationFn: () =>
      logs.logFood(meal, [
        {
          food_id: selected!.id,
          name: selected!.name,
          quantity,
          unit: selected!.household_units[0]?.label.replace(/^[\d.]+\s*/, '') || 'serving',
        },
      ]),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['day'] });
      setSelected(null);
      setQuery('');
      setQuantity(1);
    },
  });

  const results = search.data?.results ?? [];
  const searching = query.trim().length >= 2;
  const settled = searching && !search.isFetching && debouncedQuery === query.trim();
  // Offer the escape hatches whenever nothing matched closely, not only when
  // the list is empty — a near miss is still a wrong answer.
  const needsLookup = settled && !(search.data?.has_exact_match ?? false);

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

      {tab === 'log' ? (
        <>
      <View
        style={[
          styles.searchBox,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <Icon name="search" size={19} color={theme.textMuted} />
        <TextInput
          value={query}
          onChangeText={(value) => {
            setQuery(value);
            setSelected(null);
          }}
          placeholder="Search idli, chicken, oats…"
          placeholderTextColor={theme.textMuted}
          style={[styles.searchInput, { color: theme.text }]}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery('')} hitSlop={10}>
            <Icon name="close" size={18} color={theme.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {selected ? (
        <Card>
          <View style={styles.selectedHeader}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text variant="h2">{selected.name}</Text>
              <ConfidenceDot level={selected.confidence} showLabel />
            </View>
            <Pressable onPress={() => setSelected(null)} hitSlop={10}>
              <Icon name="close" size={20} color={theme.textMuted} />
            </Pressable>
          </View>

          <View style={styles.macroRow}>
            {[
              { label: 'kcal', value: Math.round(selected.per_100g.kcal * (selected.default_grams / 100) * quantity) },
              { label: 'protein', value: `${(selected.per_100g.protein_g * (selected.default_grams / 100) * quantity).toFixed(1)}g` },
              { label: 'carbs', value: `${(selected.per_100g.carbs_g * (selected.default_grams / 100) * quantity).toFixed(1)}g` },
              { label: 'fat', value: `${(selected.per_100g.fat_g * (selected.default_grams / 100) * quantity).toFixed(1)}g` },
            ].map((stat) => (
              <View key={stat.label} style={styles.macroCell}>
                <Text variant="h3" tabular>
                  {stat.value}
                </Text>
                <Text variant="small" tone="muted">
                  {stat.label}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.quantityRow}>
            <View style={[styles.stepper, { borderColor: theme.border }]}>
              <Pressable
                onPress={() => setQuantity((q) => Math.max(0.5, q - 0.5))}
                style={styles.stepButton}
              >
                <Text variant="h3" tone="secondary">−</Text>
              </Pressable>
              <Text variant="bodyMedium" tabular style={styles.stepValue}>
                {quantity % 1 === 0 ? quantity : quantity.toFixed(1)}
              </Text>
              <Pressable onPress={() => setQuantity((q) => q + 0.5)} style={styles.stepButton}>
                <Text variant="h3" tone="secondary">+</Text>
              </Pressable>
            </View>
            <Text variant="small" tone="secondary">
              × {selected.household_units[0]?.label ?? '100 g'}
            </Text>
          </View>

          <View style={styles.mealRow}>
            {MEAL_ORDER.map((option) => (
              <Pressable
                key={option}
                onPress={() => setMeal(option)}
                style={[
                  styles.mealChip,
                  {
                    backgroundColor: meal === option ? theme.primary : theme.surfaceSunken,
                    borderColor: meal === option ? theme.primary : theme.border,
                  },
                ]}
              >
                <Text variant="caption" tone={meal === option ? 'inverse' : 'secondary'}>
                  {MEAL_LABELS[option]}
                </Text>
              </Pressable>
            ))}
          </View>

          <Button
            label="Add to log"
            onPress={() => log.mutate()}
            loading={log.isPending}
            fullWidth
            style={{ marginTop: spacing.base }}
          />
        </Card>
      ) : null}

      {searching && !selected ? (
        <View style={{ gap: spacing.sm }}>
          {search.isFetching ? (
            <View style={styles.loading}>
              <ActivityIndicator color={theme.primary} />
            </View>
          ) : null}

          {results.map((item) => (
            <Pressable key={item.id} onPress={() => setSelected(item)}>
              <Card padded={false} variant="flat">
                <View style={styles.resultRow}>
                  <ConfidenceDot level={item.confidence} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyMedium" numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text variant="small" tone="muted" tabular>
                      {Math.round(item.per_100g.kcal)} kcal / 100 g ·{' '}
                      {item.household_units[0]?.label ?? '100 g'}
                    </Text>
                  </View>
                  <Icon name="chevronRight" size={18} color={theme.textMuted} />
                </View>
              </Card>
            </Pressable>
          ))}

          {needsLookup ? (
            <Card variant="tinted">
              <Text variant="smallMedium">
                {results.length === 0
                  ? `No match for "${query.trim()}"`
                  : `Not quite "${query.trim()}"?`}
              </Text>
              <Text variant="small" tone="secondary" style={{ marginTop: 4 }}>
                {results.length === 0
                  ? 'BeFit can search nutrition databases and the web for it, then remember it for next time.'
                  : 'Those are the closest names in your database. If none is right, search for the real thing or enter it yourself.'}
              </Text>

              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                <Button
                  label="Look it up"
                  size="sm"
                  onPress={() => resolve.mutate()}
                  loading={resolve.isPending}
                  style={{ flex: 1 }}
                />
                <Button
                  label="Enter it myself"
                  variant="secondary"
                  size="sm"
                  onPress={() =>
                    router.push(`/food-new?name=${encodeURIComponent(query.trim())}`)
                  }
                  style={{ flex: 1 }}
                />
              </View>

              {resolve.isPending ? (
                <Text variant="small" tone="muted" style={{ marginTop: spacing.sm }}>
                  Checking USDA, then the web — this takes a few seconds.
                </Text>
              ) : null}
              {resolve.isError ? (
                <Text variant="small" style={{ color: semantic.danger, marginTop: spacing.sm }}>
                  {(resolve.error as Error).message}
                </Text>
              ) : null}
            </Card>
          ) : null}
        </View>
      ) : null}

      {!searching ? (
        <Pressable onPress={() => router.push('/log')}>
          <Card variant="tinted" style={styles.voicePrompt}>
            <Icon name="mic" size={22} color={theme.primary} />
            <View style={{ flex: 1 }}>
              <Text variant="smallMedium" tone="primary">
                Log by voice instead
              </Text>
              <Text variant="small" tone="secondary">
                Say a whole meal at once — faster than searching item by item.
              </Text>
            </View>
          </Card>
        </Pressable>
      ) : null}
        </>
      ) : null}
    </ScrollView>
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
            <View style={[styles.planMealRow, { borderTopWidth: 0 }]}>
              <Text variant="caption" tone="primary" tabular style={styles.mealTime}>
                06:30
              </Text>
              <View style={{ flex: 1 }}>
                <Text variant="smallMedium">Levothyroxine + plain water</Text>
                <Text variant="small" tone="muted" style={{ marginTop: 2 }}>
                  Nothing until 07:30 — no coffee, chai, milk or B-Protein
                </Text>
              </View>
            </View>

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

  const meals = useQuery({ queryKey: ['saved-meals'], queryFn: () => savedMeals.list() });

  const logMeal = useMutation({
    mutationFn: (meal: SavedMeal) => savedMeals.log(meal.id),
    onSuccess: async (result, meal) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['day'] }),
        queryClient.invalidateQueries({ queryKey: ['saved-meals'] }),
      ]);
      setJustLogged(meal.id);
      setTimeout(() => setJustLogged(null), 2200);
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
                disabled={logMeal.isPending}
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
