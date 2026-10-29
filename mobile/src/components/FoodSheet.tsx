import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { food as foodApi } from '../api/befit';
import { MEAL_LABELS, MEAL_ORDER, type FoodSummary, type Meal } from '../api/types';
import { defaultQuantity, findPortion, gramsFor, scale } from '../lib/portions';
import { radius, semantic, shadow, spacing, useTheme } from '../theme';
import { Button } from './Button';
import { ConfidenceDot } from './ConfidenceDot';
import { Icon } from './Icon';
import { PortionPicker } from './PortionPicker';
import { Text } from './Text';

export type FoodSheetValue = {
  food: FoodSummary;
  quantity: number;
  portionKey: string;
  meal: Meal;
};

type FoodSheetProps = {
  visible: boolean;
  food: FoodSummary | null;
  mode: 'add' | 'edit';
  meal: Meal;
  initialQuantity?: number;
  initialPortionKey?: string | null;
  busy?: boolean;
  error?: string | null;
  onSubmit: (value: FoodSheetValue) => void;
  onDelete?: () => void;
  onClose: () => void;
};

/**
 * The one place a food's amount is chosen — adding from search, recents or a
 * scan, and editing something already logged.
 *
 * Variations sit at the top as chips ("Chapati · with ghee · Paratha"), so the
 * difference between plain and ghee roti is one tap, not a second search.
 */
export function FoodSheet({
  visible,
  food,
  mode,
  meal: initialMeal,
  initialQuantity,
  initialPortionKey,
  busy,
  error,
  onSubmit,
  onDelete,
  onClose,
}: FoodSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [current, setCurrent] = useState<FoodSummary | null>(food);
  const [portionKey, setPortionKey] = useState<string>('');
  const [quantity, setQuantity] = useState(1);
  const [meal, setMeal] = useState<Meal>(initialMeal);

  useEffect(() => {
    if (!visible || !food) return;
    setCurrent(food);
    const portion = findPortion(food.portions, initialPortionKey);
    setPortionKey(portion?.key ?? 'g');
    setQuantity(initialQuantity ?? defaultQuantity(portion));
    setMeal(initialMeal);
  }, [visible, food, initialPortionKey, initialQuantity, initialMeal]);

  const variants = useQuery({
    queryKey: ['food-detail', food?.id],
    queryFn: ({ signal }) => foodApi.detail(food!.id, signal),
    enabled: visible && !!food && food.variants_count > 0 && mode === 'add',
    staleTime: 10 * 60_000,
  });

  const options = useMemo(() => {
    if (!food) return [];
    // Editing a logged entry changes its amount, not which food it is.
    if (mode === 'edit' || !variants.data) return [food];
    return [food, ...variants.data.variants];
  }, [food, variants.data, mode]);

  if (!current) return null;
  const portion = findPortion(current.portions, portionKey);
  const grams = gramsFor(portion, quantity);
  const n = scale(current.per_100g, grams);

  const switchTo = (next: FoodSummary) => {
    // Keep the amount when the new variant has the same unit ("2 chapati" ->
    // "2 chapati with ghee"); otherwise start from its default.
    const same = next.portions.find((p) => p.key === portionKey);
    setCurrent(next);
    if (!same) {
      setPortionKey(next.portions[0]?.key ?? 'g');
      setQuantity(defaultQuantity(next.portions[0]));
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <KeyboardAvoidingView behavior="padding" style={styles.sheetWrap} pointerEvents="box-none">
        <View
          style={[
            styles.sheet,
            shadow(theme, 3),
            { backgroundColor: theme.canvas, paddingBottom: insets.bottom + spacing.base },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: theme.borderStrong }]} />
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <View style={styles.titleRow}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="h2" numberOfLines={2}>
                  {current.name}
                </Text>
                <View style={styles.metaRow}>
                  <ConfidenceDot level={current.confidence} showLabel />
                  {current.brand ? (
                    <Text variant="small" tone="muted">
                      · {current.brand}
                    </Text>
                  ) : null}
                  {current.is_personal ? (
                    <Text variant="small" tone="muted">
                      · yours
                    </Text>
                  ) : null}
                </View>
              </View>
              <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
                <Icon name="close" size={22} color={theme.textMuted} />
              </Pressable>
            </View>

            {options.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.variants}>
                {options.map((option) => {
                  const active = option.id === current.id;
                  return (
                    <Pressable
                      key={option.id}
                      onPress={() => switchTo(option)}
                      style={[
                        styles.variantChip,
                        {
                          backgroundColor: active ? theme.primarySoft : theme.surface,
                          borderColor: active ? theme.primary : theme.border,
                        },
                      ]}
                    >
                      <Text variant="smallMedium" tone={active ? 'primary' : 'default'} numberOfLines={1}>
                        {option.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}

            <View style={[styles.nutrition, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.kcalBlock}>
                <Text variant="display" tabular>
                  {Math.round(n.kcal)}
                </Text>
                <Text variant="small" tone="muted">
                  kcal · {Math.round(grams)} g
                </Text>
              </View>
              <View style={styles.macroGrid}>
                {[
                  { label: 'Protein', value: n.protein_g },
                  { label: 'Carbs', value: n.carbs_g },
                  { label: 'Fat', value: n.fat_g },
                  { label: 'Fibre', value: n.fibre_g },
                ].map((m) => (
                  <View key={m.label} style={styles.macroCell}>
                    <Text variant="h3" tabular>
                      {m.value.toFixed(1)}
                      <Text variant="small" tone="muted">
                        g
                      </Text>
                    </Text>
                    <Text variant="small" tone="muted">
                      {m.label}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {current.portions.length ? (
              <PortionPicker
                portions={current.portions}
                portionKey={portion?.key ?? 'g'}
                quantity={quantity}
                onChange={(next) => {
                  setQuantity(next.quantity);
                  setPortionKey(next.portionKey);
                }}
              />
            ) : null}

            <View style={styles.mealRow}>
              {MEAL_ORDER.map((option) => {
                const active = meal === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => setMeal(option)}
                    style={[
                      styles.mealChip,
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

            {current.confidence === 'estimated' ? (
              <Text variant="small" style={{ color: semantic.warning }}>
                These numbers are an estimate, not a measured value. If you have the packet or a
                better source, fix them below.
              </Text>
            ) : null}

            {error ? (
              <Text variant="small" style={{ color: semantic.danger }}>
                {error}
              </Text>
            ) : null}

            <Button
              label={mode === 'add' ? `Add to ${MEAL_LABELS[meal]}` : 'Save changes'}
              onPress={() => current && onSubmit({ food: current, quantity, portionKey: portion?.key ?? 'g', meal })}
              loading={busy}
              disabled={quantity <= 0}
              fullWidth
            />

            <View style={styles.footerLinks}>
              <Pressable
                onPress={() => {
                  onClose();
                  router.push(`/food-correct?id=${current.id}`);
                }}
                hitSlop={8}
              >
                <Text variant="smallMedium" tone="primary">
                  Numbers look wrong? Fix them
                </Text>
              </Pressable>
              {onDelete ? (
                <Pressable onPress={onDelete} hitSlop={8} style={styles.deleteLink}>
                  <Icon name="trash" size={15} color={semantic.danger} />
                  <Text variant="smallMedium" style={{ color: semantic.danger }}>
                    Remove
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(12, 8, 20, 0.45)' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '92%',
  },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: spacing.sm },
  content: { padding: spacing.base, gap: spacing.base },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  variants: { gap: spacing.sm, paddingRight: spacing.base },
  variantChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    maxWidth: 220,
  },
  nutrition: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
    padding: spacing.base,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  kcalBlock: { alignItems: 'center', minWidth: 84 },
  macroGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.sm },
  macroCell: { width: '50%' },
  mealRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  mealChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  footerLinks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.xs,
  },
  deleteLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
