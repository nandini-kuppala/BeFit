import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { food, savedMeals, type SavedMealBody } from '../src/api/befit';
import {
  MEAL_LABELS,
  MEAL_ORDER,
  type FoodSummary,
  type Meal,
} from '../src/api/types';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { ConfidenceDot } from '../src/components/ConfidenceDot';
import { Icon } from '../src/components/Icon';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Text } from '../src/components/Text';
import { radius, semantic, spacing, useTheme } from '../src/theme';

/** Mirrors `nutrition.to_grams` on the server so the preview matches what will
 *  actually be saved. */
const GRAM_UNITS = new Set(['g', 'gram', 'grams', 'ml']);

type Draft = {
  food: FoodSummary;
  quantity: number;
  unit: string;
};

function gramsFor(item: Draft): number {
  const unit = item.unit.trim().toLowerCase();
  if (GRAM_UNITS.has(unit)) return item.quantity;

  const match = item.food.household_units.find((household) =>
    unit ? household.label.toLowerCase().includes(unit) : false,
  );
  if (match) return item.quantity * match.grams;
  return item.quantity * item.food.default_grams;
}

function kcalFor(item: Draft): number {
  return (item.food.per_100g.kcal * gramsFor(item)) / 100;
}

function unitFor(summary: FoodSummary): string {
  const label = summary.household_units[0]?.label ?? '100 g';
  // "2 idli" → "idli"; "100 g" → "g".
  return label.replace(/^[\d.\s]+/, '').trim() || 'serving';
}

function useDebounced(value: string, delay = 280) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function MealEdit() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ id?: string }>();
  const editingId = params.id && params.id !== 'new' ? params.id : null;

  const [name, setName] = useState('');
  const [slot, setSlot] = useState<Meal>('breakfast');
  const [items, setItems] = useState<Draft[]>([]);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query);
  const [hydrated, setHydrated] = useState(false);

  const existing = useQuery({
    queryKey: ['saved-meals'],
    queryFn: () => savedMeals.list(),
    enabled: !!editingId,
  });

  // An existing meal stores frozen nutrients, not FoodSummary rows, so the
  // editor re-resolves each item to get a live food to scale from.
  const current = existing.data?.find((meal) => meal.id === editingId);

  useEffect(() => {
    if (!current || hydrated) return;
    setName(current.name);
    setSlot(current.default_meal);
    setHydrated(true);

    Promise.all(
      current.items.map(async (item) => {
        try {
          const resolved = await food.resolve(item.name);
          return { food: resolved, quantity: item.quantity, unit: item.unit };
        } catch {
          return null;
        }
      }),
    ).then((resolved) => setItems(resolved.filter((entry): entry is Draft => entry !== null)));
  }, [current, hydrated]);

  const search = useQuery({
    queryKey: ['food-search', debouncedQuery],
    queryFn: () => food.search(debouncedQuery),
    enabled: debouncedQuery.trim().length >= 2,
  });

  const save = useMutation({
    mutationFn: () => {
      const body: SavedMealBody = {
        name: name.trim(),
        default_meal: slot,
        items: items.map((item) => ({
          food_id: item.food.id,
          name: item.food.name,
          quantity: item.quantity,
          unit: item.unit,
        })),
      };
      return editingId ? savedMeals.update(editingId, body) : savedMeals.create(body);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['saved-meals'] });
      router.back();
    },
  });

  const add = (summary: FoodSummary) => {
    setItems((current) => [...current, { food: summary, quantity: 1, unit: unitFor(summary) }]);
    setQuery('');
  };

  const setQuantity = (index: number, next: number) =>
    setItems((current) =>
      current.map((item, position) =>
        position === index ? { ...item, quantity: Math.max(0.5, next) } : item,
      ),
    );

  const totalKcal = items.reduce((sum, item) => sum + kcalFor(item), 0);
  const totalProtein = items.reduce(
    (sum, item) => sum + (item.food.per_100g.protein_g * gramsFor(item)) / 100,
    0,
  );

  const results = search.data?.results ?? [];
  const searching = debouncedQuery.trim().length >= 2;
  const settled = searching && !search.isFetching;
  const needsLookup = settled && !(search.data?.has_exact_match ?? false);

  // Same escape hatches as the Log tab: a saved meal built from a near-miss
  // food is wrong every single time it is logged, not just once.
  const lookup = useMutation({
    mutationFn: () => food.resolve(query.trim()),
    onSuccess: (summary) => add(summary),
  });

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas }}>
      <ScreenHeader
        title={editingId ? 'Edit meal' : 'New meal'}
        subtitle={items.length ? `${items.length} items · ${Math.round(totalKcal)} kcal` : undefined}
        action={
          <Button
            label="Save"
            size="sm"
            onPress={() => save.mutate()}
            loading={save.isPending}
            disabled={!name.trim() || items.length === 0}
          />
        }
      />

      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Card>
          <Text variant="caption" tone="muted">
            Meal name
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Oats with dry fruits"
            placeholderTextColor={theme.textMuted}
            style={[
              styles.input,
              { backgroundColor: theme.surfaceSunken, borderColor: theme.border, color: theme.text },
            ]}
          />

          <Text variant="caption" tone="muted" style={{ marginTop: spacing.md }}>
            Usually eaten at
          </Text>
          <View style={styles.chips}>
            {MEAL_ORDER.map((option) => {
              const active = slot === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => setSlot(option)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? theme.primary : theme.surfaceSunken,
                      borderColor: active ? theme.primary : theme.border,
                    },
                  ]}
                >
                  <Text variant="caption" tone={active ? 'inverse' : 'secondary'}>
                    {MEAL_LABELS[option]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        {items.length > 0 ? (
          <Card padded={false}>
            <View style={styles.blockHeader}>
              <Text variant="caption" tone="muted">
                What's in it
              </Text>
              <Text variant="smallMedium" tabular>
                {Math.round(totalKcal)} kcal · {Math.round(totalProtein)}g protein
              </Text>
            </View>

            {items.map((item, index) => (
              <View key={`${item.food.id}-${index}`} style={[styles.itemRow, { borderTopColor: theme.border }]}>
                <ConfidenceDot level={item.food.confidence} />

                <View style={{ flex: 1 }}>
                  <Text variant="smallMedium" numberOfLines={1}>
                    {item.food.name}
                  </Text>
                  <Text variant="small" tone="muted" tabular style={{ fontSize: 11.5 }}>
                    {Math.round(gramsFor(item))} g · {Math.round(kcalFor(item))} kcal
                  </Text>
                </View>

                <View style={[styles.stepper, { borderColor: theme.border }]}>
                  <Pressable
                    onPress={() => setQuantity(index, item.quantity - 0.5)}
                    style={styles.stepButton}
                    hitSlop={4}
                  >
                    <Text variant="bodyMedium" tone="secondary">
                      −
                    </Text>
                  </Pressable>
                  <Text variant="small" tabular style={styles.stepValue}>
                    {item.quantity % 1 === 0 ? item.quantity : item.quantity.toFixed(1)}
                  </Text>
                  <Pressable
                    onPress={() => setQuantity(index, item.quantity + 0.5)}
                    style={styles.stepButton}
                    hitSlop={4}
                  >
                    <Text variant="bodyMedium" tone="secondary">
                      +
                    </Text>
                  </Pressable>
                </View>

                <Pressable
                  onPress={() => setItems((c) => c.filter((_, p) => p !== index))}
                  hitSlop={10}
                >
                  <Icon name="trash" size={16} color={theme.textMuted} />
                </Pressable>
              </View>
            ))}
          </Card>
        ) : null}

        <View style={[styles.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Icon name="search" size={18} color={theme.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Add a food — oats, almond, egg…"
            placeholderTextColor={theme.textMuted}
            style={[styles.searchInput, { color: theme.text }]}
            autoCapitalize="none"
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10}>
              <Icon name="close" size={17} color={theme.textMuted} />
            </Pressable>
          ) : null}
        </View>

        {searching ? (
          <View style={{ gap: spacing.sm }}>
            {search.isFetching ? <ActivityIndicator color={theme.primary} /> : null}
            {results.map((summary) => (
              <Pressable key={summary.id} onPress={() => add(summary)}>
                <Card padded={false} variant="flat">
                  <View style={styles.resultRow}>
                    <ConfidenceDot level={summary.confidence} />
                    <View style={{ flex: 1 }}>
                      <Text variant="smallMedium" numberOfLines={1}>
                        {summary.name}
                      </Text>
                      <Text variant="small" tone="muted" tabular style={{ fontSize: 11.5 }}>
                        {Math.round(summary.per_100g.kcal)} kcal / 100 g ·{' '}
                        {summary.household_units[0]?.label ?? '100 g'}
                      </Text>
                    </View>
                    <Icon name="plus" size={18} color={theme.primary} strokeWidth={2.2} />
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
                  Search nutrition databases and the web for it, or enter the numbers
                  from the packet yourself.
                </Text>
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                  <Button
                    label="Look it up"
                    size="sm"
                    onPress={() => lookup.mutate()}
                    loading={lookup.isPending}
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
                {lookup.isError ? (
                  <Text variant="small" style={{ color: semantic.danger, marginTop: spacing.sm }}>
                    {(lookup.error as Error).message}
                  </Text>
                ) : null}
              </Card>
            ) : null}
          </View>
        ) : null}

        {items.length === 0 && !searching ? (
          <Card variant="tinted">
            <Text variant="smallMedium" tone="primary">
              Build it once
            </Text>
            <Text variant="small" tone="secondary" style={{ marginTop: spacing.xs }}>
              Add each thing you eat in this meal with its portion. After that, logging the
              whole meal is a single tap on the Food tab.
            </Text>
          </Card>
        ) : null}

        {save.isError ? (
          <Text variant="small" style={{ color: semantic.danger }}>
            {(save.error as Error).message}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: spacing.base, gap: spacing.md, paddingBottom: spacing['4xl'] * 2 },
  input: {
    height: 46,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 1,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  blockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.base,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.sm },
  stepButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  stepValue: { minWidth: 24, textAlign: 'center' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    height: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
  },
  searchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 15 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
});
