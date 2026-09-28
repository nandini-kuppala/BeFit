import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import {
  DEFAULT_BASE_URL,
  getBaseUrl,
  pingServer,
  resetBaseUrl,
  setStoredBaseUrl,
} from '../src/api/client';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Text } from '../src/components/Text';
import { radius, semantic, spacing, useTheme } from '../src/theme';

type Status = { ok: boolean; detail: string } | null;

/**
 * Where the app looks for its backend.
 *
 * Reachable from the sign-in screen on purpose: if this address is wrong, every
 * request fails, so a settings entry buried behind a login you cannot complete
 * would be useless.
 */
export default function ServerSettings() {
  const theme = useTheme();
  const [url, setUrl] = useState(getBaseUrl());
  const [status, setStatus] = useState<Status>(null);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);

  const test = async () => {
    setTesting(true);
    setStatus(null);
    setStatus(await pingServer(url));
    setTesting(false);
  };

  const save = async () => {
    const next = await setStoredBaseUrl(url);
    setUrl(next);
    setSaved(true);
    setStatus(await pingServer(next));
  };

  const reset = async () => {
    const next = await resetBaseUrl();
    setUrl(next);
    setSaved(true);
    setStatus(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas }}>
      <ScreenHeader title="Server" subtitle="Where BeFit looks for your data" />

      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Card>
          <Text variant="caption" tone="muted">
            Address
          </Text>
          <TextInput
            value={url}
            onChangeText={(value) => {
              setUrl(value);
              setStatus(null);
              setSaved(false);
            }}
            placeholder="http://192.168.1.10:8000"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={[
              styles.input,
              {
                backgroundColor: theme.surfaceSunken,
                borderColor: status?.ok === false ? semantic.danger : theme.border,
                color: theme.text,
              },
            ]}
          />

          {status ? (
            <View
              style={[
                styles.status,
                {
                  backgroundColor: status.ok ? theme.surfaceSunken : theme.surfaceSunken,
                },
              ]}
            >
              <Text
                variant="small"
                style={{ color: status.ok ? semantic.success : semantic.danger }}
              >
                {status.detail}
              </Text>
            </View>
          ) : null}

          {saved && status?.ok ? (
            <Text variant="small" tone="muted" style={{ marginTop: spacing.sm }}>
              Saved. Go back and sign in.
            </Text>
          ) : null}

          <View style={styles.actions}>
            <Button
              label="Test"
              variant="secondary"
              onPress={test}
              loading={testing}
              style={{ flex: 1 }}
            />
            <Button label="Save" onPress={save} style={{ flex: 1 }} />
          </View>
        </Card>

        <Card variant="tinted">
          <Text variant="smallMedium" tone="primary">
            Which address?
          </Text>
          <Text variant="small" tone="secondary" style={{ marginTop: spacing.xs }}>
            While the backend runs on your Mac, this is the Mac's address on whatever
            network you are both on, with port 8000. It changes when the network changes —
            a phone hotspot gives out different addresses than a home router. Once the
            backend is deployed, this becomes a fixed https address and stops changing.
          </Text>
        </Card>

        <Card>
          <Text variant="caption" tone="muted">
            Built-in default
          </Text>
          <Text variant="small" tone="secondary" tabular style={{ marginTop: spacing.xs }}>
            {DEFAULT_BASE_URL}
          </Text>
          <Button
            label="Reset to default"
            variant="secondary"
            size="sm"
            onPress={reset}
            style={{ marginTop: spacing.md }}
          />
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: spacing.base, gap: spacing.md, paddingBottom: spacing['4xl'] * 2 },
  input: {
    height: 48,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
  },
  status: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.base },
});
