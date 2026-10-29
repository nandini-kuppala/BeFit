import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { food as foodApi } from '../api/befit';
import {
  MEAL_LABELS,
  MEAL_ORDER,
  type DraftItem,
  type FoodSummary,
  type Meal,
  type Nutrients,
  type Portion,
} from '../api/types';
import { defaultQuantity, findPortion, gramsFor, scale } from '../lib/portions';
import { radius, semantic, spacing, useTheme } from '../theme';
import { Card } from './Card';
import { ConfidenceDot } from './ConfidenceDot';
import { Icon } from './Icon';
import { PortionPicker } from './PortionPicker';
import { Text } from './Text';

/** A draft with its per-100 g values kept, so amounts can change locally. */
export type DraftRow = {
  key: string;
  foodId: string | null;
  name: string;
  heardAs: string;
  resolved: boolean;
  unitMatched: boolean;
  confidence: DraftItem['confidence'];
  portions: Portion[];
  portionKey: string;
  quantity: number;
  per100g: Nutrients | null;
};

let counter = 0;
const nextKey = () => `row-${counter++}`;

export function rowsFromDrafts(items: DraftItem[]): DraftRow[] {
  return items.map((item) => ({
    key: nextKey(),
    foodId: item.food_id,
    name: item.name,
    heardAs: item.heard_as,
    resolved: item.resolved,
    unitMatched: item.unit_matched,
    confidence: item.confidence,
    portions: item.portions,
    portionKey: item.portion_key ?? item.portions[0]?.key ?? 'g',
    quantity: item.quantity,
    // scale() multiplies by grams/100, so 10000/grams turns "this many grams"
    // back into per-100 g.
    per100g: item.resolved && item.grams > 0 ? scale(item.nutrients, 10000 / item.grams) : null,
  }));
}

function rowFromFood(food: FoodSummary, heardAs: string): DraftRow {
  const portion = food.portions[0];
  return {
    key: nextKey(),
    foodId: food.id,
    name: food.name,
    heardAs,
    resolved: true,
    unitMatched: true,
    confidence: food.confidence,
    portions: food.portions,
    portionKey: portion?.key ?? 'g',
    quantity: defaultQuantity(portion),
    per100g: food.per_100g,
  };
}

export function rowNutrients(row: DraftRow): Nutrients | null {
  if (!row.per100g) return null;
  return scale(row.per100g, gramsFor(findPortion(row.portions, row.portionKey), row.quantity));
}

type DraftReviewProps = {
  rows: DraftRow[];
  onChange: (rows: DraftRow[]) => void;
  meal: Meal;
  onMealChange: (meal: Meal) => void;
};

/**
 * The review step for voice and photo logging.
 *
 * Nothing recognised is trusted until she has seen it: each item shows what
 * was heard or seen next to what it was matched to, with the unit picker
 * right there. Anything that couldn't be matched is flagged and left out of
 * the log until she picks the right food — logging it at 0 kcal (as before)
 * quietly under-counted the day.
 */
export function DraftReview({ rows, onChange, meal, onMealChange }: DraftReviewProps) {
  const theme = useTheme();
  const [picking, setPicking] = useState<{ replace?: string; query: string } | null>(null);

  const update = (key: string, patch: Partial<DraftRow>) =>
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const totals = rows.reduce(
    (sum, row) => {
      const n = rowNutrients(row);
      return n ? { kcal: sum.kcal + n.kcal, protein: sum.protein + n.protein_g } : sum;
    },
    { kcal: 0, protein: 0 },
  );

  return (
    <View style={{ gap: spacing.base }}>
      <View style={styles.mealRow}>
        {MEAL_ORDER.map((option) => (
          <Pressable
            key={option}
            onPress={() => onMealChange(option)}
            style={[
              styles.mealChip,
              {
                backgroundColor: meal === option ? theme.primary : theme.surface,
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

      {rows.map((row) => {
        const n = rowNutrients(row);
        const portion = findPortion(row.portions, row.portionKey);
        const heardDiffers =
          row.heardAs && row.heardAs.trim().toLowerCase() !== row.name.trim().toLowerCase();
        return (
          <Card
            key={row.key}
            style={!row.resolved ? { borderColor: semantic.warning, borderWidth: 1 } : undefined}
          >
            <View style={styles.itemHeader}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text variant="h3" numberOfLines={2}>
                  {row.resolved ? row.name : `"${row.heardAs || row.name}"`}
                </Text>
                {row.resolved ? (
                  <View style={styles.rowCenter}>
                    <ConfidenceDot level={row.confidence} showLabel />
                    {heardDiffers ? (
                      <Text variant="small" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
                        · heard "{row.heardAs}"
                      </Text>
                    ) : null}
                  </View>
                ) : (
                  <Text variant="small" style={{ color: semantic.warning }}>
                    Couldn't match this to a food — pick it, or it won't be logged.
                  </Text>
                )}
              </View>
              <Pressable
                onPress={() => onChange(rows.filter((r) => r.key !== row.key))}
                hitSlop={10}
                accessibilityLabel="Remove"
              >
                <Icon name="trash" size={19} color={theme.textMuted} />
              </Pressable>
            </View>

            {row.resolved && row.portions.length ? (
              <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                {!row.unitMatched ? (
                  <Text variant="small" style={{ color: semantic.warning }}>
                    Check the amount — the unit you said didn't fit, so it's set to{' '}
                    {portion?.label.replace(/^1\s+/, '')}.
                  </Text>
                ) : null}
                <PortionPicker
                  compact
                  portions={row.portions}
                  portionKey={row.portionKey}
                  quantity={row.quantity}
                  onChange={(next) =>
                    update(row.key, { quantity: next.quantity, portionKey: next.portionKey, unitMatched: true })
                  }
                />
              </View>
            ) : null}

            <View style={styles.itemFooter}>
              <Pressable
                onPress={() => setPicking({ replace: row.key, query: row.heardAs || row.name })}
                hitSlop={8}
                style={styles.rowCenter}
              >
                <Icon name="search" size={15} color={theme.primary} />
                <Text variant="smallMedium" tone="primary">
                  {row.resolved ? 'Not this? Swap' : 'Pick the food'}
                </Text>
              </Pressable>
              <View style={{ flex: 1 }} />
              {n ? (
                <Text variant="h3" tabular>
                  {Math.round(n.kcal)}
                  <Text variant="small" tone="muted">
                    {' '}
                    kcal
                  </Text>
                </Text>
              ) : null}
            </View>
          </Card>
        );
      })}

      <Pressable
        onPress={() => setPicking({ query: '' })}
        style={({ pressed }) => [styles.addRow, { borderColor: theme.borderStrong }, pressed && { opacity: 0.6 }]}
      >
        <Icon name="plus" size={17} color={theme.primary} />
        <Text variant="smallMedium" tone="primary">
          Add something that was missed
        </Text>
      </Pressable>

      <Card variant="tinted">
        <View style={styles.totals}>
          <View>
            <Text variant="h2" tabular>
              {Math.round(totals.kcal)}
            </Text>
            <Text variant="small" tone="secondary">
              total kcal
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text variant="h2" tabular>
              {Math.round(totals.protein)} g
            </Text>
            <Text variant="small" tone="secondary">
              protein
            </Text>
          </View>
        </View>
      </Card>

      <FoodPicker
        visible={!!picking}
        initialQuery={picking?.query ?? ''}
        onClose={() => setPicking(null)}
        onPick={(food) => {
          if (!picking) return;
          if (picking.replace) {
            const old = rows.find((r) => r.key === picking.replace);
            const fresh = rowFromFood(food, old?.heardAs ?? '');
            // Keep the amount she said if the new food has the same unit.
            if (old && food.portions.some((p) => p.key === old.portionKey)) {
              fresh.portionKey = old.portionKey;
              fresh.quantity = old.quantity;
            }
            onChange(rows.map((r) => (r.key === picking.replace ? { ...fresh, key: r.key } : r)));
          } else {
            onChange([...rows, rowFromFood(food, '')]);
          }
          setPicking(null);
        }}
      />
    </View>
  );
}

function FoodPicker({
  visible,
  initialQuery,
  onClose,
  onPick,
}: {
  visible: boolean;
  initialQuery: string;
  onClose: () => void;
  onPick: (food: FoodSummary) => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery);

  useEffect(() => {
    if (visible) {
      setQuery(initialQuery);
      setDebounced(initialQuery);
    }
  }, [visible, initialQuery]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 220);
    return () => clearTimeout(timer);
  }, [query]);

  const search = useQuery({
    queryKey: ['food-search', debounced],
    queryFn: ({ signal }) => foodApi.search(debounced, signal),
    enabled: visible && debounced.length >= 2,
    placeholderData: keepPreviousData,
  });

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior="padding" style={styles.sheetWrap} pointerEvents="box-none">
        <View style={[styles.sheet, { backgroundColor: theme.canvas, paddingBottom: insets.bottom + spacing.base }]}>
          <View style={[styles.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Icon name="search" size={18} color={theme.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              autoFocus
              placeholder="Search a food"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              style={[styles.searchInput, { color: theme.text }]}
            />
            {search.isFetching ? <ActivityIndicator size="small" color={theme.primary} /> : null}
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 360 }}>
            {(search.data?.results ?? []).map((item) => (
              <Pressable
                key={item.id}
                onPress={() => onPick(item)}
                style={({ pressed }) => [styles.pickRow, { borderBottomColor: theme.border }, pressed && { opacity: 0.6 }]}
              >
                <ConfidenceDot level={item.confidence} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium" numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text variant="small" tone="muted">
                    {Math.round(item.per_100g.kcal)} kcal / 100 g · {item.portions[0]?.label ?? '100 g'}
                  </Text>
                </View>
              </Pressable>
            ))}
            {debounced.length >= 2 && search.data && search.data.results.length === 0 ? (
              <Text variant="small" tone="muted" style={{ padding: spacing.base }}>
                Nothing local matches "{debounced}". Add it from Add food → Look it up.
              </Text>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  mealRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  mealChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  itemHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  itemFooter: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  totals: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(12, 8, 20, 0.45)' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.base,
    gap: spacing.md,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    height: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
  },
  searchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 16 },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
