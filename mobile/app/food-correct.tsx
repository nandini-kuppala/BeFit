import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { food } from '../src/api/befit';
import type { FoodDetail, Nutrients } from '../src/api/types';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { ConfidenceDot } from '../src/components/ConfidenceDot';
import { Icon } from '../src/components/Icon';
import { KeyboardScreen } from '../src/components/KeyboardScreen';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Text } from '../src/components/Text';
import { useUnsavedChangesGuard } from '../src/lib/useUnsavedChangesGuard';
import { radius, semantic, spacing, useTheme } from '../src/theme';

type Basis = 'per100' | 'perServing';
type FieldKey =
  | 'kcal'
  | 'protein_g'
  | 'carbs_g'
  | 'fat_g'
  | 'fibre_g'
  | 'sugar_g'
  | 'iron_mg'
  | 'calcium_mg'
  | 'sodium_mg'
  | 'potassium_mg';

const FIELDS: { key: FieldKey; label: string }[] = [
  { key: 'kcal', label: 'Calories' },
  { key: 'protein_g', label: 'Protein (g)' },
  { key: 'carbs_g', label: 'Carbs (g)' },
  { key: 'fat_g', label: 'Fat (g)' },
  { key: 'fibre_g', label: 'Fibre (g)' },
  { key: 'sugar_g', label: 'Sugar (g)' },
  { key: 'iron_mg', label: 'Iron (mg)' },
  { key: 'calcium_mg', label: 'Calcium (mg)' },
  { key: 'sodium_mg', label: 'Sodium (mg)' },
  { key: 'potassium_mg', label: 'Potassium (mg)' },
];

/** Units every food gets from the server; only the food's own count nouns are hers to edit. */
const STANDARD_KEYS = new Set(['g', 'ml', 'katori', 'cup', 'glass', 'tbsp', 'tsp']);
/** Household units naming a standard measure — kept as-is when portions are rewritten. */
const STANDARD_LABEL = /\b(katori|bowl|cup|glass|tbsp|tablespoon|tsp|teaspoon)s?\b/i;
const MAX_PORTIONS = 8;
const NUMERIC = /[^\d.]/g;

type Values = Record<FieldKey, string>;
type PortionRow = { label: string; grams: string };

function num(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Up to 3 decimals, no trailing zeros — exact enough that an untouched field round-trips. */
function show(value: number): string {
  if (!Number.isFinite(value)) return '';
  return String(Math.round(value * 1000) / 1000);
}

function portionLabel(label: string): string {
  const trimmed = label.trim();
  return /^\d/.test(trimmed) ? trimmed : `1 ${trimmed}`;
}

function ownPortions(detail: FoodDetail): PortionRow[] {
  return detail.portions
    .filter((portion) => !STANDARD_KEYS.has(portion.key))
    .map((portion) => ({
      label: portion.label.replace(/^1\s+/, ''),
      grams: show(Math.round(portion.grams * 10) / 10),
    }));
}

/**
 * Fix a food's numbers.
 *
 * The original stays untouched for everyone else; her version becomes a
 * personal verified food that outranks it in her searches. Values can be
 * typed per 100 g or straight off a label's per-serving column — the form
 * converts, because asking her to do that arithmetic is how typos get saved.
 */
export default function FoodCorrect() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();

  const detail = useQuery({
    queryKey: ['food-detail', id],
    queryFn: ({ signal }) => food.detail(id, signal),
    enabled: !!id,
  });

  const [hydrated, setHydrated] = useState(false);
  /** Text of the fields she has typed in; the rest are derived from the stored values. */
  const [values, setValues] = useState<Partial<Values>>({});
  const [edited, setEdited] = useState<Set<FieldKey>>(new Set());
  const [basis, setBasis] = useState<Basis>('per100');
  const [servingGrams, setServingGrams] = useState('');
  const [portions, setPortions] = useState<PortionRow[]>([]);
  const [portionsDirty, setPortionsDirty] = useState(false);

  useEffect(() => {
    if (hydrated || !detail.data) return;
    setPortions(ownPortions(detail.data));
    setHydrated(true);
  }, [detail.data, hydrated]);

  const grams = num(servingGrams);
  const toPer100 = basis === 'per100' ? 1 : grams > 0 ? 100 / grams : 0;

  // Untouched fields are never round-tripped through a string: they keep the
  // stored per-100 g value exactly, and are only displayed scaled to the basis.
  const displayed = (key: FieldKey): string => {
    if (edited.has(key)) return values[key] ?? '';
    if (!detail.data) return '';
    if (basis === 'per100') return show(detail.data.per_100g[key]);
    return grams > 0 ? show((detail.data.per_100g[key] * grams) / 100) : '';
  };

  const per100g = (): Nutrients | null => {
    if (!detail.data) return null;
    const out: Nutrients = { ...detail.data.per_100g };
    for (const key of edited) {
      out[key] = Math.round(num(values[key] ?? '') * toPer100 * 1000) / 1000;
    }
    return out;
  };

  const preview = per100g();
  const tooDense = preview ? preview.kcal > 950 : false;
  const validBasis = basis === 'per100' || grams > 0;
  const dirty = edited.size > 0 || portionsDirty;

  const filledPortions = portions
    .filter((row) => row.label.trim() && num(row.grams) > 0 && num(row.grams) <= 3000)
    .map((row) => ({ label: portionLabel(row.label).slice(0, 40), grams: num(row.grams) }));

  const save = useMutation({
    mutationFn: () => {
      const body = per100g();
      if (!body) throw new Error('Food not loaded yet.');
      let units: { label: string; grams: number }[] | undefined;
      if (portionsDirty && detail.data) {
        // Sending portions replaces the food's household units wholesale, so
        // carry over any katori/cup measures it already had.
        const kept = detail.data.household_units
          .filter((unit) => STANDARD_LABEL.test(unit.label))
          .map((unit) => ({ label: unit.label.slice(0, 40), grams: unit.grams }));
        units = [...filledPortions, ...kept].slice(0, MAX_PORTIONS);
      }
      return food.correct(id, body, units && units.length > 0 ? units : undefined);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['food-search'] }),
        queryClient.invalidateQueries({ queryKey: ['food-recent'] }),
        queryClient.invalidateQueries({ queryKey: ['food-detail'] }),
      ]);
      router.back();
    },
  });

  useUnsavedChangesGuard(dirty && !save.isPending && !save.isSuccess);

  const setField = (key: FieldKey, text: string) => {
    setValues((current) => ({ ...current, [key]: text.replace(NUMERIC, '') }));
    setEdited((current) => (current.has(key) ? current : new Set(current).add(key)));
  };

  const switchBasis = (next: Basis) => {
    if (next === basis || !detail.data) return;
    let servingG = grams;
    if (next === 'perServing' && servingG <= 0) {
      const own = detail.data.portions.find((p) => !STANDARD_KEYS.has(p.key) && p.key !== 'g');
      servingG = Math.round((own?.grams ?? detail.data.default_grams ?? 100) * 10) / 10 || 100;
      setServingGrams(show(servingG));
    }
    // Convert what she typed so switching never silently reinterprets it.
    if (servingG > 0) {
      const factor = next === 'perServing' ? servingG / 100 : 100 / servingG;
      setValues((current) => {
        const out = { ...current };
        for (const key of edited) out[key] = show(num(current[key] ?? '') * factor);
        return out;
      });
    }
    setBasis(next);
  };

  const updatePortion = (index: number, patch: Partial<PortionRow>) => {
    setPortions((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    setPortionsDirty(true);
  };

  const inputStyle = [
    styles.input,
    { backgroundColor: theme.surfaceSunken, borderColor: theme.border, color: theme.text },
  ];

  const header = (
    <ScreenHeader
      title="Correct values"
      subtitle={detail.data?.name ?? 'Loading…'}
      action={
        <Button
          label="Save"
          size="sm"
          onPress={() => save.mutate()}
          loading={save.isPending}
          disabled={!hydrated || !dirty || !validBasis || tooDense}
        />
      }
    />
  );

  if (!detail.data) {
    return (
      <KeyboardScreen header={header} contentContainerStyle={styles.page}>
        {detail.isError ? (
          <Card style={{ gap: spacing.md }}>
            <Text variant="small" style={{ color: semantic.danger }}>
              {(detail.error as Error).message}
            </Text>
            <Button label="Try again" variant="secondary" onPress={() => detail.refetch()} />
          </Card>
        ) : (
          <View style={styles.loading}>
            <ActivityIndicator color={theme.primary} />
          </View>
        )}
      </KeyboardScreen>
    );
  }

  const data = detail.data;

  return (
    <KeyboardScreen header={header} contentContainerStyle={styles.page}>
      <Card variant="tinted" style={{ gap: spacing.sm }}>
        <View style={styles.sourceRow}>
          <ConfidenceDot level={data.confidence} showLabel />
          <Text variant="small" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
            {data.brand ? `${data.brand} · ` : ''}from {data.source}
          </Text>
        </View>
        <Text variant="small" tone="secondary">
          Your corrected version is saved as your own food and used instead of this one from
          now on. Past logs keep their numbers.
        </Text>
      </Card>

      <Card>
        <Field label="The numbers below are">
          <View style={styles.segments}>
            {(
              [
                { key: 'per100', label: 'Per 100 g' },
                { key: 'perServing', label: 'Per serving' },
              ] as const
            ).map((option) => {
              const active = basis === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => switchBasis(option.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.segment,
                    {
                      backgroundColor: active ? theme.primary : theme.surfaceSunken,
                      borderColor: active ? theme.primary : theme.border,
                    },
                  ]}
                >
                  <Text variant="smallMedium" tone={active ? 'inverse' : 'secondary'}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Field>

        {basis === 'perServing' ? (
          <Field label="Serving weight (g)">
            <TextInput
              value={servingGrams}
              onChangeText={(v) => setServingGrams(v.replace(NUMERIC, ''))}
              placeholder="30"
              placeholderTextColor={theme.textMuted}
              keyboardType="decimal-pad"
              style={inputStyle}
            />
            <Text variant="small" tone="muted">
              Type the values from the label's per-serving column; they're converted to per
              100 g when saved.
            </Text>
          </Field>
        ) : null}
      </Card>

      <Card>
        <Text variant="caption" tone="muted">
          Nutrition {basis === 'per100' ? 'per 100 g' : `per ${servingGrams || '…'} g serving`}
        </Text>
        {pairs(FIELDS).map((pair) => (
          <View key={pair[0].key} style={styles.row}>
            {pair.map((field) => (
              <Field key={field.key} label={field.label} style={{ flex: 1 }}>
                <TextInput
                  value={displayed(field.key)}
                  onChangeText={(text) => setField(field.key, text)}
                  placeholder="0"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  style={[
                    inputStyle,
                    edited.has(field.key) && { borderColor: theme.primary },
                  ]}
                  accessibilityLabel={field.label}
                />
              </Field>
            ))}
          </View>
        ))}

        {basis === 'perServing' && preview && grams > 0 ? (
          <View style={[styles.preview, { backgroundColor: theme.surfaceSunken }]}>
            <Text variant="small" tone="secondary" tabular>
              {Math.round(preview.kcal)} kcal · P{preview.protein_g.toFixed(1)} · C
              {preview.carbs_g.toFixed(1)} · F{preview.fat_g.toFixed(1)} per 100 g
            </Text>
          </View>
        ) : null}

        {tooDense ? (
          <Text variant="small" style={{ color: semantic.danger, marginTop: spacing.md }}>
            That works out to over 950 kcal per 100 g — check the serving weight.
          </Text>
        ) : null}
      </Card>

      <Card>
        <Text variant="caption" tone="muted">
          Portions
        </Text>
        <Text variant="small" tone="secondary" style={{ marginTop: spacing.xs }}>
          What one of each weighs. Grams, spoons, katori and cups are always available.
        </Text>

        {portions.map((row, index) => (
          <View key={index} style={[styles.row, { alignItems: 'flex-end' }]}>
            <Field label="Portion" style={{ flex: 1.4 }}>
              <TextInput
                value={row.label}
                onChangeText={(v) => updatePortion(index, { label: v })}
                placeholder="piece"
                placeholderTextColor={theme.textMuted}
                maxLength={38}
                style={inputStyle}
              />
            </Field>
            <Field label="Weight (g)" style={{ flex: 1 }}>
              <TextInput
                value={row.grams}
                onChangeText={(v) => updatePortion(index, { grams: v.replace(NUMERIC, '') })}
                placeholder="40"
                placeholderTextColor={theme.textMuted}
                keyboardType="decimal-pad"
                style={inputStyle}
              />
            </Field>
            <Pressable
              onPress={() => {
                setPortions((rows) => rows.filter((_, i) => i !== index));
                setPortionsDirty(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Remove portion"
              hitSlop={8}
              style={styles.removeButton}
            >
              <Icon name="close" size={18} color={theme.textMuted} />
            </Pressable>
          </View>
        ))}

        {portions.length < MAX_PORTIONS - 1 ? (
          <Button
            label="Add a portion"
            variant="ghost"
            size="sm"
            icon={<Icon name="plus" size={16} color={theme.primaryInk} />}
            onPress={() => setPortions((rows) => [...rows, { label: '', grams: '' }])}
            style={{ alignSelf: 'flex-start', marginTop: spacing.sm, paddingHorizontal: 0 }}
          />
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

function pairs<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 2) out.push(items.slice(i, i + 2));
  return out;
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
  page: { padding: spacing.base, gap: spacing.md, paddingBottom: spacing['4xl'] * 2 },
  loading: { paddingVertical: spacing['3xl'], alignItems: 'center' },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    height: 46,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
  },
  row: { flexDirection: 'row', gap: spacing.md },
  segments: { flexDirection: 'row', gap: spacing.sm },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  preview: {
    marginTop: spacing.base,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  removeButton: { height: 46, width: 32, alignItems: 'center', justifyContent: 'center' },
});
