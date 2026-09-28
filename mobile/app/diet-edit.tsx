import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { diet, type DietDayBody } from '../src/api/befit';
import { MEAL_LABELS, MEAL_ORDER, type Meal } from '../src/api/types';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { Icon } from '../src/components/Icon';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Text } from '../src/components/Text';
import { radius, semantic, spacing, useTheme } from '../src/theme';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * The editor shows the human label but remembers the storage key it came from.
 *
 * Deriving a key from the label on every save is lossy: "Mid-morning" round
 * trips to `mid-morning`, not `mid_morning`, which silently orphans the slot
 * from its entry in MEAL_TIMES. So an untouched label keeps its original key,
 * and only a genuinely renamed slot gets a freshly derived one.
 */
type Slot = { key: string | null; label: string; text: string };

function slotLabel(key: string) {
  return MEAL_LABELS[key as Meal] ?? key.replace(/_/g, ' ');
}

function slotKey(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

/** The original key if the label is still its own rendering, else a new one. */
function keyFor(slot: Slot) {
  if (slot.key && slotLabel(slot.key).toLowerCase() === slot.label.trim().toLowerCase()) {
    return slot.key;
  }
  return slotKey(slot.label);
}

export default function DietEdit() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ weekday?: string }>();

  const initial = Number(params.weekday);
  const [weekday, setWeekday] = useState(
    Number.isInteger(initial) && initial >= 0 && initial <= 6
      ? initial
      : (new Date().getDay() + 6) % 7,
  );

  const [slots, setSlots] = useState<Slot[]>([]);
  const [note, setNote] = useState('');
  const [isVeg, setIsVeg] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loadedDay, setLoadedDay] = useState<number | null>(null);

  const week = useQuery({ queryKey: ['diet-week'], queryFn: () => diet.week() });
  const day = week.data?.days.find((d) => d.weekday === weekday);

  // Seeds the form once per day. Keying this on the query's `dataUpdatedAt`
  // would wipe unsaved edits every time the query refetched on window focus.
  useEffect(() => {
    if (!day || loadedDay === day.weekday) return;
    setSlots(
      Object.entries(day.meals).map(([key, text]) => ({
        key,
        label: slotLabel(key),
        text,
      })),
    );
    setNote(day.note ?? '');
    setIsVeg(day.is_veg);
    setDirty(false);
    setLoadedDay(day.weekday);
  }, [day, loadedDay]);

  const save = useMutation({
    mutationFn: () => {
      const body: DietDayBody = {
        is_veg: isVeg,
        note: note.trim() || null,
        meals: slots
          .filter((slot) => slot.label.trim())
          .map((slot) => ({ key: keyFor(slot), text: slot.text.trim() })),
      };
      return diet.replaceDay(weekday, body);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['diet-week'] });
      setDirty(false);
    },
  });

  const copy = useMutation({
    mutationFn: (from: number) => diet.copyDay(weekday, from),
    onSuccess: async () => {
      // Re-seed the form from the copied day rather than leaving the old text
      // on screen.
      setLoadedDay(null);
      await queryClient.invalidateQueries({ queryKey: ['diet-week'] });
    },
  });

  const touch = () => setDirty(true);

  const setSlot = (index: number, patch: Partial<Slot>) => {
    setSlots((current) =>
      current.map((slot, position) => (position === index ? { ...slot, ...patch } : slot)),
    );
    touch();
  };

  const removeSlot = (index: number) => {
    setSlots((current) => current.filter((_, position) => position !== index));
    touch();
  };

  const addSlot = () => {
    // Offer the next standard meal she isn't using before inventing a name.
    const used = new Set(slots.map(keyFor));
    const next = MEAL_ORDER.find((meal) => !used.has(meal));
    setSlots((current) => [
      ...current,
      { key: next ?? null, label: next ? MEAL_LABELS[next] : '', text: '' },
    ]);
    touch();
  };

  const offerCopy = () => {
    const others = DAY_NAMES.map((name, index) => ({ name, index })).filter(
      (entry) => entry.index !== weekday,
    );
    Alert.alert(
      'Copy a day',
      `Replace ${DAY_NAMES[weekday]} with another day's meals?`,
      [
        { text: 'Cancel', style: 'cancel' },
        ...others.slice(0, 5).map((entry) => ({
          text: entry.name,
          onPress: () => copy.mutate(entry.index),
        })),
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas }}>
      <ScreenHeader
        title="Edit diet plan"
        subtitle={DAY_NAMES[weekday]}
        action={
          <Button
            label="Save"
            size="sm"
            onPress={() => save.mutate()}
            loading={save.isPending}
            disabled={!dirty}
          />
        }
      />

      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.rail}>
          {DAY_SHORT.map((label, index) => {
            const active = index === weekday;
            return (
              <Pressable
                key={label}
                onPress={() => {
                  if (dirty) {
                    Alert.alert('Unsaved changes', 'Discard your edits to this day?', [
                      { text: 'Keep editing', style: 'cancel' },
                      { text: 'Discard', style: 'destructive', onPress: () => setWeekday(index) },
                    ]);
                    return;
                  }
                  setWeekday(index);
                }}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? theme.primary : theme.surface,
                    borderColor: active ? theme.primary : theme.border,
                  },
                ]}
              >
                <Text variant="caption" tone={active ? 'inverse' : 'secondary'} style={{ fontSize: 11 }}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.toolbar}>
          <Pressable
            onPress={() => {
              setIsVeg((value) => !value);
              touch();
            }}
            style={[
              styles.toggleChip,
              {
                backgroundColor: isVeg ? theme.primarySoft : theme.surface,
                borderColor: isVeg ? theme.primarySoftBorder : theme.border,
              },
            ]}
          >
            <Icon
              name={isVeg ? 'check' : 'plus'}
              size={14}
              color={isVeg ? theme.primary : theme.textMuted}
            />
            <Text variant="small" tone={isVeg ? 'primary' : 'secondary'}>
              Vegetarian day
            </Text>
          </Pressable>

          <Pressable onPress={offerCopy} style={[styles.toggleChip, { borderColor: theme.border }]}>
            <Icon name="copy" size={14} color={theme.textMuted} />
            <Text variant="small" tone="secondary">
              Copy a day
            </Text>
          </Pressable>
        </View>

        {slots.map((slot, index) => (
          <Card key={`slot-${index}`} padded={false}>
            <View style={[styles.slotHeader, { borderBottomColor: theme.border }]}>
              <TextInput
                value={slot.label}
                onChangeText={(label) => setSlot(index, { label })}
                placeholder="Meal name"
                placeholderTextColor={theme.textMuted}
                style={[styles.keyInput, { color: theme.text }]}
              />
              <Pressable onPress={() => removeSlot(index)} hitSlop={10}>
                <Icon name="trash" size={17} color={theme.textMuted} />
              </Pressable>
            </View>
            <TextInput
              value={slot.text}
              onChangeText={(text) => setSlot(index, { text })}
              placeholder="What you eat at this meal"
              placeholderTextColor={theme.textMuted}
              multiline
              style={[styles.textArea, { color: theme.text }]}
            />
          </Card>
        ))}

        <Pressable
          onPress={addSlot}
          style={({ pressed }) => [
            styles.addRow,
            { borderColor: theme.borderStrong },
            pressed && { opacity: 0.6 },
          ]}
        >
          <Icon name="plus" size={17} color={theme.primary} />
          <Text variant="smallMedium" tone="primary">
            Add a meal
          </Text>
        </Pressable>

        <Card>
          <Text variant="caption" tone="muted">
            Prep note
          </Text>
          <TextInput
            value={note}
            onChangeText={(value) => {
              setNote(value);
              touch();
            }}
            placeholder="Boil eggs tonight, soak oats"
            placeholderTextColor={theme.textMuted}
            multiline
            style={[
              styles.noteInput,
              {
                backgroundColor: theme.surfaceSunken,
                borderColor: theme.border,
                color: theme.text,
              },
            ]}
          />
        </Card>

        {save.isError ? (
          <Text variant="small" style={{ color: semantic.danger }}>
            {(save.error as Error).message}
          </Text>
        ) : null}

        {dirty ? (
          <Button
            label="Save changes"
            onPress={() => save.mutate()}
            loading={save.isPending}
            fullWidth
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: spacing.base, gap: spacing.md, paddingBottom: spacing['4xl'] * 2 },
  rail: { flexDirection: 'row', gap: spacing.xs + 2 },
  chip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  toolbar: { flexDirection: 'row', gap: spacing.sm },
  toggleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  slotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  keyInput: {
    flex: 1,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    textTransform: 'capitalize',
  },
  textArea: {
    minHeight: 72,
    padding: spacing.base,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 20,
    textAlignVertical: 'top',
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.base,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  noteInput: {
    minHeight: 64,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    textAlignVertical: 'top',
  },
});
