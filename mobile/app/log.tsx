import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { logs, voice } from '../src/api/befit';
import { MEAL_ORDER, type Meal } from '../src/api/types';
import { Button } from '../src/components/Button';
import { DraftReview, rowsFromDrafts, type DraftRow } from '../src/components/DraftReview';
import { Icon } from '../src/components/Icon';
import { Recorder } from '../src/components/Recorder';
import { Text } from '../src/components/Text';
import { mealForHour } from '../src/lib/date';
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
  const params = useLocalSearchParams<{ meal?: Meal; date?: string }>();
  const presetMeal = params.meal && MEAL_ORDER.includes(params.meal) ? params.meal : undefined;

  const [text, setText] = useState('');
  const [items, setItems] = useState<DraftRow[] | null>(null);
  const [meal, setMeal] = useState<Meal>(presetMeal ?? mealForHour(new Date().getHours()));
  const [error, setError] = useState<string | null>(null);

  // Hardware back on the review step returns to the transcript instead of
  // closing the screen and throwing the parsed items away.
  useEffect(() => {
    if (!items) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setItems(null);
      return true;
    });
    return () => sub.remove();
  }, [items]);

  const parse = useMutation({
    // The device's clock decides the meal when none was said; the server's
    // clock may be in another timezone.
    mutationFn: () => voice.parse(text.trim(), presetMeal),
    onSuccess: (result) => {
      setItems(rowsFromDrafts(result.items));
      setMeal(presetMeal ?? result.meal ?? mealForHour(new Date().getHours()));
      setError(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    },
    onError: (err) => setError((err as Error).message),
  });

  const loggable = (items ?? []).filter((row) => row.resolved && row.foodId);
  const unresolved = (items ?? []).length - loggable.length;

  const save = useMutation({
    mutationFn: () =>
      logs.logFood(
        meal,
        loggable.map((row) => ({ food_id: row.foodId, quantity: row.quantity, unit: row.portionKey })),
        true,
        params.date,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['day'] });
      queryClient.invalidateQueries({ queryKey: ['day-history'] });
      queryClient.invalidateQueries({ queryKey: ['food-recent'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.back();
    },
    onError: (err) => setError((err as Error).message),
  });

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.canvas }} behavior="padding">
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
          <DraftReview rows={items} onChange={setItems} meal={meal} onMealChange={setMeal} />
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
              label={
                unresolved > 0
                  ? `Log ${loggable.length} · ${unresolved} unmatched`
                  : `Log ${loggable.length} item${loggable.length === 1 ? '' : 's'}`
              }
              onPress={() => save.mutate()}
              loading={save.isPending}
              disabled={loggable.length === 0}
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
