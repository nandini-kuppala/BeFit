import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { food } from '../src/api/befit';
import type { FoodSummary } from '../src/api/types';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { ConfidenceDot } from '../src/components/ConfidenceDot';
import { Icon } from '../src/components/Icon';
import { KeyboardScreen } from '../src/components/KeyboardScreen';
import { PortionPicker } from '../src/components/PortionPicker';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Text } from '../src/components/Text';
import { defaultQuantity, describePortion, findPortion, gramsFor } from '../src/lib/portions';
import { useUnsavedChangesGuard } from '../src/lib/useUnsavedChangesGuard';
import { radius, semantic, spacing, useTheme } from '../src/theme';

const NUMERIC = /[^\d.]/g;
const MAX_INGREDIENTS = 40;
const RESULTS_SHOWN = 6;

type Ingredient = {
  /** Local key — the same food can go in twice (oil to temper, oil to finish). */
  uid: number;
  food: FoodSummary;
  portionKey: string;
  quantity: number;
};

function useDebounced(value: string, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function num(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function gramsOf(item: Ingredient): number {
  return gramsFor(findPortion(item.food.portions, item.portionKey), item.quantity);
}

/**
 * Build a home recipe from what went into the pot.
 *
 * Every ingredient comes from search so its nutrition is known; amounts use
 * the same portion picker as logging. The cooked weight is what turns a pot
 * of dal into a per-katori number — water boiled off or soaked in changes the
 * density, and only the scale knows by how much.
 */
export default function RecipeEdit() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ meal?: string; date?: string }>();
  const passthrough = `${params.meal ? `&meal=${params.meal}` : ''}${params.date ? `&date=${params.date}` : ''}`;

  const [name, setName] = useState('');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [openUid, setOpenUid] = useState<number | null>(null);
  const [nextUid, setNextUid] = useState(1);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query.trim());
  const [cookedWeight, setCookedWeight] = useState('');
  const [servings, setServings] = useState('1');
  const [servingLabel, setServingLabel] = useState('');

  const search = useQuery({
    queryKey: ['food-search', debouncedQuery],
    queryFn: ({ signal }) => food.search(debouncedQuery, signal),
    enabled: debouncedQuery.length >= 2,
    placeholderData: keepPreviousData,
  });

  const rawWeight = ingredients.reduce((sum, item) => sum + gramsOf(item), 0);
  const totalKcal = ingredients.reduce(
    (sum, item) => sum + (item.food.per_100g.kcal * gramsOf(item)) / 100,
    0,
  );
  const totalProtein = ingredients.reduce(
    (sum, item) => sum + (item.food.per_100g.protein_g * gramsOf(item)) / 100,
    0,
  );
  const servingCount = num(servings);
  const cooked = num(cookedWeight);
  const yieldGrams = cooked > 0 ? cooked : rawWeight;
  const perServingKcal = servingCount > 0 ? totalKcal / servingCount : 0;
  const perServingGrams = servingCount > 0 ? yieldGrams / servingCount : 0;

  const canSave =
    name.trim().length > 0 &&
    ingredients.length > 0 &&
    ingredients.every((item) => gramsOf(item) > 0) &&
    servingCount > 0 &&
    servingCount <= 100;
  const dirty = name.trim().length > 0 || ingredients.length > 0;

  const save = useMutation({
    mutationFn: () =>
      food.createRecipe({
        name: name.trim(),
        ingredients: ingredients.map((item) => ({
          food_id: item.food.id,
          name: item.food.name,
          grams: Math.round(gramsOf(item) * 10) / 10,
        })),
        cooked_weight_g: cooked > 0 ? cooked : null,
        servings: servingCount,
        serving_label: servingLabel.trim() || '1 serving',
      }),
    onSuccess: async (created) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['food-search'] }),
        queryClient.invalidateQueries({ queryKey: ['food-recent'] }),
      ]);
      router.dismissTo(`/food-add?foodId=${created.id}${passthrough}`);
    },
  });

  useUnsavedChangesGuard(dirty && !save.isPending && !save.isSuccess);

  const add = (summary: FoodSummary) => {
    if (ingredients.length >= MAX_INGREDIENTS) return;
    const portion = summary.portions[0];
    const uid = nextUid;
    setNextUid(uid + 1);
    setIngredients((items) => [
      ...items,
      {
        uid,
        food: summary,
        portionKey: portion?.key ?? 'g',
        quantity: defaultQuantity(portion),
      },
    ]);
    setOpenUid(uid);
    setQuery('');
  };

  const update = (uid: number, next: { quantity: number; portionKey: string }) =>
    setIngredients((items) => items.map((item) => (item.uid === uid ? { ...item, ...next } : item)));

  const remove = (uid: number) => {
    setIngredients((items) => items.filter((item) => item.uid !== uid));
    if (openUid === uid) setOpenUid(null);
  };

  const inputStyle = [
    styles.input,
    { backgroundColor: theme.surfaceSunken, borderColor: theme.border, color: theme.text },
  ];

  const results = (search.data?.results ?? []).slice(0, RESULTS_SHOWN);
  const showResults = query.trim().length >= 2;

  return (
    <KeyboardScreen
      header={<ScreenHeader title="New recipe" subtitle="Home cooking, weighed once" />}
      contentContainerStyle={styles.page}
      footer={
        <View style={[styles.footer, { borderTopColor: theme.border }]}>
          <View style={{ flex: 1 }}>
            <Text variant="bodyMedium" tabular>
              {Math.round(totalKcal)} kcal · {Math.round(totalProtein)} g protein
            </Text>
            <Text variant="small" tone="muted" tabular numberOfLines={1}>
              {servingCount > 0 && ingredients.length > 0
                ? `${Math.round(perServingKcal)} kcal per ${servingLabel.trim().replace(/^1\s+/, '') || 'serving'} · ≈${Math.round(perServingGrams)} g`
                : 'Add ingredients to see totals'}
            </Text>
          </View>
          <Button
            label="Save"
            onPress={() => save.mutate()}
            loading={save.isPending}
            disabled={!canSave}
          />
        </View>
      }
    >
      <Card>
        <Field label="Recipe name">
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Moong dal"
            placeholderTextColor={theme.textMuted}
            maxLength={120}
            style={inputStyle}
            autoFocus
          />
        </Field>
      </Card>

      <Card>
        <Text variant="caption" tone="muted">
          Ingredients{ingredients.length ? ` · ${ingredients.length}` : ''}
        </Text>

        {ingredients.length === 0 ? (
          <Text variant="small" tone="secondary" style={{ marginTop: spacing.xs }}>
            Search for each thing that went in, raw — dal, rice, oil, onion — and set how much.
          </Text>
        ) : null}

        <View style={{ marginTop: spacing.sm }}>
          {ingredients.map((item, index) => {
            const open = openUid === item.uid;
            const grams = gramsOf(item);
            const portion = findPortion(item.food.portions, item.portionKey);
            return (
              <View
                key={item.uid}
                style={[
                  styles.ingredient,
                  index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
                ]}
              >
                <View style={styles.ingredientRow}>
                  <Pressable
                    onPress={() => setOpenUid(open ? null : item.uid)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: open }}
                    accessibilityHint="Change the amount"
                    style={{ flex: 1, gap: 2 }}
                  >
                    <View style={styles.nameRow}>
                      <ConfidenceDot level={item.food.confidence} />
                      <Text variant="bodyMedium" numberOfLines={1} style={{ flex: 1 }}>
                        {item.food.name}
                      </Text>
                    </View>
                    <Text variant="small" tone="muted" tabular>
                      {describePortion(item.quantity, portion)}
                      {portion && portion.key !== 'g' ? ` · ${Math.round(grams)} g` : ''} ·{' '}
                      <Text variant="smallMedium" tone="secondary">
                        {Math.round((item.food.per_100g.kcal * grams) / 100)} kcal
                      </Text>
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => remove(item.uid)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${item.food.name}`}
                    hitSlop={8}
                    style={styles.iconButton}
                  >
                    <Icon name="trash" size={18} color={theme.textMuted} />
                  </Pressable>
                </View>
                {open && item.food.portions.length > 0 ? (
                  <View style={{ marginTop: spacing.md }}>
                    <PortionPicker
                      compact
                      portions={item.food.portions}
                      portionKey={item.portionKey}
                      quantity={item.quantity}
                      onChange={(next) => update(item.uid, next)}
                    />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        {ingredients.length < MAX_INGREDIENTS ? (
          <View style={{ marginTop: spacing.md }}>
            <View
              style={[
                styles.searchBox,
                { backgroundColor: theme.surfaceSunken, borderColor: theme.border },
              ]}
            >
              <Icon name="search" size={18} color={theme.textMuted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Add an ingredient"
                placeholderTextColor={theme.textMuted}
                autoCorrect={false}
                returnKeyType="search"
                style={[styles.searchInput, { color: theme.text }]}
                accessibilityLabel="Search ingredients"
              />
              {search.isFetching && showResults ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : null}
            </View>

            {showResults ? (
              <View style={[styles.results, { borderColor: theme.border }]}>
                {results.map((result, index) => (
                  <Pressable
                    key={result.id}
                    onPress={() => add(result)}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${result.name}`}
                    style={({ pressed }) => [
                      styles.result,
                      index > 0 && {
                        borderTopWidth: StyleSheet.hairlineWidth,
                        borderTopColor: theme.border,
                      },
                      pressed && { backgroundColor: theme.surfaceSunken },
                    ]}
                  >
                    <ConfidenceDot level={result.confidence} />
                    <View style={{ flex: 1 }}>
                      <Text variant="body" numberOfLines={1}>
                        {result.name}
                      </Text>
                      <Text variant="small" tone="muted" numberOfLines={1}>
                        {Math.round(result.per_100g.kcal)} kcal / 100 g
                        {result.brand ? ` · ${result.brand}` : ''}
                      </Text>
                    </View>
                    <Icon name="plus" size={18} color={theme.primaryInk} />
                  </Pressable>
                ))}
                {results.length === 0 && !search.isFetching && search.data ? (
                  <Text variant="small" tone="muted" style={styles.result}>
                    Nothing matched "{query.trim()}". Try a simpler name, or add it as a food first.
                  </Text>
                ) : null}
                {search.isError ? (
                  <Text variant="small" style={[styles.result, { color: semantic.danger }]}>
                    {(search.error as Error).message}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}
      </Card>

      <Card>
        <Text variant="caption" tone="muted">
          Yield
        </Text>
        <Field label="Cooked total weight (g) — optional">
          <TextInput
            value={cookedWeight}
            onChangeText={(v) => setCookedWeight(v.replace(NUMERIC, ''))}
            placeholder={rawWeight > 0 ? `Raw total ${Math.round(rawWeight)} g` : '850'}
            placeholderTextColor={theme.textMuted}
            keyboardType="decimal-pad"
            style={inputStyle}
          />
          <Text variant="small" tone="muted">
            Weigh the pot after cooking minus the pot — needed for anything simmered or fried;
            leave empty for salads/smoothies.
          </Text>
        </Field>
        <View style={styles.row}>
          <Field label="Servings" style={{ flex: 1 }}>
            <TextInput
              value={servings}
              onChangeText={(v) => setServings(v.replace(NUMERIC, ''))}
              placeholder="4"
              placeholderTextColor={theme.textMuted}
              keyboardType="decimal-pad"
              selectTextOnFocus
              style={inputStyle}
            />
          </Field>
          <Field label="One serving is" style={{ flex: 1.6 }}>
            <TextInput
              value={servingLabel}
              onChangeText={setServingLabel}
              placeholder="1 katori"
              placeholderTextColor={theme.textMuted}
              maxLength={40}
              style={inputStyle}
            />
          </Field>
        </View>
        {servingCount > 100 ? (
          <Text variant="small" style={{ color: semantic.danger, marginTop: spacing.sm }}>
            At most 100 servings.
          </Text>
        ) : null}
      </Card>

      {save.isError ? (
        <Text variant="small" style={{ color: semantic.danger }}>
          {(save.error as Error).message}
        </Text>
      ) : null}
    </KeyboardScreen>
  );
}

function Field({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: object;
}) {
  return (
    <View style={[{ gap: spacing.xs + 2, marginTop: spacing.md }, style]}>
      <Text variant="small" tone="muted">
        {label}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: spacing.base, gap: spacing.md, paddingBottom: spacing['3xl'] },
  input: {
    height: 46,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
  },
  row: { flexDirection: 'row', gap: spacing.md },
  ingredient: { paddingVertical: spacing.md },
  ingredientRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 46,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 15, paddingVertical: 0 },
  results: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
