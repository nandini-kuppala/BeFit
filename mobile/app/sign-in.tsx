import { useRouter } from 'expo-router';
import { useState } from 'react';
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

import { Button } from '../src/components/Button';
import { Text } from '../src/components/Text';
import { useAuth } from '../src/store/auth';
import { radius, semantic, spacing, useTheme, violet } from '../src/theme';

export default function SignIn() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signIn, register } = useAuth();

  const [mode, setMode] = useState<'sign-in' | 'register'>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isRegister = mode === 'register';
  const canSubmit = email.includes('@') && password.length >= 8;

  async function submit() {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (isRegister) {
        await register(email, password);
        router.replace('/onboarding');
      } else {
        await signIn(email, password);
        router.replace('/');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = [
    styles.input,
    {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      color: theme.text,
    },
  ];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.canvas }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + spacing['4xl'], paddingBottom: insets.bottom + spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.mark, { backgroundColor: theme.primary }]}>
          <Text variant="h1" tone="inverse">
            B
          </Text>
        </View>

        <Text variant="display" style={styles.title}>
          BeFit
        </Text>
        <Text variant="body" tone="secondary" style={styles.tagline}>
          Your health, tracked properly. No ads, no subscriptions, no nonsense.
        </Text>

        <View style={styles.form}>
          <View style={styles.field}>
            <Text variant="caption" tone="muted">
              Email
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              style={inputStyle}
            />
          </View>

          <View style={styles.field}>
            <Text variant="caption" tone="muted">
              Password
            </Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="At least 8 characters"
              placeholderTextColor={theme.textMuted}
              secureTextEntry
              autoCapitalize="none"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              style={inputStyle}
              onSubmitEditing={submit}
              returnKeyType="go"
            />
          </View>

          {error ? (
            <View style={[styles.error, { backgroundColor: theme.surfaceSunken }]}>
              <Text variant="small" style={{ color: semantic.danger }}>
                {error}
              </Text>
            </View>
          ) : null}

          <Button
            label={isRegister ? 'Create account' : 'Sign in'}
            onPress={submit}
            loading={busy}
            disabled={!canSubmit}
            size="lg"
            fullWidth
          />

          <Pressable
            onPress={() => {
              setMode(isRegister ? 'sign-in' : 'register');
              setError(null);
            }}
            hitSlop={12}
            style={styles.switch}
          >
            <Text variant="small" tone="secondary" center>
              {isRegister ? 'Already have an account? ' : "Don't have an account? "}
              <Text variant="smallMedium" tone="primary">
                {isRegister ? 'Sign in' : 'Create one'}
              </Text>
            </Text>
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text variant="small" tone="muted" center>
            Your data stays in your own database. Nothing is sold, shared or advertised
            against.
          </Text>

          {/* Deliberately on this screen: if the server address is wrong every
              request fails, so this has to be reachable without signing in. */}
          <Pressable
            onPress={() => router.push('/server')}
            hitSlop={12}
            style={styles.serverLink}
          >
            <Text variant="caption" tone="muted" center style={{ fontSize: 10 }}>
              Can't connect?{' '}
              <Text variant="caption" tone="primary" style={{ fontSize: 10 }}>
                Server settings
              </Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.xl, flexGrow: 1 },
  mark: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  title: { marginBottom: spacing.sm },
  tagline: { marginBottom: spacing['2xl'], maxWidth: 320 },
  form: { gap: spacing.base },
  field: { gap: spacing.sm },
  input: {
    height: 52,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
  },
  error: { padding: spacing.md, borderRadius: radius.sm },
  switch: { paddingVertical: spacing.sm },
  footer: { marginTop: 'auto', paddingTop: spacing['2xl'], maxWidth: 300, alignSelf: 'center' },
  serverLink: { marginTop: spacing.base },
});
