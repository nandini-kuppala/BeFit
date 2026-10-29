import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { food } from '../src/api/befit';
import type { CustomFoodBody } from '../src/api/types';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { Icon } from '../src/components/Icon';
import { KeyboardScreen } from '../src/components/KeyboardScreen';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Text } from '../src/components/Text';
import { radius, semantic, spacing, useTheme } from '../src/theme';

type Basis = 'per100' | 'perServing';

const NUMERIC = /[^\d.]/g;
const BARCODE = /^\d{6,14}$/;
const MAX_EXTRA_PORTIONS = 4;

type PortionRow = { label: string; grams: string };

/** "idli" -> "1 idli", so the server reads it as one of them; "2 slices" stays. */
function portionLabel(label: string): string {
  const trimmed = label.trim();
  return /^\d/.test(trimmed) ? trimmed : `1 ${trimmed}`;
}

/**
 * Add a food by hand.
 *
 * The escape hatch for anything the lookup chain can't find, and the only
 * route that produces a `verified` entry — reading a packet is a better source
 * than any estimate the app could make.
 *
 * Packets state values per serving, not per 100 g. Making someone convert that
 * themselves is how wrong numbers get saved, so the form takes either basis.
 */
export default function NewFood() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    name?: string;
    barcode?: string;
    meal?: string;
    date?: string;
  }>();
  const barcode = params.barcode && BARCODE.test(params.barcode) ? params.barcode : null;
  const passthrough = `${params.meal ? `&meal=${params.meal}` : ''}${params.date ? `&date=${params.date}` : ''}`;

  const [name, setName] = useState(params.name ?? '');
  const [basis, setBasis] = useState<Basis>('per100');
  const [servingLabel, setServingLabel] = useState('');
  const [servingGrams, setServingGrams] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [fat, setFat] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fibre, setFibre] = useState('');
  const [sugar, setSugar] = useState('');
  const [isVeg, setIsVeg] = useState(true);
  const [extraPortions, setExtraPortions] = useState<PortionRow[]>([]);
  const [showMicros, setShowMicros] = useState(false);
  const [iron, setIron] = useState('');
  const [calcium, setCalcium] = useState('');
  const [sodium, setSodium] = useState('');

  const num = (value: string) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const grams = basis === 'per100' ? 100 : num(servingGrams);
  const validBasis = basis === 'per100' || grams > 0;
  const canSave = name.trim().length > 0 && num(kcal) > 0 && validBasis;

  const updatePortion = (index: number, patch: Partial<PortionRow>) =>
    setExtraPortions((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  // Half-filled rows are dropped rather than blocking the save.
  const filledPortions = extraPortions
    .filter((row) => row.label.trim() && num(row.grams) > 0 && num(row.grams) <= 3000)
    .map((row) => ({ label: portionLabel(row.label).slice(0, 40), grams: num(row.grams) }));

  const save = useMutation({
    mutationFn: () => {
      const body: CustomFoodBody = {
        name: name.trim(),
        basis_grams: grams,
        kcal: num(kcal),
        protein_g: num(protein),
        fat_g: num(fat),
        carbs_g: num(carbs),
        fibre_g: num(fibre),
        sugar_g: num(sugar),
        serving_label: servingLabel.trim(),
        serving_grams: basis === 'perServing' ? grams : null,
        is_veg: isVeg,
        extra_portions: filledPortions,
        barcode,
        iron_mg: num(iron),
        calcium_mg: num(calcium),
        sodium_mg: num(sodium),
      };
      return food.createCustom(body);
    },
    onSuccess: async (created) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['food-search'] }),
        queryClient.invalidateQueries({ queryKey: ['food-recent'] }),
      ]);
      // Straight into logging it — that's why she was adding it.
      router.dismissTo(`/food-add?foodId=${created.id}${passthrough}`);
    },
  });

  // Live per-100g preview, so a per-serving entry can be sanity-checked before
  // it is committed.
  const factor = grams > 0 ? 100 / grams : 0;
  const preview =
    basis === 'perServing' && grams > 0
      ? `${Math.round(num(kcal) * factor)} kcal · P${(num(protein) * factor).toFixed(1)} · F${(num(fat) * factor).toFixed(1)} · C${(num(carbs) * factor).toFixed(1)} per 100 g`
      : null;

  const inputStyle = [
    styles.input,
    { backgroundColor: theme.surfaceSunken, borderColor: theme.border, color: theme.text },
  ];

  const basisLabel = basis === 'per100' ? 'per 100 g' : 'per serving';

  return (
    <KeyboardScreen
      header={
        <ScreenHeader
          title="Add a food"
          subtitle="Saved as verified — you read the label"
          action={
            <Button
              label="Save"
              size="sm"
              onPress={() => save.mutate()}
              loading={save.isPending}
              disabled={!canSave}
            />
          }
        />
      }
      contentContainerStyle={styles.page}
    >
      {barcode ? (
        <Card variant="tinted" style={styles.barcodeNote}>
          <Icon name="barcode" size={20} color={theme.primaryInk} />
          <Text variant="small" tone="secondary" style={{ flex: 1 }}>
            Linked to barcode <Text variant="smallMedium">{barcode}</Text> — scanning this
            packet next time finds your entry.
          </Text>
        </Card>
      ) : null}

      <Card>
        <Field label="Name">
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Pumpkin seeds"
            placeholderTextColor={theme.textMuted}
            style={inputStyle}
            autoFocus={!params.name}
          />
        </Field>

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
                  onPress={() => setBasis(option.key)}
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
          <View style={styles.row}>
            <Field label="Serving name" style={{ flex: 1.4 }}>
              <TextInput
                value={servingLabel}
                onChangeText={setServingLabel}
                placeholder="1 tbsp"
                placeholderTextColor={theme.textMuted}
                style={inputStyle}
              />
            </Field>
            <Field label="Weight (g)" style={{ flex: 1 }}>
              <TextInput
                value={servingGrams}
                onChangeText={(v) => setServingGrams(v.replace(NUMERIC, ''))}
                placeholder="28"
                placeholderTextColor={theme.textMuted}
                keyboardType="decimal-pad"
                style={inputStyle}
              />
            </Field>
          </View>
        ) : null}
      </Card>

      <Card>
        <Text variant="caption" tone="muted">
          Nutrition {basisLabel}
        </Text>

        <View style={[styles.row, { marginTop: spacing.md }]}>
          <Field label="Calories" style={{ flex: 1 }}>
            <TextInput
              value={kcal}
              onChangeText={(v) => setKcal(v.replace(NUMERIC, ''))}
              placeholder="574"
              placeholderTextColor={theme.textMuted}
              keyboardType="decimal-pad"
              style={inputStyle}
            />
          </Field>
          <Field label="Protein (g)" style={{ flex: 1 }}>
            <TextInput
              value={protein}
              onChangeText={(v) => setProtein(v.replace(NUMERIC, ''))}
              placeholder="29.8"
              placeholderTextColor={theme.textMuted}
              keyboardType="decimal-pad"
              style={inputStyle}
            />
          </Field>
        </View>

        <View style={styles.row}>
          <Field label="Fat (g)" style={{ flex: 1 }}>
            <TextInput
              value={fat}
              onChangeText={(v) => setFat(v.replace(NUMERIC, ''))}
              placeholder="49"
              placeholderTextColor={theme.textMuted}
              keyboardType="decimal-pad"
              style={inputStyle}
            />
          </Field>
          <Field label="Carbs (g)" style={{ flex: 1 }}>
            <TextInput
              value={carbs}
              onChangeText={(v) => setCarbs(v.replace(NUMERIC, ''))}
              placeholder="14.7"
              placeholderTextColor={theme.textMuted}
              keyboardType="decimal-pad"
              style={inputStyle}
            />
          </Field>
        </View>

        <View style={styles.row}>
          <Field label="Fibre (g)" style={{ flex: 1 }}>
            <TextInput
              value={fibre}
              onChangeText={(v) => setFibre(v.replace(NUMERIC, ''))}
              placeholder="6"
              placeholderTextColor={theme.textMuted}
              keyboardType="decimal-pad"
              style={inputStyle}
            />
          </Field>
          <Field label="Sugar (g)" style={{ flex: 1 }}>
            <TextInput
              value={sugar}
              onChangeText={(v) => setSugar(v.replace(NUMERIC, ''))}
              placeholder="1.4"
              placeholderTextColor={theme.textMuted}
              keyboardType="decimal-pad"
              style={inputStyle}
            />
          </Field>
        </View>

        <Pressable
          onPress={() => setShowMicros((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showMicros }}
          style={styles.disclosure}
        >
          <Text variant="smallMedium" tone="primary">
            More nutrients
          </Text>
          <Text variant="small" tone="muted" style={{ flex: 1 }}>
            {' '}iron, calcium, sodium — optional
          </Text>
          <View style={{ transform: [{ rotate: showMicros ? '90deg' : '0deg' }] }}>
            <Icon name="chevronRight" size={16} color={theme.textMuted} />
          </View>
        </Pressable>

        {showMicros ? (
          <View style={styles.row}>
            <Field label="Iron (mg)" style={{ flex: 1 }}>
              <TextInput
                value={iron}
                onChangeText={(v) => setIron(v.replace(NUMERIC, ''))}
                placeholder="0"
                placeholderTextColor={theme.textMuted}
                keyboardType="decimal-pad"
                style={inputStyle}
              />
            </Field>
            <Field label="Calcium (mg)" style={{ flex: 1 }}>
              <TextInput
                value={calcium}
                onChangeText={(v) => setCalcium(v.replace(NUMERIC, ''))}
                placeholder="0"
                placeholderTextColor={theme.textMuted}
                keyboardType="decimal-pad"
                style={inputStyle}
              />
            </Field>
            <Field label="Sodium (mg)" style={{ flex: 1 }}>
              <TextInput
                value={sodium}
                onChangeText={(v) => setSodium(v.replace(NUMERIC, ''))}
                placeholder="0"
                placeholderTextColor={theme.textMuted}
                keyboardType="decimal-pad"
                style={inputStyle}
              />
            </Field>
          </View>
        ) : null}

        {preview ? (
          <View style={[styles.preview, { backgroundColor: theme.surfaceSunken }]}>
            <Text variant="small" tone="secondary" tabular>
              {preview}
            </Text>
          </View>
        ) : null}

        <Pressable onPress={() => setIsVeg((v) => !v)} style={styles.vegRow}>
          <View
            style={[
              styles.checkbox,
              {
                backgroundColor: isVeg ? semantic.success : 'transparent',
                borderColor: isVeg ? semantic.success : theme.borderStrong,
              },
            ]}
          />
          <Text variant="small" tone="secondary">
            Vegetarian
          </Text>
        </Pressable>
      </Card>

      <Card>
        <Text variant="caption" tone="muted">
          Other portions
        </Text>
        <Text variant="small" tone="secondary" style={{ marginTop: spacing.xs }}>
          Optional — how you'd actually eat it: 1 piece, 1 bar, 1 scoop.
        </Text>

        {extraPortions.map((row, index) => (
          <View key={index} style={[styles.row, { alignItems: 'flex-end' }]}>
            <Field label="Portion" style={{ flex: 1.4 }}>
              <TextInput
                value={row.label}
                onChangeText={(v) => updatePortion(index, { label: v })}
                placeholder="1 piece"
                placeholderTextColor={theme.textMuted}
                maxLength={38}
                style={inputStyle}
              />
            </Field>
            <Field label="Weight (g)" style={{ flex: 1 }}>
              <TextInput
                value={row.grams}
                onChangeText={(v) => updatePortion(index, { grams: v.replace(NUMERIC, '') })}
                placeholder="30"
                placeholderTextColor={theme.textMuted}
                keyboardType="decimal-pad"
                style={inputStyle}
              />
            </Field>
            <Pressable
              onPress={() => setExtraPortions((rows) => rows.filter((_, i) => i !== index))}
              accessibilityRole="button"
              accessibilityLabel="Remove portion"
              hitSlop={8}
              style={styles.removeButton}
            >
              <Icon name="close" size={18} color={theme.textMuted} />
            </Pressable>
          </View>
        ))}

        {extraPortions.length < MAX_EXTRA_PORTIONS ? (
          <Button
            label="Add a portion"
            variant="ghost"
            size="sm"
            icon={<Icon name="plus" size={16} color={theme.primaryInk} />}
            onPress={() => setExtraPortions((rows) => [...rows, { label: '', grams: '' }])}
            style={{ alignSelf: 'flex-start', marginTop: spacing.sm, paddingHorizontal: 0 }}
          />
        ) : null}
      </Card>

      {save.isError ? (
        <Text variant="small" style={{ color: semantic.danger }}>
          {(save.error as Error).message}
        </Text>
      ) : null}

      <Text variant="small" tone="muted">
        Entered foods are marked verified and rank above anything looked up
        automatically, so once you add it BeFit will use your numbers from then on.
      </Text>
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
  page: { padding: spacing.base, gap: spacing.md, paddingBottom: spacing['4xl'] * 2 },
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
  vegRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.base,
  },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.8 },
  barcodeNote: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  disclosure: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.base },
  removeButton: { height: 46, width: 32, alignItems: 'center', justifyContent: 'center' },
});
