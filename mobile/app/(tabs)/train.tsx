import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { workouts, type PlanDay } from '../../src/api/befit';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { Checkbox } from '../../src/components/Checkbox';
import { Icon } from '../../src/components/Icon';
import { Text } from '../../src/components/Text';
import { radius, semantic, series, spacing, useTheme } from '../../src/theme';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DURATIONS = [20, 30, 45, 60, 90];

/** JS getDay() is Sunday-first; the plan is Monday-first. */
function todayIndex() {
  return (new Date().getDay() + 6) % 7;
}

function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * "3 × 12–15 · light" → 3 sets of "12-15".
 *
 * `timed` marks a prescription with no sets-and-reps shape at all — "Elliptical
 * 20 min · easy pace". Those get a plain tick rather than a stepper, because
 * asking how many sets of an elliptical she did is a question with no answer.
 */
function parsePrescription(prescription: string): {
  sets: number;
  reps: string;
  timed: boolean;
} {
  const sets = prescription.match(/(\d+)\s*[×x]/);
  const reps = prescription.match(/[×x]\s*([\d]+(?:\s*[–-]\s*\d+)?)/);
  if (!sets) return { sets: 1, reps: '', timed: true };
  return {
    sets: Number(sets[1]),
    reps: reps ? reps[1].replace(/\s+/g, '') : '12',
    timed: false,
  };
}

type Entry = {
  checked: boolean;
  sets: number;
  reps: string;
  weight: string;
  timed: boolean;
};

export default function TrainTab() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState(todayIndex());
  const [editingVideo, setEditingVideo] = useState(false);
  const [draftUrl, setDraftUrl] = useState('');

  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [videoDone, setVideoDone] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);

  const week = useQuery({ queryKey: ['week'], queryFn: () => workouts.week() });
  const session = useQuery({
    queryKey: ['session', todayISO()],
    queryFn: () => workouts.session(),
  });
  const progress = useQuery({
    queryKey: ['workout-progress'],
    queryFn: () => workouts.progress(90),
  });

  const day: PlanDay | undefined = week.data?.days.find((d) => d.weekday === selected);
  const isToday = selected === todayIndex();

  // Restore whatever was already ticked today, so closing the app mid-session
  // doesn't lose the session.
  useEffect(() => {
    if (!day || !isToday || !session.isSuccess) return;
    // Keyed on the day alone, not on `dataUpdatedAt`. Queries refetch on window
    // focus, and re-seeding from the server there would silently discard ticks
    // she has made but not yet saved with "Finish session".
    const key = `${todayISO()}-${day.weekday}`;
    if (hydratedFor === key) return;

    const logged = new Map(
      (session.data?.completed ?? []).map((item) => [item.name, item]),
    );
    const next: Record<string, Entry> = {};
    for (const exercise of day.exercises) {
      const base = parsePrescription(exercise.prescription);
      const done = logged.get(exercise.name);
      next[exercise.name] = {
        checked: !!done,
        sets: done?.sets_done || base.sets,
        reps: done?.reps || base.reps,
        weight: done?.weight_kg != null ? String(done.weight_kg) : '',
        timed: base.timed,
      };
    }
    setEntries(next);
    setVideoDone(session.data?.video_done ?? false);
    setDuration(session.data?.duration_minutes ?? null);
    setHydratedFor(key);
  }, [day, isToday, session.isSuccess, session.data, hydratedFor]);

  const saveVideo = useMutation({
    mutationFn: () => workouts.updateVideo(selected, draftUrl.trim()),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['week'] });
      setEditingVideo(false);
      setDraftUrl('');
    },
  });

  const createPlan = useMutation({
    mutationFn: (fromTemplate: boolean) => workouts.createPlan(fromTemplate),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['week'] }),
  });

  const finish = useMutation({
    mutationFn: () =>
      workouts.logSession({
        completed: Object.entries(entries)
          .filter(([, entry]) => entry.checked)
          .map(([name, entry]) => ({
            name,
            // A timed entry has no meaningful set count; recording 1 keeps it
            // out of the volume maths rather than inflating it.
            sets_done: entry.timed ? 1 : entry.sets,
            reps: entry.timed ? null : entry.reps || null,
            weight_kg: entry.timed || !entry.weight ? null : Number(entry.weight),
          })),
        video_done: videoDone,
        cardio_minutes: 0,
        duration_minutes: duration,
      }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['session', todayISO()] }),
        queryClient.invalidateQueries({ queryKey: ['workout-progress'] }),
      ]),
  });

  const doneCount = Object.values(entries).filter((entry) => entry.checked).length;
  const totalCount = day?.exercises.length ?? 0;

  const setEntry = (name: string, patch: Partial<Entry>) =>
    setEntries((current) => ({ ...current, [name]: { ...current[name], ...patch } }));

  const stats = progress.data;
  const savedKcal = session.data?.kcal_burned ?? 0;

  return (
    <ScrollView
      style={{ backgroundColor: theme.canvas }}
      contentContainerStyle={[
        styles.page,
        { paddingTop: insets.top + spacing.md, paddingBottom: spacing['4xl'] * 2 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Text variant="h1">Train</Text>

      {stats ? (
        <Pressable
          onPress={() => router.push('/progress')}
          accessibilityRole="button"
          accessibilityLabel="Open your progress"
          style={({ pressed }) => [pressed && { opacity: 0.8 }]}
        >
          <Card style={styles.progressStrip}>
            <View
              style={[
                styles.flame,
                {
                  backgroundColor:
                    stats.streak_days > 0 ? series.workout + '1F' : theme.surfaceSunken,
                },
              ]}
            >
              <Icon
                name="flame"
                size={19}
                color={stats.streak_days > 0 ? series.workout : theme.textMuted}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text variant="caption" tone="muted" style={{ fontSize: 9.5 }}>
                Your progress
              </Text>
              <Text variant="smallMedium" tabular style={{ marginTop: 1 }}>
                {stats.streak_days}-day streak ·{' '}
                {stats.this_week.sessions}/{stats.this_week.planned} this week
              </Text>
            </View>

            <Text variant="small" tone="muted" tabular>
              {Math.round(stats.this_week.kcal)} kcal
            </Text>
            <Icon name="chevronRight" size={17} color={theme.textMuted} />
          </Card>
        </Pressable>
      ) : null}

      {week.data && !week.data.has_plan ? (
        <NoPlan
          example={week.data.example_day}
          onCreate={(fromTemplate) => createPlan.mutate(fromTemplate)}
          pending={createPlan.isPending}
          variables={createPlan.variables}
          error={createPlan.isError ? (createPlan.error as Error).message : null}
        />
      ) : null}

      {week.data?.has_plan ? (
        <View style={styles.rail}>
          {DAY_LABELS.map((label, index) => {
            const active = index === selected;
            const dayData = week.data?.days.find((d) => d.weekday === index);
            return (
              <Pressable
                key={label}
                onPress={() => {
                  setSelected(index);
                  setEditingVideo(false);
                }}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? theme.primary : theme.surface,
                    borderColor: active ? theme.primary : theme.border,
                  },
                ]}
              >
                <Text
                  variant="caption"
                  tone={active ? 'inverse' : 'secondary'}
                  style={{ fontSize: 11 }}
                >
                  {label}
                </Text>
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor: dayData?.is_rest
                        ? theme.textMuted
                        : dayData?.is_veg
                          ? semantic.success
                          : active
                            ? theme.onPrimary
                            : theme.borderStrong,
                    },
                  ]}
                />
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {week.isError ? (
        <Card variant="tinted">
          <Text variant="small" tone="secondary">
            {(week.error as Error).message}
          </Text>
        </Card>
      ) : null}

      {day ? (
        <>
          <View style={styles.dayHeader}>
            <View style={styles.headerRow}>
              <View style={styles.tagRow}>
                {isToday ? (
                  <View style={[styles.tag, { backgroundColor: theme.primarySoft }]}>
                    <Text variant="caption" tone="primary" style={{ fontSize: 9 }}>
                      Today
                    </Text>
                  </View>
                ) : null}
                {day.is_veg ? (
                  <View style={[styles.tag, { backgroundColor: theme.surfaceSunken }]}>
                    <Text variant="caption" style={{ color: semantic.success, fontSize: 9 }}>
                      Vegetarian
                    </Text>
                  </View>
                ) : null}
              </View>

              <Pressable
                onPress={() => router.push(`/workout-edit?weekday=${selected}`)}
                hitSlop={10}
                style={styles.editLink}
              >
                <Icon name="edit" size={15} color={theme.primary} />
                <Text variant="smallMedium" tone="primary">
                  Edit
                </Text>
              </Pressable>
            </View>

            <Text variant="display" style={{ marginTop: spacing.sm }}>
              {day.focus}
            </Text>
            {day.summary ? (
              <Text variant="body" tone="secondary" style={{ marginTop: spacing.sm }}>
                {day.summary}
              </Text>
            ) : null}
          </View>

          {!day.is_rest ? (
            <>
              <Card padded={false}>
                <View style={styles.sectionHeader}>
                  <Text variant="caption" tone="muted">
                    Machines &amp; weights
                  </Text>
                  {isToday && totalCount > 0 ? (
                    <Text variant="small" tone="secondary" tabular>
                      {doneCount}/{totalCount} done
                    </Text>
                  ) : (
                    <Text variant="caption" tone="muted">
                      25 min
                    </Text>
                  )}
                </View>

                {day.exercises.map((exercise, index) => {
                  const entry = entries[exercise.name];
                  const checked = isToday && !!entry?.checked;

                  return (
                    <View
                      key={exercise.name}
                      style={[
                        styles.exercise,
                        index > 0 && {
                          borderTopWidth: StyleSheet.hairlineWidth,
                          borderTopColor: theme.border,
                        },
                      ]}
                    >
                      <View style={styles.exerciseRow}>
                        {isToday ? (
                          <Checkbox
                            checked={checked}
                            onToggle={() =>
                              setEntry(exercise.name, { checked: !checked })
                            }
                            label={exercise.name}
                            size={25}
                            shape="square"
                          />
                        ) : null}

                        <View style={{ flex: 1 }}>
                          <Text
                            variant="bodyMedium"
                            style={checked ? { color: theme.textMuted } : undefined}
                          >
                            {exercise.name}
                          </Text>
                          <Text variant="small" tone="muted" tabular>
                            {exercise.prescription}
                          </Text>
                        </View>
                      </View>

                      {checked && !entry.timed ? (
                        <View style={styles.logRow}>
                          <Stepper
                            label="sets"
                            value={entry.sets}
                            onChange={(sets) => setEntry(exercise.name, { sets })}
                          />
                          <View style={[styles.weightBox, { borderColor: theme.border }]}>
                            <TextInput
                              value={entry.weight}
                              onChangeText={(weight) =>
                                setEntry(exercise.name, {
                                  weight: weight.replace(/[^\d.]/g, ''),
                                })
                              }
                              placeholder="—"
                              placeholderTextColor={theme.textMuted}
                              keyboardType="decimal-pad"
                              style={[styles.weightInput, { color: theme.text }]}
                            />
                            <Text variant="small" tone="muted">
                              kg
                            </Text>
                          </View>
                          {entry.reps ? (
                            <Text variant="small" tone="muted" tabular>
                              × {entry.reps}
                            </Text>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </Card>

              <Card>
                <View style={styles.sectionHeaderFlat}>
                  <Text variant="caption" tone="muted">
                    Follow-along video · 30 min
                  </Text>
                  <Pressable
                    onPress={() => {
                      setEditingVideo((value) => !value);
                      setDraftUrl(day.video_url ?? '');
                    }}
                    hitSlop={10}
                  >
                    <Text variant="caption" tone="primary">
                      {editingVideo ? 'Cancel' : 'Edit'}
                    </Text>
                  </Pressable>
                </View>

                {editingVideo ? (
                  <View style={{ gap: spacing.md, marginTop: spacing.md }}>
                    <TextInput
                      value={draftUrl}
                      onChangeText={setDraftUrl}
                      placeholder="https://www.youtube.com/watch?v=…"
                      placeholderTextColor={theme.textMuted}
                      autoCapitalize="none"
                      style={[
                        styles.input,
                        {
                          backgroundColor: theme.surfaceSunken,
                          borderColor: theme.border,
                          color: theme.text,
                        },
                      ]}
                    />
                    <Button
                      label="Save video"
                      size="sm"
                      onPress={() => saveVideo.mutate()}
                      loading={saveVideo.isPending}
                      disabled={!draftUrl.trim().startsWith('http')}
                    />
                    {saveVideo.isError ? (
                      <Text variant="small" style={{ color: semantic.danger }}>
                        {(saveVideo.error as Error).message}
                      </Text>
                    ) : null}
                  </View>
                ) : day.video_url ? (
                  <>
                    <Pressable
                      onPress={() => Linking.openURL(day.video_url!).catch(() => {})}
                      style={({ pressed }) => [
                        styles.video,
                        {
                          backgroundColor: theme.primarySoft,
                          borderColor: theme.primarySoftBorder,
                        },
                        pressed && { opacity: 0.8 },
                      ]}
                    >
                      <View style={[styles.play, { backgroundColor: theme.primary }]}>
                        <Text variant="small" tone="inverse">
                          ▶
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text variant="smallMedium" numberOfLines={2}>
                          {day.video_title ?? 'Open video'}
                        </Text>
                        <Text variant="small" tone="muted">
                          {day.video_channel ?? ''}
                        </Text>
                      </View>
                    </Pressable>

                    {isToday ? (
                      <Pressable
                        onPress={() => setVideoDone((value) => !value)}
                        style={styles.videoDone}
                      >
                        <Checkbox
                          checked={videoDone}
                          onToggle={() => setVideoDone((value) => !value)}
                          label="Video done"
                          size={22}
                          shape="square"
                        />
                        <Text variant="small" tone={videoDone ? 'secondary' : 'muted'}>
                          I finished the video
                        </Text>
                      </Pressable>
                    ) : null}
                  </>
                ) : (
                  <Text variant="small" tone="muted" style={{ marginTop: spacing.md }}>
                    No video set for this day.
                  </Text>
                )}
              </Card>

              {isToday ? (
                <Card>
                  <Text variant="caption" tone="muted">
                    How long did it take?
                  </Text>
                  <View style={styles.durations}>
                    {DURATIONS.map((minutes) => {
                      const active = duration === minutes;
                      return (
                        <Pressable
                          key={minutes}
                          onPress={() => setDuration(active ? null : minutes)}
                          style={[
                            styles.durationChip,
                            {
                              backgroundColor: active ? theme.primary : theme.surfaceSunken,
                              borderColor: active ? theme.primary : theme.border,
                            },
                          ]}
                        >
                          <Text
                            variant="caption"
                            tone={active ? 'inverse' : 'secondary'}
                            tabular
                          >
                            {minutes}m
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Button
                    label={
                      finish.isSuccess || session.data
                        ? 'Update session'
                        : 'Finish session'
                    }
                    onPress={() => finish.mutate()}
                    loading={finish.isPending}
                    disabled={doneCount === 0 && !videoDone}
                    fullWidth
                    style={{ marginTop: spacing.base }}
                  />

                  {savedKcal > 0 ? (
                    <Text
                      variant="small"
                      tone="secondary"
                      center
                      tabular
                      style={{ marginTop: spacing.md }}
                    >
                      Logged · about {Math.round(savedKcal)} kcal burned
                    </Text>
                  ) : null}
                  <Text
                    variant="small"
                    tone="muted"
                    center
                    style={{ marginTop: spacing.xs, fontSize: 11.5 }}
                  >
                    Burn is tracked for progress, not added to your food budget
                  </Text>

                  {finish.isError ? (
                    <Text
                      variant="small"
                      center
                      style={{ color: semantic.danger, marginTop: spacing.sm }}
                    >
                      {(finish.error as Error).message}
                    </Text>
                  ) : null}
                </Card>
              ) : null}

              <Card padded={false}>
                <View style={styles.sectionHeader}>
                  <Text variant="caption" tone="muted">
                    Full session
                  </Text>
                </View>
                {(week.data?.session_blocks ?? []).map((block, index) => (
                  <View
                    key={block.title}
                    style={[
                      styles.block,
                      index > 0 && {
                        borderTopWidth: StyleSheet.hairlineWidth,
                        borderTopColor: theme.border,
                      },
                    ]}
                  >
                    <View style={[styles.minutes, { backgroundColor: theme.surfaceSunken }]}>
                      <Text variant="caption" tone="primary" tabular style={{ fontSize: 10 }}>
                        {block.minutes}m
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text variant="smallMedium">{block.title}</Text>
                      {block.note ? (
                        <Text variant="small" tone="muted" style={{ marginTop: 2 }}>
                          {block.note}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </Card>

              {week.data?.easy_day_video ? (
                <Pressable
                  onPress={() =>
                    Linking.openURL(week.data!.easy_day_video.url).catch(() => {})
                  }
                >
                  <Card variant="tinted">
                    <Text variant="smallMedium" tone="primary">
                      Low on energy today?
                    </Text>
                    <Text variant="small" tone="secondary" style={{ marginTop: spacing.xs }}>
                      Swap in {week.data.easy_day_video.title} instead. You keep the habit
                      and the steps at a fraction of the recovery cost — going easy is part
                      of the plan, not a failure of it.
                    </Text>
                  </Card>
                </Pressable>
              ) : null}
            </>
          ) : (
            <Card variant="tinted">
              <Text variant="smallMedium" tone="primary">
                Rest properly
              </Text>
              <Text variant="small" tone="secondary" style={{ marginTop: spacing.xs }}>
                Rest is not lost progress — it is when your body adapts to the six days
                before it. It won't break your streak either.
              </Text>
            </Card>
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

function Stepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.stepper, { borderColor: theme.border }]}>
      <Pressable
        onPress={() => onChange(Math.max(1, value - 1))}
        style={styles.stepButton}
        hitSlop={4}
      >
        <Text variant="bodyMedium" tone="secondary">
          −
        </Text>
      </Pressable>
      <Text variant="small" tabular style={styles.stepValue}>
        {value} {label}
      </Text>
      <Pressable
        onPress={() => onChange(Math.min(20, value + 1))}
        style={styles.stepButton}
        hitSlop={4}
      >
        <Text variant="bodyMedium" tone="secondary">
          +
        </Text>
      </Pressable>
    </View>
  );
}

function NoPlan({
  example,
  onCreate,
  pending,
  variables,
  error,
}: {
  example: { focus: string; summary: string; exercises: { name: string; prescription: string }[] } | null;
  onCreate: (fromTemplate: boolean) => void;
  pending: boolean;
  variables: boolean | undefined;
  error: string | null;
}) {
  const theme = useTheme();

  return (
    <>
      <Card variant="tinted">
        <Text variant="smallMedium" tone="primary">
          No training plan yet
        </Text>
        <Text variant="small" tone="secondary" style={{ marginTop: spacing.xs }}>
          A plan is one focus per day with the machines to use and a video to follow.
          Here's what a day looks like:
        </Text>
      </Card>

      {example ? (
        <Card padded={false}>
          <View style={styles.sectionHeader}>
            <Text variant="caption" tone="muted">
              {example.focus}
            </Text>
          </View>
          {example.exercises.map((exercise, index) => (
            <View
              key={exercise.name}
              style={[
                styles.exercise,
                index > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: theme.border,
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text variant="bodyMedium">{exercise.name}</Text>
                <Text variant="small" tone="muted" tabular>
                  {exercise.prescription}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      <Button
        label="Add a plan for me"
        onPress={() => onCreate(true)}
        loading={pending && variables === true}
        fullWidth
      />
      <Button
        label="Start from an empty week"
        variant="secondary"
        onPress={() => onCreate(false)}
        loading={pending && variables === false}
        fullWidth
      />
      {error ? (
        <Text variant="small" style={{ color: semantic.danger }}>
          {error}
        </Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: spacing.base, gap: spacing.md },
  progressStrip: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flame: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rail: { flexDirection: 'row', gap: spacing.xs + 2 },
  chip: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  dot: { width: 5, height: 5, borderRadius: radius.pill },
  dayHeader: { paddingTop: spacing.sm },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tagRow: { flexDirection: 'row', gap: spacing.sm },
  tag: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: 5 },
  editLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 1 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.base,
    paddingBottom: spacing.md,
  },
  sectionHeaderFlat: { flexDirection: 'row', justifyContent: 'space-between' },
  exercise: { paddingHorizontal: spacing.base, paddingVertical: spacing.md },
  exerciseRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    paddingLeft: 37,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.sm },
  stepButton: { width: 30, height: 32, alignItems: 'center', justifyContent: 'center' },
  stepValue: { minWidth: 44, textAlign: 'center' },
  weightBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    height: 34,
  },
  weightInput: {
    width: 38,
    textAlign: 'right',
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  videoDone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  durations: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  durationChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  video: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  play: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  block: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  minutes: {
    minWidth: 38,
    alignItems: 'center',
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  input: {
    height: 46,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
  },
});
