import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { food, logs, savedMeals } from '../src/api/befit';
import { ApiError } from '../src/api/client';
import {
  MEAL_LABELS,
  MEAL_ORDER,
  type FoodSummary,
  type Meal,
  type RecentFood,
} from '../src/api/types';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { ConfidenceDot } from '../src/components/ConfidenceDot';
import { FoodSheet, type FoodSheetValue } from '../src/components/FoodSheet';
import { Icon, type IconName } from '../src/components/Icon';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Text } from '../src/components/Text';
import { localISODate, mealForHour } from '../src/lib/date';
import { describePortion, findPortion, gramsFor } from '../src/lib/portions';
import { radius, semantic, shadow, spacing, useTheme } from '../src/theme';

function useDebounced<T>(value: T, delay = 220) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function dayLabel(iso: string): string {
  const today = localISODate();
  const yesterday = localISODate(new Date(Date.now() - 86_400_000));
  if (iso === today) return 'Today';
  if (iso === yesterday) return 'Yesterday';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function previousDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return localISODate(new Date(y, m - 1, d - 1));
}

/** kcal for one default portion — what a result row should lead with. */
function portionKcal(item: FoodSummary): { kcal: number; label: string } {
  const portion = item.portions[0];
  const grams = portion ? (portion.key === 'g' || portion.key === 'ml' ? 100 : portion.grams) : 100;
  const label = portion
    ? portion.key === 'g' || portion.key === 'ml'
      ? `100 ${portion.key}`
      : portion.label
    : '100 g';
  return { kcal: Math.round((item.per_100g.kcal * grams) / 100), label };
}

type Toast = { text: string; logId?: string; itemId?: string } | null;

type ListTab = 'usual' | 'recent' | 'frequent';

/**
 * Add food — the one logging screen.
 *
 * Empty search shows what she's most likely about to log: her usual foods for
 * this meal, recents and favourites, each one tap from logged at last time's
 * amount. Typing searches the local database instantly; the network chain is
 * only walked on an explicit "Look it up". Every add logs immediately with an
 * undo, so adding three things is three taps, not a cart and a checkout.
 */
export default function FoodAdd() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ meal?: Meal; date?: string; foodId?: string; q?: string }>();

  const [date] = useState(params.date || localISODate());
  const [meal, setMeal] = useState<Meal>(
    params.meal && MEAL_ORDER.includes(params.meal) ? params.meal : mealForHour(new Date().getHours()),
  );
  const [query, setQuery] = useState(params.q ?? '');
  const debounced = useDebounced(query.trim());
  const [listTab, setListTab] = useState<ListTab>('usual');
  const [sheet, setSheet] = useState<{ food: FoodSummary; quantity?: number; portionKey?: string | null } | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [added, setAdded] = useState(0);
  const [quickOpen, setQuickOpen] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const showToast = (next: Toast) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(next);
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  };

  // A food handed over by scan / new food / recipe opens straight into the sheet.
  const handed = useQuery({
    queryKey: ['food-detail', params.foodId],
    queryFn: ({ signal }) => food.detail(params.foodId!, signal),
    enabled: !!params.foodId,
  });
  useEffect(() => {
    if (handed.data) setSheet({ food: handed.data });
  }, [handed.data]);

  const searching = debounced.length >= 2;
  const search = useQuery({
    queryKey: ['food-search', debounced],
    queryFn: ({ signal }) => food.search(debounced, signal),
    enabled: searching,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const recent = useQuery({
    queryKey: ['food-recent', meal],
    queryFn: ({ signal }) => food.recent(meal, signal),
    staleTime: 60_000,
  });

  const meals = useQuery({ queryKey: ['saved-meals'], queryFn: () => savedMeals.list() });

  const refreshDay = () => {
    // Not awaited: the screen stays responsive while Home catches up.
    queryClient.invalidateQueries({ queryKey: ['day'] });
    queryClient.invalidateQueries({ queryKey: ['day-history'] });
    queryClient.invalidateQueries({ queryKey: ['food-recent'] });
  };

  const log = useMutation({
    mutationFn: (value: FoodSheetValue) =>
      logs.logFood(value.meal, [{ food_id: value.food.id, quantity: value.quantity, unit: value.portionKey }], false, date),
    onSuccess: (result, value) => {
      const entry = result as { _id?: string; id?: string; items?: { id: string }[] };
      const last = entry.items?.[entry.items.length - 1];
      setSheet(null);
      setAdded((n) => n + 1);
      showToast({
        text: `${value.food.name} · ${describePortion(value.quantity, findPortion(value.food.portions, value.portionKey))} → ${MEAL_LABELS[value.meal]}`,
        logId: entry._id ?? entry.id,
        itemId: last?.id,
      });
      refreshDay();
    },
  });

  const quickLog = useMutation({
    mutationFn: (item: RecentFood) =>
      logs.logFood(meal, [{ food_id: item.food.id, quantity: item.last_quantity, unit: item.last_portion_key ?? item.food.portions[0]?.key ?? 'g' }], false, date),
    onSuccess: (result, item) => {
      const entry = result as { _id?: string; id?: string; items?: { id: string }[] };
      const last = entry.items?.[entry.items.length - 1];
      setAdded((n) => n + 1);
      showToast({
        text: `${item.food.name} · ${describePortion(item.last_quantity, findPortion(item.food.portions, item.last_portion_key))} → ${MEAL_LABELS[meal]}`,
        logId: entry._id ?? entry.id,
        itemId: last?.id,
      });
      refreshDay();
    },
    onError: (err) => showToast({ text: (err as Error).message }),
  });

  const undo = useMutation({
    mutationFn: ({ logId, itemId }: { logId: string; itemId: string }) => logs.deleteItem(logId, itemId),
    onSuccess: () => {
      setAdded((n) => Math.max(0, n - 1));
      showToast({ text: 'Removed' });
      refreshDay();
    },
  });

  const lookup = useMutation({
    mutationFn: () => food.resolve(query.trim()),
    onSuccess: (result, _vars) => {
      // Ignore a late answer for a query she has since changed.
      if (query.trim().length) setSheet({ food: result });
    },
  });

  const copyYesterday = useMutation({
    mutationFn: () => logs.copyMeal(previousDay(date), meal, date, meal),
    onSuccess: () => {
      showToast({ text: `Copied ${dayLabel(previousDay(date)).toLowerCase()}'s ${MEAL_LABELS[meal].toLowerCase()}` });
      refreshDay();
    },
    onError: (err) =>
      showToast({
        text: err instanceof ApiError && err.status === 404
          ? `Nothing was logged for ${MEAL_LABELS[meal].toLowerCase()} the day before.`
          : (err as Error).message,
      }),
  });

  const logSaved = useMutation({
    mutationFn: (id: string) => savedMeals.log(id, meal, 1, date),
    onSuccess: (result) => {
      setAdded((n) => n + result.items);
      showToast({ text: `Added ${result.items} items · ${Math.round(result.kcal)} kcal` });
      refreshDay();
      queryClient.invalidateQueries({ queryKey: ['saved-meals'] });
    },
  });

  const results = search.data?.results ?? [];
  const settled = searching && !search.isFetching && search.data?.query === debounced;
  const needsLookup = settled && !(search.data?.has_exact_match ?? false);

  const list: RecentFood[] = useMemo(() => {
    const data = recent.data;
    if (!data) return [];
    if (listTab === 'usual') return data.for_meal.length ? data.for_meal : data.frequent;
    return listTab === 'recent' ? data.recent : data.frequent;
  }, [recent.data, listTab]);

  const quickActions: { icon: IconName; label: string; onPress: () => void }[] = [
    { icon: 'mic', label: 'Voice', onPress: () => router.push(`/log?meal=${meal}&date=${date}`) },
    { icon: 'camera', label: 'Photo', onPress: () => router.push(`/food-photo?meal=${meal}&date=${date}`) },
    { icon: 'barcode', label: 'Barcode', onPress: () => router.push(`/food-scan?meal=${meal}&date=${date}`) },
    { icon: 'bolt', label: 'Quick add', onPress: () => setQuickOpen(true) },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas }}>
      <ScreenHeader
        title={`Add to ${MEAL_LABELS[meal]}`}
        subtitle={dayLabel(date)}
        action={
          added > 0 ? (
            <Button label={`Done · ${added}`} size="sm" onPress={() => router.back()} />
          ) : undefined
        }
      />

      <ScrollView
        contentContainerStyle={[styles.page, { paddingBottom: insets.bottom + 120 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {MEAL_ORDER.map((option) => {
            const active = meal === option;
            return (
              <Pressable
                key={option}
                onPress={() => setMeal(option)}
                style={[
                  styles.mealChip,
                  {
                    backgroundColor: active ? theme.primary : theme.surface,
                    borderColor: active ? theme.primary : theme.border,
                  },
                ]}
              >
                <Text variant="smallMedium" tone={active ? 'inverse' : 'secondary'}>
                  {MEAL_LABELS[option]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={[styles.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Icon name="search" size={19} color={theme.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search idli, roti, dal, paneer…"
            placeholderTextColor={theme.textMuted}
            style={[styles.searchInput, { color: theme.text }]}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {search.isFetching ? <ActivityIndicator size="small" color={theme.primary} /> : null}
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Clear search">
              <Icon name="close" size={18} color={theme.textMuted} />
            </Pressable>
          ) : null}
        </View>

        {searching ? (
          <View style={{ gap: spacing.sm }}>
            {results.map((item) => {
              const { kcal, label } = portionKcal(item);
              return (
                <Pressable key={item.id} onPress={() => setSheet({ food: item })}>
                  <Card padded={false} variant="flat">
                    <View style={styles.row}>
                      <ConfidenceDot level={item.confidence} />
                      <View style={{ flex: 1 }}>
                        <Text variant="bodyMedium" numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text variant="small" tone="muted" tabular numberOfLines={1}>
                          {kcal} kcal · {label}
                          {item.brand ? ` · ${item.brand}` : ''}
                        </Text>
                      </View>
                      {item.variants_count > 0 ? (
                        <View style={[styles.badge, { backgroundColor: theme.primarySoft }]}>
                          <Text variant="caption" tone="primary" style={{ fontSize: 9.5 }}>
                            +{item.variants_count} types
                          </Text>
                        </View>
                      ) : null}
                      <Icon name="plus" size={20} color={theme.primary} />
                    </View>
                  </Card>
                </Pressable>
              );
            })}

            {needsLookup ? (
              <Card variant="tinted">
                <Text variant="smallMedium">
                  {results.length === 0 ? `No match for "${debounced}"` : `Not quite "${debounced}"?`}
                </Text>
                <Text variant="small" tone="secondary" style={{ marginTop: 4 }}>
                  BeFit can check USDA and published nutrition sites for it, then remember it for next
                  time. Or enter it from the packet.
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
                      router.push(`/food-new?name=${encodeURIComponent(debounced)}&meal=${meal}&date=${date}`)
                    }
                    style={{ flex: 1 }}
                  />
                </View>
                {lookup.isPending ? (
                  <Text variant="small" tone="muted" style={{ marginTop: spacing.sm }}>
                    Checking databases and the web — a few seconds.
                  </Text>
                ) : null}
                {lookup.isError ? (
                  <Text variant="small" style={{ color: semantic.danger, marginTop: spacing.sm }}>
                    {(lookup.error as Error).message}
                  </Text>
                ) : null}
              </Card>
            ) : null}
          </View>
        ) : (
          <>
            <View style={styles.actions}>
              {quickActions.map((action) => (
                <Pressable
                  key={action.label}
                  onPress={action.onPress}
                  style={({ pressed }) => [
                    styles.action,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                    pressed && { opacity: 0.7 },
                  ]}
                  accessibilityRole="button"
                >
                  <Icon name={action.icon} size={22} color={theme.primary} />
                  <Text variant="small" tone="secondary">
                    {action.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              onPress={() => copyYesterday.mutate()}
              disabled={copyYesterday.isPending}
              style={({ pressed }) => [
                styles.copyRow,
                { borderColor: theme.borderStrong },
                pressed && { opacity: 0.6 },
              ]}
            >
              {copyYesterday.isPending ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : (
                <Icon name="copy" size={17} color={theme.primary} />
              )}
              <Text variant="smallMedium" tone="primary">
                Same as {dayLabel(previousDay(date)).toLowerCase()}'s {MEAL_LABELS[meal].toLowerCase()}
              </Text>
            </Pressable>

            {meals.data?.length ? (
              <View style={{ gap: spacing.sm }}>
                <Text variant="caption" tone="muted">
                  My meals
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                  {meals.data.map((saved) => (
                    <Pressable
                      key={saved.id}
                      onPress={() => logSaved.mutate(saved.id)}
                      disabled={logSaved.isPending}
                      style={[styles.savedChip, { backgroundColor: theme.surface, borderColor: theme.border }]}
                    >
                      <View style={{ maxWidth: 160 }}>
                        <Text variant="smallMedium" numberOfLines={1}>
                          {saved.name}
                        </Text>
                        <Text variant="small" tone="muted" tabular>
                          {Math.round(saved.totals.kcal)} kcal · {saved.items.length} items
                        </Text>
                      </View>
                      <Icon name="plus" size={18} color={theme.primary} />
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <View style={[styles.segments, { backgroundColor: theme.surfaceSunken }]}>
              {(
                [
                  { key: 'usual', label: `Usual ${MEAL_LABELS[meal].toLowerCase()}` },
                  { key: 'recent', label: 'Recent' },
                  { key: 'frequent', label: 'Frequent' },
                ] as const
              ).map((option) => {
                const active = listTab === option.key;
                return (
                  <Pressable
                    key={option.key}
                    onPress={() => setListTab(option.key)}
                    style={[styles.segment, active && { backgroundColor: theme.surface }]}
                  >
                    <Text variant="smallMedium" tone={active ? 'default' : 'muted'} numberOfLines={1}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {recent.isLoading ? <ActivityIndicator color={theme.primary} style={{ marginTop: spacing.lg }} /> : null}

            {!recent.isLoading && list.length === 0 ? (
              <Card variant="tinted">
                <Text variant="small" tone="secondary">
                  Foods you log will show up here, ready to add again in one tap at the same amount.
                </Text>
              </Card>
            ) : null}

            {list.map((item) => {
              const portion = findPortion(item.food.portions, item.last_portion_key);
              const grams = gramsFor(portion, item.last_quantity);
              return (
                <Card key={item.food.id} padded={false} variant="flat">
                  <View style={styles.row}>
                    <Pressable
                      style={{ flex: 1 }}
                      onPress={() =>
                        setSheet({ food: item.food, quantity: item.last_quantity, portionKey: item.last_portion_key })
                      }
                    >
                      <Text variant="bodyMedium" numberOfLines={1}>
                        {item.food.name}
                      </Text>
                      <Text variant="small" tone="muted" tabular numberOfLines={1}>
                        {describePortion(item.last_quantity, portion)} ·{' '}
                        {Math.round((item.food.per_100g.kcal * grams) / 100)} kcal
                        {item.times > 1 ? ` · ${item.times}×` : ''}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => quickLog.mutate(item)}
                      disabled={quickLog.isPending}
                      hitSlop={6}
                      accessibilityLabel={`Add ${item.food.name}`}
                      style={({ pressed }) => [
                        styles.addButton,
                        { backgroundColor: theme.primarySoft },
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <Icon name="plus" size={20} color={theme.primary} strokeWidth={2.3} />
                    </Pressable>
                  </View>
                </Card>
              );
            })}

            <View style={styles.footerLinks}>
              <Pressable onPress={() => router.push(`/recipe-edit?meal=${meal}&date=${date}`)} style={styles.footerLink}>
                <Icon name="recipe" size={17} color={theme.primary} />
                <Text variant="smallMedium" tone="primary">
                  Build a recipe
                </Text>
              </Pressable>
              <Pressable onPress={() => router.push(`/food-new?meal=${meal}&date=${date}`)} style={styles.footerLink}>
                <Icon name="edit" size={17} color={theme.primary} />
                <Text variant="smallMedium" tone="primary">
                  New food from a label
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>

      {toast ? (
        <View
          style={[
            styles.toast,
            shadow(theme, 3),
            { backgroundColor: theme.text, bottom: insets.bottom + spacing.base },
          ]}
        >
          <Icon name="check" size={18} color={theme.canvas} />
          <Text variant="small" style={{ color: theme.canvas, flex: 1 }} numberOfLines={2}>
            {toast.text}
          </Text>
          {toast.logId && toast.itemId ? (
            <Pressable
              onPress={() => {
                undo.mutate({ logId: toast.logId!, itemId: toast.itemId! });
                setToast(null);
              }}
              hitSlop={10}
            >
              <Text variant="smallMedium" style={{ color: theme.primarySoftBorder }}>
                Undo
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <FoodSheet
        visible={!!sheet}
        food={sheet?.food ?? null}
        mode="add"
        meal={meal}
        initialQuantity={sheet?.quantity}
        initialPortionKey={sheet?.portionKey}
        busy={log.isPending}
        error={log.isError ? (log.error as Error).message : null}
        onSubmit={(value) => {
          if (value.meal !== meal) setMeal(value.meal);
          log.mutate(value);
        }}
        onClose={() => {
          setSheet(null);
          log.reset();
        }}
      />

      <QuickAddSheet
        visible={quickOpen}
        meal={meal}
        onClose={() => setQuickOpen(false)}
        onLogged={(kcal) => {
          setQuickOpen(false);
          setAdded((n) => n + 1);
          showToast({ text: `Added ${Math.round(kcal)} kcal to ${MEAL_LABELS[meal]}` });
          refreshDay();
        }}
        date={date}
      />
    </View>
  );
}

/** Calories without a food: the canteen plate she can't identify. */
function QuickAddSheet({
  visible,
  meal,
  date,
  onClose,
  onLogged,
}: {
  visible: boolean;
  meal: Meal;
  date: string;
  onClose: () => void;
  onLogged: (kcal: number) => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [values, setValues] = useState({ kcal: '', protein_g: '', carbs_g: '', fat_g: '' });

  useEffect(() => {
    if (visible) {
      setName('');
      setValues({ kcal: '', protein_g: '', carbs_g: '', fat_g: '' });
    }
  }, [visible]);

  const num = (text: string) => {
    const value = Number(text.replace(',', '.'));
    return Number.isFinite(value) && value >= 0 ? value : 0;
  };

  const save = useMutation({
    mutationFn: () =>
      logs.logFood(
        meal,
        [
          {
            quantity: 1,
            unit: 'entry',
            quick: {
              name: name.trim() || 'Quick add',
              kcal: num(values.kcal),
              protein_g: num(values.protein_g),
              carbs_g: num(values.carbs_g),
              fat_g: num(values.fat_g),
            },
          },
        ],
        false,
        date,
      ),
    onSuccess: () => onLogged(num(values.kcal)),
  });

  const fields: { key: keyof typeof values; label: string }[] = [
    { key: 'kcal', label: 'Calories (kcal)' },
    { key: 'protein_g', label: 'Protein (g)' },
    { key: 'carbs_g', label: 'Carbs (g)' },
    { key: 'fat_g', label: 'Fat (g)' },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior="padding" style={styles.sheetWrap} pointerEvents="box-none">
        <View style={[styles.sheet, { backgroundColor: theme.canvas, paddingBottom: insets.bottom + spacing.base }]}>
          <Text variant="h2">Quick add</Text>
          <Text variant="small" tone="secondary">
            For a meal you can't look up. Counted as an estimate.
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="What was it? (optional)"
            placeholderTextColor={theme.textMuted}
            style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface }]}
          />
          <View style={styles.quickGrid}>
            {fields.map((field) => (
              <View key={field.key} style={{ width: '48%', gap: 4 }}>
                <Text variant="small" tone="muted">
                  {field.label}
                </Text>
                <TextInput
                  value={values[field.key]}
                  onChangeText={(text) => setValues((v) => ({ ...v, [field.key]: text }))}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={theme.textMuted}
                  style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface }]}
                />
              </View>
            ))}
          </View>
          {save.isError ? (
            <Text variant="small" style={{ color: semantic.danger }}>
              {(save.error as Error).message}
            </Text>
          ) : null}
          <Button
            label={`Add to ${MEAL_LABELS[meal]}`}
            onPress={() => save.mutate()}
            loading={save.isPending}
            disabled={num(values.kcal) <= 0}
            fullWidth
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { padding: spacing.base, gap: spacing.md },
  chips: { gap: spacing.sm, paddingRight: spacing.base },
  mealChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
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
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.base },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  savedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  segments: { flexDirection: 'row', borderRadius: radius.md, padding: 3, gap: 3, marginTop: spacing.xs },
  segment: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.md - 3 },
  addButton: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerLinks: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.sm },
  footerLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  toast: {
    position: 'absolute',
    left: spacing.base,
    right: spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(12, 8, 20, 0.45)' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.base,
    gap: spacing.md,
  },
  input: {
    height: 46,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
  },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.md },
});
