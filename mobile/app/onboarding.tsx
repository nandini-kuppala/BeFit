import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
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

import { me } from '../src/api/befit';
import type { Targets } from '../src/api/types';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { Text } from '../src/components/Text';
import { useAuth } from '../src/store/auth';
import { radius, semantic, series, spacing, useTheme } from '../src/theme';

const ACTIVITY_LEVELS = [
  { factor: 1.375, title: 'Light', detail: 'Desk job, little exercise' },
  { factor: 1.55, title: 'Moderate', detail: 'Training 4–6 days a week' },
  { factor: 1.725, title: 'Very active', detail: 'Hard training, or on your feet all day' },
];

const CONDITIONS = [
  'Hypothyroidism',
  'PCOS',
  'Diabetes',
  'Hypertension',
  'Anaemia',
  'IBS',
];

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const STEPS = ['You', 'Body', 'Activity', 'Health', 'Routine'] as const;

export default function Onboarding() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const completeOnboarding = useAuth((s) => s.completeOnboarding);

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Targets | null>(null);

  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<'female' | 'male' | 'other'>('female');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [goalWeight, setGoalWeight] = useState('');
  const [activity, setActivity] = useState(1.55);
  const [conditions, setConditions] = useState<string[]>([]);
  const [medication, setMedication] = useState('');
  const [wake, setWake] = useState('06:30');
  const [sleep, setSleep] = useState('22:30');
  const [vegDays, setVegDays] = useState<number[]>([]);

  const thyroid = conditions.includes('Hypothyroidism');

  const canContinue = useMemo(() => {
    switch (step) {
      case 0:
        return name.trim().length > 0 && Number(age) >= 13 && Number(age) <= 100;
      case 1:
        return Number(height) > 80 && Number(weight) > 25 && Number(goalWeight) > 25;
      default:
        return true;
    }
  }, [step, name, age, height, weight, goalWeight]);

  function toggle<T>(list: T[], value: T, set: (next: T[]) => void) {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      const response = await me.onboard({
        name: name.trim(),
        sex,
        age: Number(age),
        height_cm: Number(height),
        weight_kg: Number(weight),
        goal_weight_kg: Number(goalWeight),
        activity_factor: activity,
        health_conditions: conditions.map((c) => ({ name: c })),
        medications: medication.trim()
          ? [
              {
                name: medication.trim(),
                dose: '',
                time: '06:30',
                // Levothyroxine needs 60 min from food and 4 h from calcium,
                // iron or soy protein. The dashboard turns this into a lockout.
                empty_stomach: thyroid,
                food_gap_minutes: thyroid ? 60 : 0,
                mineral_gap_minutes: thyroid ? 240 : 0,
              },
            ]
          : [],
        dietary_rules: { veg_days: vegDays, excluded_foods: [] },
        routine: { wake, sleep, gym_start: '07:00', gym_end: '09:00' },
      });
      setResult(response.targets);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = [
    styles.input,
    { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text },
  ];

  // ---- result screen -------------------------------------------------
  if (result) {
    return (
      <ScrollView
        style={{ backgroundColor: theme.canvas }}
        contentContainerStyle={[
          styles.page,
          { paddingTop: insets.top + spacing['2xl'], paddingBottom: insets.bottom + spacing.xl },
        ]}
      >
        <Text variant="caption" tone="primary">
          Your plan is ready
        </Text>
        <Text variant="display" style={{ marginTop: spacing.sm }}>
          {result.kcal.toLocaleString()} kcal a day
        </Text>
        <Text variant="body" tone="secondary" style={{ marginTop: spacing.sm }}>
          Losing about {result.rate_kg_per_week} kg a week. That is the pace that keeps
          muscle while the fat comes off.
        </Text>

        <Card style={{ marginTop: spacing.xl }}>
          <Text variant="caption" tone="muted">
            Daily targets
          </Text>
          <View style={styles.targetGrid}>
            {[
              { label: 'Protein', value: `${result.protein_g} g`, color: series.protein },
              { label: 'Carbs', value: `${result.carbs_g} g`, color: series.carbs },
              { label: 'Fat', value: `${result.fat_g} g`, color: series.fat },
              { label: 'Fibre', value: `${result.fibre_g} g`, color: series.fibre },
            ].map((item) => (
              <View key={item.label} style={styles.targetCell}>
                <View style={[styles.swatch, { backgroundColor: item.color }]} />
                <Text variant="h3" tabular>
                  {item.value}
                </Text>
                <Text variant="small" tone="muted">
                  {item.label}
                </Text>
              </View>
            ))}
          </View>
        </Card>

        <Card variant="tinted" style={{ marginTop: spacing.md }}>
          <Text variant="smallMedium" tone="primary">
            How this was worked out
          </Text>
          <Text variant="small" tone="secondary" style={{ marginTop: spacing.xs }}>
            Your BMR is {result.bmr_kcal} kcal and your maintenance is about{' '}
            {result.tdee_kcal} kcal. Treat that as a starting estimate — after three
            weeks of logging, BeFit compares it against your real weight trend and
            adjusts.
          </Text>
        </Card>

        {thyroid ? (
          <Card variant="tinted" style={{ marginTop: spacing.md }}>
            <Text variant="smallMedium" tone="primary">
              Thyroid-aware
            </Text>
            <Text variant="small" tone="secondary" style={{ marginTop: spacing.xs }}>
              Iodine is tracked as an upper limit, not a goal, and selenium is
              prioritised for T4→T3 conversion. Your morning tablet gets a food
              lockout window on the dashboard.
            </Text>
          </Card>
        ) : null}

        <Button
          label="Start tracking"
          size="lg"
          fullWidth
          style={{ marginTop: spacing.xl }}
          onPress={() => {
            completeOnboarding();
            router.replace('/(tabs)');
          }}
        />
      </ScrollView>
    );
  }

  // ---- wizard --------------------------------------------------------
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.canvas }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ paddingTop: insets.top + spacing.base, paddingHorizontal: spacing.xl }}>
        <View style={styles.progress}>
          {STEPS.map((label, index) => (
            <View
              key={label}
              style={[
                styles.progressBar,
                {
                  backgroundColor:
                    index <= step ? theme.primary : theme.surfaceSunken,
                },
              ]}
            />
          ))}
        </View>
        <Text variant="caption" tone="muted" style={{ marginTop: spacing.md }}>
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.page, { paddingBottom: spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        {step === 0 && (
          <>
            <Text variant="h1" style={styles.heading}>
              First, the basics
            </Text>
            <View style={styles.field}>
              <Text variant="caption" tone="muted">What should I call you?</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                placeholderTextColor={theme.textMuted}
                style={inputStyle}
              />
            </View>
            <View style={styles.field}>
              <Text variant="caption" tone="muted">Age</Text>
              <TextInput
                value={age}
                onChangeText={setAge}
                placeholder="21"
                placeholderTextColor={theme.textMuted}
                keyboardType="number-pad"
                style={inputStyle}
              />
            </View>
            <View style={styles.field}>
              <Text variant="caption" tone="muted">Sex</Text>
              <View style={styles.chipRow}>
                {(['female', 'male', 'other'] as const).map((value) => (
                  <Chip
                    key={value}
                    label={value[0].toUpperCase() + value.slice(1)}
                    selected={sex === value}
                    onPress={() => setSex(value)}
                  />
                ))}
              </View>
              <Text variant="small" tone="muted">
                Used for the BMR equation and iron targets — both differ meaningfully.
              </Text>
            </View>
          </>
        )}

        {step === 1 && (
          <>
            <Text variant="h1" style={styles.heading}>
              Where you are, where you're going
            </Text>
            <View style={styles.field}>
              <Text variant="caption" tone="muted">Height (cm)</Text>
              <TextInput
                value={height}
                onChangeText={setHeight}
                placeholder="158"
                placeholderTextColor={theme.textMuted}
                keyboardType="decimal-pad"
                style={inputStyle}
              />
            </View>
            <View style={styles.field}>
              <Text variant="caption" tone="muted">Current weight (kg)</Text>
              <TextInput
                value={weight}
                onChangeText={setWeight}
                placeholder="65"
                placeholderTextColor={theme.textMuted}
                keyboardType="decimal-pad"
                style={inputStyle}
              />
            </View>
            <View style={styles.field}>
              <Text variant="caption" tone="muted">Goal weight (kg)</Text>
              <TextInput
                value={goalWeight}
                onChangeText={setGoalWeight}
                placeholder="55"
                placeholderTextColor={theme.textMuted}
                keyboardType="decimal-pad"
                style={inputStyle}
              />
            </View>
          </>
        )}

        {step === 2 && (
          <>
            <Text variant="h1" style={styles.heading}>
              How active are you?
            </Text>
            <Text variant="body" tone="secondary" style={styles.sub}>
              Count everything — your commute and your job, not just the gym.
            </Text>
            <View style={{ gap: spacing.md }}>
              {ACTIVITY_LEVELS.map((level) => (
                <Pressable key={level.factor} onPress={() => setActivity(level.factor)}>
                  <Card
                    variant={activity === level.factor ? 'tinted' : 'flat'}
                    style={
                      activity === level.factor
                        ? { borderColor: theme.primary, borderWidth: 1.5 }
                        : undefined
                    }
                  >
                    <Text variant="h3">{level.title}</Text>
                    <Text variant="small" tone="secondary">
                      {level.detail}
                    </Text>
                  </Card>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {step === 3 && (
          <>
            <Text variant="h1" style={styles.heading}>
              Anything I should know about?
            </Text>
            <Text variant="body" tone="secondary" style={styles.sub}>
              This changes your nutrient targets and what the coach will and won't
              suggest. Skip if none apply.
            </Text>
            <View style={styles.chipRow}>
              {CONDITIONS.map((condition) => (
                <Chip
                  key={condition}
                  label={condition}
                  selected={conditions.includes(condition)}
                  onPress={() => toggle(conditions, condition, setConditions)}
                />
              ))}
            </View>

            <View style={[styles.field, { marginTop: spacing.lg }]}>
              <Text variant="caption" tone="muted">Daily medication (optional)</Text>
              <TextInput
                value={medication}
                onChangeText={setMedication}
                placeholder="e.g. Levothyroxine 100 mcg"
                placeholderTextColor={theme.textMuted}
                style={inputStyle}
              />
            </View>

            {thyroid ? (
              <Card variant="tinted">
                <Text variant="smallMedium" tone="primary">
                  One thing worth knowing
                </Text>
                <Text variant="small" tone="secondary" style={{ marginTop: spacing.xs }}>
                  Never take iodine or kelp supplements with autoimmune thyroid
                  disease — harm is documented from as little as 250 µg a day. BeFit
                  will track iodine as a ceiling and warn you if you go over.
                </Text>
              </Card>
            ) : null}
          </>
        )}

        {step === 4 && (
          <>
            <Text variant="h1" style={styles.heading}>
              Your day
            </Text>
            <View style={styles.row}>
              <View style={[styles.field, { flex: 1 }]}>
                <Text variant="caption" tone="muted">Wake up</Text>
                <TextInput
                  value={wake}
                  onChangeText={setWake}
                  placeholder="06:30"
                  placeholderTextColor={theme.textMuted}
                  style={inputStyle}
                />
              </View>
              <View style={[styles.field, { flex: 1 }]}>
                <Text variant="caption" tone="muted">Bed time</Text>
                <TextInput
                  value={sleep}
                  onChangeText={setSleep}
                  placeholder="22:30"
                  placeholderTextColor={theme.textMuted}
                  style={inputStyle}
                />
              </View>
            </View>

            <View style={[styles.field, { marginTop: spacing.base }]}>
              <Text variant="caption" tone="muted">Vegetarian days</Text>
              <View style={styles.chipRow}>
                {WEEKDAYS.map((day, index) => (
                  <Chip
                    key={day}
                    label={day}
                    selected={vegDays.includes(index)}
                    onPress={() => toggle(vegDays, index, setVegDays)}
                  />
                ))}
              </View>
              <Text variant="small" tone="muted">
                Meal suggestions respect these. Protein is the thing that slips on veg
                days, so BeFit watches it more closely.
              </Text>
            </View>
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
        {step > 0 ? (
          <Button
            label="Back"
            variant="secondary"
            onPress={() => setStep((s) => s - 1)}
            style={{ flex: 1 }}
          />
        ) : null}
        <Button
          label={step === STEPS.length - 1 ? 'Build my plan' : 'Continue'}
          onPress={() => (step === STEPS.length - 1 ? finish() : setStep((s) => s + 1))}
          disabled={!canContinue}
          loading={busy}
          style={{ flex: 2 }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? theme.primary : theme.surface,
          borderColor: selected ? theme.primary : theme.border,
        },
      ]}
    >
      <Text variant="smallMedium" tone={selected ? 'inverse' : 'default'}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.base },
  heading: { marginBottom: spacing.xs },
  sub: { marginBottom: spacing.sm },
  field: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md },
  input: {
    height: 52,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  progress: { flexDirection: 'row', gap: spacing.xs },
  progressBar: { flex: 1, height: 4, borderRadius: radius.pill },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.base,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  error: { padding: spacing.md, borderRadius: radius.sm },
  targetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.md,
    gap: spacing.base,
  },
  targetCell: { flexBasis: '40%', flexGrow: 1, gap: 2 },
  swatch: { width: 20, height: 3, borderRadius: radius.pill, marginBottom: spacing.xs },
});
