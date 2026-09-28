import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { workouts, type WorkoutDayBody } from '../src/api/befit';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { Icon } from '../src/components/Icon';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Text } from '../src/components/Text';
import { radius, semantic, spacing, useTheme } from '../src/theme';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type Row = { name: string; prescription: string };

export default function WorkoutEdit() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ weekday?: string }>();

  const initial = Number(params.weekday);
  const [weekday, setWeekday] = useState(
    Number.isInteger(initial) && initial >= 0 && initial <= 6
      ? initial
      : (new Date().getDay() + 6) % 7,
  );

  const [focus, setFocus] = useState('');
  const [summary, setSummary] = useState('');
  const [isRest, setIsRest] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [dirty, setDirty] = useState(false);
  const [loadedDay, setLoadedDay] = useState<number | null>(null);

  const week = useQuery({ queryKey: ['week'], queryFn: () => workouts.week() });
  const day = week.data?.days.find((d) => d.weekday === weekday);

  // Seeds the form once per day. Keying this on the query's `dataUpdatedAt`
  // would wipe unsaved edits every time the query refetched on window focus.
  useEffect(() => {
    if (!day || loadedDay === day.weekday) return;
    setFocus(day.focus);
    setSummary(day.summary);
    setIsRest(day.is_rest);
    setRows(day.exercises.map((item) => ({ ...item })));
    setDirty(false);
    setLoadedDay(day.weekday);
  }, [day, loadedDay]);

  const save = useMutation({
    mutationFn: () => {
      const body: WorkoutDayBody = {
        focus: focus.trim() || 'Training',
        summary: summary.trim(),
        is_rest: isRest,
        exercises: rows
          .filter((row) => row.name.trim())
          .map((row) => ({ name: row.name.trim(), prescription: row.prescription.trim() })),
      };
      return workouts.replaceDay(weekday, body);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['week'] });
      setDirty(false);
    },
  });

  const copy = useMutation({
    mutationFn: (from: number) => workouts.copyDay(weekday, from),
    onSuccess: async () => {
      // Re-seed the form from the copied day rather than leaving the old
      // exercises on screen.
      setLoadedDay(null);
      await queryClient.invalidateQueries({ queryKey: ['week'] });
    },
  });

  const touch = () => setDirty(true);

  const setRow = (index: number, patch: Partial<Row>) => {
    setRows((current) =>
      current.map((row, position) => (position === index ? { ...row, ...patch } : row)),
    );
    touch();
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    setRows((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    touch();
  };

  const offerCopy = () => {
    const others = DAY_NAMES.map((name, index) => ({ name, index })).filter(
      (entry) => entry.index !== weekday,
    );
    Alert.alert('Copy a day', `Replace ${DAY_NAMES[weekday]} with another day's session?`, [
      { text: 'Cancel', style: 'cancel' },
      ...others.slice(0, 5).map((entry) => ({
        text: entry.name,
        onPress: () => copy.mutate(entry.index),
      })),
    ]);
  };

  const switchDay = (index: number) => {
    if (dirty) {
      Alert.alert('Unsaved changes', 'Discard your edits to this day?', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => setWeekday(index) },
      ]);
      return;
    }
    setWeekday(index);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas }}>
      <ScreenHeader
        title="Edit workout"
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
                onPress={() => switchDay(index)}
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

        <Card>
          <Text variant="caption" tone="muted">
            Focus
          </Text>
          <TextInput
            value={focus}
            onChangeText={(value) => {
              setFocus(value);
              touch();
            }}
            placeholder="Lower body + glutes"
            placeholderTextColor={theme.textMuted}
            style={[
              styles.input,
              { backgroundColor: theme.surfaceSunken, borderColor: theme.border, color: theme.text },
            ]}
          />

          <Text variant="caption" tone="muted" style={{ marginTop: spacing.md }}>
            Summary
          </Text>
          <TextInput
            value={summary}
            onChangeText={(value) => {
              setSummary(value);
              touch();
            }}
            placeholder="What this session is for"
            placeholderTextColor={theme.textMuted}
            multiline
            style={[
              styles.input,
              styles.multiline,
              { backgroundColor: theme.surfaceSunken, borderColor: theme.border, color: theme.text },
            ]}
          />

          <View style={styles.toolbar}>
            <Pressable
              onPress={() => {
                setIsRest((value) => !value);
                touch();
              }}
              style={[
                styles.toggleChip,
                {
                  backgroundColor: isRest ? theme.primarySoft : theme.surface,
                  borderColor: isRest ? theme.primarySoftBorder : theme.border,
                },
              ]}
            >
              <Icon
                name={isRest ? 'check' : 'plus'}
                size={14}
                color={isRest ? theme.primary : theme.textMuted}
              />
              <Text variant="small" tone={isRest ? 'primary' : 'secondary'}>
                Rest day
              </Text>
            </Pressable>

            <Pressable onPress={offerCopy} style={[styles.toggleChip, { borderColor: theme.border }]}>
              <Icon name="copy" size={14} color={theme.textMuted} />
              <Text variant="small" tone="secondary">
                Copy a day
              </Text>
            </Pressable>
          </View>
        </Card>

        {!isRest ? (
          <>
            <Text variant="caption" tone="muted" style={{ paddingHorizontal: spacing.xs }}>
              Exercises
            </Text>

            {rows.map((row, index) => (
              <Card key={`row-${index}`} padded={false}>
                <View style={styles.exerciseRow}>
                  <View style={styles.reorder}>
                    <Pressable
                      onPress={() => move(index, -1)}
                      disabled={index === 0}
                      hitSlop={8}
                      accessibilityLabel="Move up"
                      style={[styles.arrowUp, index === 0 && { opacity: 0.25 }]}
                    >
                      <Icon name="chevronRight" size={15} color={theme.textMuted} strokeWidth={2.2} />
                    </Pressable>
                    <Pressable
                      onPress={() => move(index, 1)}
                      disabled={index === rows.length - 1}
                      hitSlop={8}
                      accessibilityLabel="Move down"
                      style={[
                        styles.arrowDown,
                        index === rows.length - 1 && { opacity: 0.25 },
                      ]}
                    >
                      <Icon name="chevronRight" size={15} color={theme.textMuted} strokeWidth={2.2} />
                    </Pressable>
                  </View>

                  <View style={{ flex: 1, gap: spacing.xs }}>
                    <TextInput
                      value={row.name}
                      onChangeText={(name) => setRow(index, { name })}
                      placeholder="Exercise name"
                      placeholderTextColor={theme.textMuted}
                      style={[styles.nameInput, { color: theme.text }]}
                    />
                    <TextInput
                      value={row.prescription}
                      onChangeText={(prescription) => setRow(index, { prescription })}
                      placeholder="3 × 12–15 · light"
                      placeholderTextColor={theme.textMuted}
                      style={[styles.prescriptionInput, { color: theme.textSecondary }]}
                    />
                  </View>

                  <Pressable
                    onPress={() => {
                      setRows((current) => current.filter((_, position) => position !== index));
                      touch();
                    }}
                    hitSlop={10}
                  >
                    <Icon name="trash" size={17} color={theme.textMuted} />
                  </Pressable>
                </View>
              </Card>
            ))}

            <Pressable
              onPress={() => {
                setRows((current) => [...current, { name: '', prescription: '' }]);
                touch();
              }}
              style={({ pressed }) => [
                styles.addRow,
                { borderColor: theme.borderStrong },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Icon name="plus" size={17} color={theme.primary} />
              <Text variant="smallMedium" tone="primary">
                Add an exercise
              </Text>
            </Pressable>
          </>
        ) : (
          <Card variant="tinted">
            <Text variant="small" tone="secondary">
              Marked as a rest day. It stays in your plan and won't break your streak.
            </Text>
          </Card>
        )}

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
  input: {
    height: 46,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
  },
  // Tall enough for the three lines a real summary runs to; anything shorter
  // clips its own first line and forces the field to scroll.
  multiline: { height: 104, paddingTop: spacing.md, textAlignVertical: 'top' },
  toolbar: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  toggleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  // Up/down arrows built from the chevron by rotation, so the icon set stays small.
  reorder: { gap: spacing.md },
  arrowUp: { transform: [{ rotate: '-90deg' }] },
  arrowDown: { transform: [{ rotate: '90deg' }] },
  // Android TextInputs carry generous default vertical padding, which turned a
  // two-line row into a 100px block. Trim the padding rather than pinning a
  // height — a fixed height clips the glyphs outright.
  nameInput: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    paddingVertical: 2,
  },
  prescriptionInput: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    paddingVertical: 2,
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
});
