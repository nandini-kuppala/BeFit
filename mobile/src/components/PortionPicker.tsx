import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import type { Portion } from '../api/types';
import {
  defaultQuantity,
  formatQuantity,
  isMeasured,
  minFor,
  parseQuantity,
  stepFor,
} from '../lib/portions';
import { radius, spacing, useTheme } from '../theme';
import { Icon } from './Icon';
import { Text } from './Text';

type PortionPickerProps = {
  portions: Portion[];
  portionKey: string;
  quantity: number;
  onChange: (next: { quantity: number; portionKey: string }) => void;
  /** Hide the fraction shortcuts (used in tight rows). */
  compact?: boolean;
};

const FRACTIONS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3];
const GRAM_PRESETS = [25, 50, 100, 150, 200, 250];

/**
 * How much, in what.
 *
 * The unit row lists every portion the food can be logged in — its own count
 * noun first ("idli"), then katori, cup, spoon, grams. Quantity takes typed
 * values ("1/2" works), a stepper, or one-tap fractions. Changing unit resets
 * the quantity to a sensible start (1 of a piece, 100 of grams) rather than
 * carrying "2" across from "2 idli" into "2 g".
 */
export function PortionPicker({ portions, portionKey, quantity, onChange, compact }: PortionPickerProps) {
  const theme = useTheme();
  const portion = portions.find((p) => p.key === portionKey) ?? portions[0];
  const [text, setText] = useState(formatQuantity(quantity));

  useEffect(() => {
    // Keep the field in step with outside changes (stepper, chips, unit switch)
    // without fighting the user while they type.
    if (parseQuantity(text) !== quantity) setText(formatQuantity(quantity));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quantity]);

  const step = stepFor(portion);
  const min = minFor(portion);
  const set = (value: number) =>
    onChange({ quantity: Math.max(min, Math.round(value * 100) / 100), portionKey: portion.key });

  const presets = isMeasured(portion) ? GRAM_PRESETS : FRACTIONS;

  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.row}>
        <View style={[styles.stepper, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <Pressable
            onPress={() => set(quantity - step)}
            style={styles.stepButton}
            accessibilityRole="button"
            accessibilityLabel="Less"
            hitSlop={6}
          >
            <Icon name="minus" size={18} color={theme.textSecondary} />
          </Pressable>
          <TextInput
            value={text}
            onChangeText={(value) => {
              setText(value);
              const parsed = parseQuantity(value);
              if (parsed !== null) onChange({ quantity: parsed, portionKey: portion.key });
            }}
            onBlur={() => setText(formatQuantity(quantity))}
            keyboardType="decimal-pad"
            selectTextOnFocus
            style={[styles.quantityInput, { color: theme.text }]}
            accessibilityLabel="Quantity"
          />
          <Pressable
            onPress={() => set(quantity + step)}
            style={styles.stepButton}
            accessibilityRole="button"
            accessibilityLabel="More"
            hitSlop={6}
          >
            <Icon name="plus" size={18} color={theme.textSecondary} />
          </Pressable>
        </View>
        <Text variant="bodyMedium" numberOfLines={1} style={{ flex: 1 }}>
          {portion.label.replace(/^1\s+/, '')}
          {!isMeasured(portion) ? (
            <Text variant="small" tone="muted">
              {'  '}≈ {Math.round(portion.grams * quantity)} g
            </Text>
          ) : null}
        </Text>
      </View>

      {!compact ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {presets.map((value) => {
            const active = Math.abs(value - quantity) < 0.001;
            return (
              <Pressable
                key={value}
                onPress={() => set(value)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? theme.primarySoft : theme.surfaceSunken,
                    borderColor: active ? theme.primary : 'transparent',
                  },
                ]}
              >
                <Text variant="smallMedium" tone={active ? 'primary' : 'secondary'}>
                  {formatQuantity(value)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {portions.map((option) => {
          const active = option.key === portion.key;
          return (
            <Pressable
              key={option.key}
              onPress={() =>
                onChange({ quantity: active ? quantity : defaultQuantity(option), portionKey: option.key })
              }
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[
                styles.unitChip,
                {
                  backgroundColor: active ? theme.primary : theme.surface,
                  borderColor: active ? theme.primary : theme.border,
                },
              ]}
            >
              <Text variant="smallMedium" tone={active ? 'inverse' : 'default'}>
                {option.label.replace(/^1\s+/, '')}
              </Text>
              {!isMeasured(option) ? (
                <Text variant="small" tone={active ? 'inverse' : 'muted'} style={{ fontSize: 11 }}>
                  {Math.round(option.grams)} g
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    height: 48,
  },
  stepButton: { width: 44, height: 48, alignItems: 'center', justifyContent: 'center' },
  quantityInput: {
    minWidth: 56,
    textAlign: 'center',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 20,
    paddingVertical: 0,
  },
  chips: { gap: spacing.sm, paddingRight: spacing.base },
  chip: {
    minWidth: 44,
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  unitChip: {
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    minWidth: 64,
  },
});
