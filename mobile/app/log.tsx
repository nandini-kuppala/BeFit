import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { logs, voice } from '../src/api/befit';
import { MEAL_LABELS, MEAL_ORDER, type DraftItem, type Meal } from '../src/api/types';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { ConfidenceDot } from '../src/components/ConfidenceDot';
import { Icon } from '../src/components/Icon';
import { Recorder } from '../src/components/Recorder';
import { Text } from '../src/components/Text';
import { radius, semantic, spacing, useTheme } from '../src/theme';

const EXAMPLES = [
  'Two idlis with sambar and a boiled egg',
  'One katori rice, poriyal and baked chicken',
  'A glass of milk and four almonds',
];

export default function LogScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [text, setText] = useState('');
  const [items, setItems] = useState<DraftItem[] | null>(null);
  const [meal, setMeal] = useState<Meal>('breakfast');
  const [error, setError] = useState<string | null>(null);

  const parse = useMutation({
    mutationFn: () => voice.parse(text.trim()),
    onSuccess: (result) => {
      setItems(result.items);
      if (result.meal) setMeal(result.meal);
      setError(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    },
    onError: (err) => setError((err as Error).message),
  });

  const save = useMutation({
    mutationFn: () =>
      logs.logFood(
        meal,
        (items ?? []).map((item) => ({
          food_id: item.food_id,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
        })),
        true,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['day'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.back();
    },
    onError: (err) => setError((err as Error).message),
  });

  const totalKcal = (items ?? []).reduce((sum, item) => sum + item.nutrients.kcal, 0);
  const totalProtein = (items ?? []).reduce((sum, item) => sum + item.nutrients.protein_g, 0);

  function adjust(index: number, delta: number) {
    setItems((current) => {
      if (!current) return current;
      const next = [...current];
      const item = next[index];
      const quantity = Math.max(0.5, Number((item.quantity + delta).toFixed(1)));
      const scale = quantity / item.quantity;
      next[index] = {
        ...item,
        quantity,
        grams: Number((item.grams * scale).toFixed(1)),
        // Nutrition scales linearly with portion, so the review sheet can show
        // live totals without another round trip.
        nutrients: Object.fromEntries(
          Object.entries(item.nutrients).map(([key, value]) => [key, (value as number) * scale]),
        ) as DraftItem['nutrients'],
      };
      return next;
    });
    Haptics.selectionAsync().catch(() => {});
  }

  function remove(index: number) {
    setItems((current) => (current ? current.filter((_, i) => i !== index) : current));
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.canvas }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + spacing.base, borderBottomColor: theme.border },
        ]}
      >
        <Text variant="h2">{items ? 'Check this over' : 'Log food'}</Text>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Close">
          <Icon name="close" size={22} color={theme.textSecondary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: spacing['2xl'] }]}
        keyboardShouldPersistTaps="handled"
      >
        {!items ? (
          <>
            <Text variant="body" tone="secondary">
              Say what you ate in plain words — press and hold the button, or type it
              instead.
            </Text>

            <Recorder
              onTranscript={(transcript) =>
                setText((current) =>
                  current.trim() ? `${current.trim()} ${transcript}` : transcript,
                )
              }
              onError={setError}
            />

            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Two idlis with sambar…"
              placeholderTextColor={theme.textMuted}
              multiline
              style={[
                styles.input,
                { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text },
              ]}
            />

            <Text variant="caption" tone="muted">
              Try
            </Text>
            <View style={{ gap: spacing.sm }}>
              {EXAMPLES.map((example) => (
                <Pressable
                  key={example}
                  onPress={() => setText(example)}
                  style={({ pressed }) => [
                    styles.example,
                    { borderColor: theme.border, backgroundColor: theme.surface },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text variant="small" tone="secondary">
                    {example}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <>
            <View style={styles.mealRow}>
              {MEAL_ORDER.map((option) => (
                <Pressable
                  key={option}
                  onPress={() => setMeal(option)}
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

            {items.map((item, index) => (
              <Card key={`${item.name}-${index}`}>
                <View style={styles.itemHeader}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text variant="h3" numberOfLines={2}>
                      {item.name}
                    </Text>
                    <View style={styles.rowCenter}>
                      <ConfidenceDot level={item.confidence} showLabel />
                      <Text variant="small" tone="muted" tabular>
                        {Math.round(item.grams)} g
                      </Text>
                    </View>
                  </View>
                  <Pressable onPress={() => remove(index)} hitSlop={10} accessibilityLabel="Remove">
                    <Icon name="trash" size={19} color={theme.textMuted} />
                  </Pressable>
                </View>

                <View style={styles.itemFooter}>
                  <View style={[styles.stepper, { borderColor: theme.border }]}>
                    <Pressable
                      onPress={() => adjust(index, -0.5)}
                      style={styles.stepButton}
                      hitSlop={6}
                    >
                      <Text variant="h3" tone="secondary">
                        −
                      </Text>
                    </Pressable>
                    <Text variant="bodyMedium" tabular style={styles.stepValue}>
                      {item.quantity % 1 === 0 ? item.quantity : item.quantity.toFixed(1)}
                    </Text>
                    <Pressable
                      onPress={() => adjust(index, 0.5)}
                      style={styles.stepButton}
                      hitSlop={6}
                    >
                      <Text variant="h3" tone="secondary">
                        +
                      </Text>
                    </Pressable>
                  </View>
                  <Text variant="small" tone="muted">
                    {item.unit}
                  </Text>
                  <View style={{ flex: 1 }} />
                  <Text variant="h3" tabular>
                    {Math.round(item.nutrients.kcal)}
                  </Text>
                  <Text variant="small" tone="muted">
                    kcal
                  </Text>
                </View>
              </Card>
            ))}

            <Card variant="tinted">
              <View style={styles.totals}>
                <View>
                  <Text variant="h2" tabular>
                    {Math.round(totalKcal)}
                  </Text>
                  <Text variant="small" tone="secondary">
                    total kcal
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="h2" tabular>
                    {Math.round(totalProtein)} g
                  </Text>
                  <Text variant="small" tone="secondary">
                    protein
                  </Text>
                </View>
              </View>
            </Card>
          </>
        )}

        {error ? (
          <View style={[styles.error, { backgroundColor: theme.surfaceSunken }]}>
            <Text variant="small" style={{ color: semantic.danger }}>
              {error}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom + spacing.base, borderTopColor: theme.border },
        ]}
      >
        {items ? (
          <>
            <Button
              label="Back"
              variant="secondary"
              onPress={() => setItems(null)}
              style={{ flex: 1 }}
            />
            <Button
              label={`Log ${items.length} item${items.length === 1 ? '' : 's'}`}
              onPress={() => save.mutate()}
              loading={save.isPending}
              disabled={items.length === 0}
              style={{ flex: 2 }}
            />
          </>
        ) : (
          <Button
            label="Continue"
            onPress={() => parse.mutate()}
            loading={parse.isPending}
            disabled={text.trim().length < 3}
            size="lg"
            style={{ flex: 1 }}
          />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  body: { padding: spacing.lg, gap: spacing.base },
  input: {
    minHeight: 110,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.base,
    fontFamily: 'Inter_400Regular',
    fontSize: 17,
    lineHeight: 24,
    textAlignVertical: 'top',
  },
  example: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  mealRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  mealChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  itemHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  itemFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.base,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.sm },
  stepButton: { width: 38, height: 34, alignItems: 'center', justifyContent: 'center' },
  stepValue: { minWidth: 30, textAlign: 'center' },
  totals: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  error: { padding: spacing.md, borderRadius: radius.sm },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.base,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
