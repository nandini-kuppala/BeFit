import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Share,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { auth, me } from '../src/api/befit';
import type { ProfileResponse } from '../src/api/types';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { NavRow } from '../src/components/NavRow';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Text } from '../src/components/Text';
import { useAuth } from '../src/store/auth';
import { radius, semantic, spacing, useTheme } from '../src/theme';

const ACTIVITY_LEVELS = [
  { value: 1.2, label: 'Sedentary', sub: 'Desk job, little exercise' },
  { value: 1.375, label: 'Light', sub: '1–3 workouts a week' },
  { value: 1.55, label: 'Moderate', sub: '3–5 workouts a week' },
  { value: 1.725, label: 'Very active', sub: 'Hard training most days' },
] as const;

/**
 * Android's share sheet goes through a binder transaction capped near 1 MB,
 * so a long history is cut rather than crashing the share.
 */
const SHARE_LIMIT = 400_000;

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Try again.';

const sameFactor = (a: number, b: number) => Math.abs(a - b) < 0.001;

export default function Settings() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas }}>
      <ScreenHeader title="Settings" />

      <KeyboardAwareScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        bottomOffset={spacing.base}
      >
        <SectionLabel>Profile & targets</SectionLabel>
        <ProfileSection />

        <SectionLabel>Server</SectionLabel>
        <NavRow
          icon="settings"
          title="Server address"
          subtitle="Where BeFit looks for your data"
          onPress={() => router.push('/server')}
        />

        <SectionLabel>Your data</SectionLabel>
        <DataSection />

        <SectionLabel>About</SectionLabel>
        <NavRow
          icon="check"
          title="Privacy & disclaimer"
          subtitle="What's stored, who processes it"
          onPress={() => router.push('/privacy')}
        />
        <Text variant="small" tone="muted" center style={{ marginTop: spacing.sm }}>
          BeFit {Constants.expoConfig?.version ?? ''}
        </Text>
      </KeyboardAwareScrollView>
    </View>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text variant="caption" tone="muted" style={styles.sectionLabel}>
      {children}
    </Text>
  );
}

// ------------------------------------------------------------- profile

function ProfileSection() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: ['profile'], queryFn: () => me.profile() });

  const [goal, setGoal] = useState('');
  const [factor, setFactor] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Seed the form once the profile arrives, and again after a save.
  const current = profile.data?.profile;
  useEffect(() => {
    if (!current) return;
    setGoal(String(current.goal_weight_kg));
    setFactor(current.activity_factor);
  }, [current?.goal_weight_kg, current?.activity_factor]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshEverything = async (fresh?: ProfileResponse) => {
    if (fresh) queryClient.setQueryData(['profile'], fresh);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['profile'] }),
      queryClient.invalidateQueries({ queryKey: ['day'] }),
    ]);
  };

  const save = useMutation({
    mutationFn: (body: { goal_weight_kg: number; activity_factor: number }) =>
      me.updateProfile(body),
    onMutate: () => setNotice(null),
    onSuccess: async (fresh) => {
      // The PATCH recalculates targets server-side against the latest weight.
      await refreshEverything(fresh);
      setNotice(`Saved. Daily target is now ${Math.round(fresh.targets.kcal)} kcal.`);
    },
  });

  const recalc = useMutation({
    mutationFn: () => me.recalculateTargets(),
    onMutate: () => setNotice(null),
    onSuccess: async () => {
      await refreshEverything();
      setNotice('Targets recalculated from your latest weight.');
    },
  });

  if (profile.isPending) {
    return (
      <Card>
        <ActivityIndicator color={theme.primary} />
      </Card>
    );
  }
  if (!current) {
    return (
      <Card>
        <Text variant="small" style={{ color: semantic.danger }}>
          {profile.error ? errorText(profile.error) : "Couldn't load your profile."}
        </Text>
        <Button
          label="Try again"
          variant="secondary"
          size="sm"
          onPress={() => profile.refetch()}
          style={{ marginTop: spacing.md }}
        />
      </Card>
    );
  }

  const goalNumber = Number(goal.replace(',', '.'));
  const goalValid = goal.trim().length > 0 && Number.isFinite(goalNumber) && goalNumber > 25 && goalNumber < 300;
  const dirty =
    factor !== null &&
    (!goalValid || !sameFactor(goalNumber, current.goal_weight_kg) || !sameFactor(factor, current.activity_factor));
  const knownFactor = ACTIVITY_LEVELS.some((level) => factor !== null && sameFactor(level.value, factor));

  return (
    <Card>
      <View style={styles.facts}>
        <Fact label="Name" value={current.name} />
        <Fact label="Age" value={`${current.age}`} />
        <Fact label="Height" value={`${Math.round(current.height_cm)} cm`} />
      </View>
      <Text variant="small" tone="muted" style={{ marginTop: spacing.sm }}>
        Current weight comes from your weight log on the Body tab.
      </Text>

      <View style={[styles.divider, { backgroundColor: theme.border }]} />

      <Text variant="caption" tone="muted">
        Goal weight (kg)
      </Text>
      <TextInput
        value={goal}
        onChangeText={(value) => {
          setGoal(value);
          setNotice(null);
        }}
        keyboardType="decimal-pad"
        placeholder="55"
        placeholderTextColor={theme.textMuted}
        style={[
          styles.input,
          {
            backgroundColor: theme.surfaceSunken,
            borderColor: goal.length > 0 && !goalValid ? semantic.danger : theme.border,
            color: theme.text,
          },
        ]}
      />

      <Text variant="caption" tone="muted" style={{ marginTop: spacing.base }}>
        Activity level
      </Text>
      <View style={styles.choices}>
        {ACTIVITY_LEVELS.map((level) => {
          const active = factor !== null && sameFactor(level.value, factor);
          return (
            <Pressable
              key={level.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              onPress={() => {
                setFactor(level.value);
                setNotice(null);
              }}
              style={({ pressed }) => [
                styles.choice,
                {
                  borderColor: active ? theme.primary : theme.border,
                  backgroundColor: active ? theme.primarySoft : theme.surface,
                },
                pressed && { opacity: 0.75 },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text variant="bodyMedium" tone={active ? 'primary' : 'default'}>
                  {level.label}
                </Text>
                <Text variant="small" tone="muted">
                  {level.sub}
                </Text>
              </View>
              <Text variant="smallMedium" tone="secondary" tabular>
                ×{level.value}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {factor !== null && !knownFactor ? (
        <Text variant="small" tone="muted" style={{ marginTop: spacing.sm }}>
          Currently ×{factor} — pick a level above to change it.
        </Text>
      ) : null}

      {save.error || recalc.error ? (
        <Text variant="small" style={[styles.inlineNote, { color: semantic.danger }]}>
          {errorText(save.error ?? recalc.error)}
        </Text>
      ) : null}
      {notice ? (
        <Text variant="small" style={[styles.inlineNote, { color: semantic.success }]}>
          {notice}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Button
          label="Recalculate"
          variant="secondary"
          onPress={() => recalc.mutate()}
          loading={recalc.isPending}
          disabled={save.isPending}
          style={{ flex: 1 }}
        />
        <Button
          label="Save"
          onPress={() => {
            if (!goalValid || factor === null) return;
            save.mutate({ goal_weight_kg: goalNumber, activity_factor: factor });
          }}
          loading={save.isPending}
          disabled={!dirty || !goalValid || recalc.isPending}
          style={{ flex: 1 }}
        />
      </View>
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="bodyMedium" numberOfLines={1} style={{ marginTop: 2 }}>
        {value}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------- data

function DataSection() {
  const theme = useTheme();
  const signOut = useAuth((state) => state.signOut);

  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const exportData = useMutation({
    mutationFn: () => auth.exportData(),
    onMutate: () => setError(null),
    onSuccess: async (data) => {
      const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
      const message =
        json.length > SHARE_LIMIT
          ? `${json.slice(0, SHARE_LIMIT)}\n\n[Truncated — export was ${Math.round(
              json.length / 1000,
            )} kB, too large to share in full]`
          : json;
      try {
        await Share.share({ message, title: 'BeFit export' });
      } catch (err) {
        setError(errorText(err));
      }
    },
    onError: (err) => setError(errorText(err)),
  });

  const logoutAll = useMutation({
    mutationFn: () => auth.logoutAll(),
    onMutate: () => setError(null),
    onSuccess: () => signOut(),
    onError: (err) => setError(errorText(err)),
  });

  const deleteAccount = useMutation({
    mutationFn: (pw: string) => auth.deleteAccount(pw),
    onMutate: () => setDeleteError(null),
    onSuccess: () => signOut(),
    onError: (err) => setDeleteError(errorText(err)),
  });

  const confirmLogoutAll = () =>
    Alert.alert(
      'Sign out everywhere?',
      'Every phone signed in to this account, including this one, will need to sign in again.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out all', style: 'destructive', onPress: () => logoutAll.mutate() },
      ],
    );

  const confirmDelete = () =>
    Alert.alert(
      'Delete your account?',
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete forever', style: 'destructive', onPress: () => deleteAccount.mutate(password) },
      ],
    );

  return (
    <>
      <Card>
        <Text variant="small" tone="secondary">
          Download everything BeFit stores for you as JSON — profile, logs, plans, scans and
          coach chats.
        </Text>
        <Button
          label="Export my data"
          variant="secondary"
          onPress={() => exportData.mutate()}
          loading={exportData.isPending}
          style={{ marginTop: spacing.md }}
        />

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        <View style={styles.actions}>
          <Button
            label="Sign out"
            variant="secondary"
            onPress={() => signOut()}
            disabled={logoutAll.isPending}
            style={{ flex: 1 }}
          />
          <Button
            label="All devices"
            variant="secondary"
            onPress={confirmLogoutAll}
            loading={logoutAll.isPending}
            style={{ flex: 1 }}
          />
        </View>
        <Text variant="small" tone="muted" style={{ marginTop: spacing.sm }}>
          "All devices" signs out every phone using this account.
        </Text>

        {error ? (
          <Text variant="small" style={[styles.inlineNote, { color: semantic.danger }]}>
            {error}
          </Text>
        ) : null}
      </Card>

      <Card>
        <Text variant="bodyMedium" style={{ color: semantic.danger }}>
          Delete account
        </Text>
        {deleting ? (
          <>
            <Text variant="small" tone="secondary" style={{ marginTop: spacing.xs }}>
              This permanently deletes your account and everything in it: every food, water,
              sleep, weight and workout log, your diet and workout plans, body scans and coach
              chats. It can't be recovered. Export first if you want a copy.
            </Text>
            <Text variant="caption" tone="muted" style={{ marginTop: spacing.base }}>
              Type your password to confirm
            </Text>
            <TextInput
              value={password}
              onChangeText={(value) => {
                setPassword(value);
                setDeleteError(null);
              }}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="password"
              autoComplete="current-password"
              placeholder="Password"
              placeholderTextColor={theme.textMuted}
              style={[
                styles.input,
                {
                  backgroundColor: theme.surfaceSunken,
                  borderColor: deleteError ? semantic.danger : theme.border,
                  color: theme.text,
                },
              ]}
            />
            {deleteError ? (
              <Text variant="small" style={[styles.inlineNote, { color: semantic.danger }]}>
                {deleteError}
              </Text>
            ) : null}
            <View style={styles.actions}>
              <Button
                label="Cancel"
                variant="secondary"
                onPress={() => {
                  setDeleting(false);
                  setPassword('');
                  setDeleteError(null);
                }}
                disabled={deleteAccount.isPending}
                style={{ flex: 1 }}
              />
              <DangerButton
                label="Delete forever"
                onPress={confirmDelete}
                disabled={password.length === 0}
                loading={deleteAccount.isPending}
              />
            </View>
          </>
        ) : (
          <>
            <Text variant="small" tone="secondary" style={{ marginTop: spacing.xs }}>
              Permanently remove your account and all of its data.
            </Text>
            <Button
              label="Delete account…"
              variant="secondary"
              onPress={() => setDeleting(true)}
              style={{ marginTop: spacing.md }}
            />
          </>
        )}
      </Card>
    </>
  );
}

function DangerButton({
  label,
  onPress,
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.danger,
        { backgroundColor: semantic.danger },
        pressed && { opacity: 0.85 },
        inactive && { opacity: 0.45 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text variant="bodyMedium" style={{ color: '#FFFFFF' }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { padding: spacing.base, gap: spacing.md, paddingBottom: spacing['4xl'] * 2 },
  sectionLabel: { marginTop: spacing.md, marginLeft: spacing.xs },
  facts: { flexDirection: 'row', gap: spacing.md },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: spacing.base },
  input: {
    height: 48,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
  },
  choices: { gap: spacing.sm, marginTop: spacing.sm },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  inlineNote: { marginTop: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.base },
  danger: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
});
