import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { bodyApi, type ScanDraft } from '../src/api/befit';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { Icon } from '../src/components/Icon';
import { Text } from '../src/components/Text';
import { radius, semantic, spacing, useTheme } from '../src/theme';

type Field = {
  key: keyof ScanDraft;
  label: string;
  unit: string;
};

const FIELDS: Field[] = [
  { key: 'weight_kg', label: 'Weight', unit: 'kg' },
  { key: 'body_fat_pct', label: 'Body fat', unit: '%' },
  { key: 'skeletal_muscle_kg', label: 'Skeletal muscle', unit: 'kg' },
  { key: 'visceral_fat_level', label: 'Visceral fat', unit: 'level' },
  { key: 'body_water_l', label: 'Body water', unit: 'L' },
  { key: 'bmr_kcal', label: 'BMR', unit: 'kcal' },
];

export default function BodyScan() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [image, setImage] = useState<{ uri: string; mime: string } | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scan = useMutation({
    mutationFn: () => bodyApi.scan(image!.uri, image!.mime),
    onSuccess: (draft) => {
      if (!draft.found_any) {
        setError(
          "I couldn't find any values on that page. Try a straighter, brighter photo of the results table.",
        );
        return;
      }
      const next: Record<string, string> = {};
      for (const field of FIELDS) {
        const value = draft[field.key];
        if (typeof value === 'number') next[field.key] = String(value);
      }
      setValues(next);
      setReviewing(true);
      setError(null);
    },
    onError: (err) => setError((err as Error).message),
  });

  const save = useMutation({
    mutationFn: () => {
      const payload: Record<string, number> = {};
      for (const field of FIELDS) {
        const parsed = Number(values[field.key]);
        if (values[field.key] && !Number.isNaN(parsed)) payload[field.key] = parsed;
      }
      return bodyApi.saveScan(payload);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['composition'] }),
        queryClient.invalidateQueries({ queryKey: ['weights'] }),
      ]);
      router.back();
    },
    onError: (err) => setError((err as Error).message),
  });

  async function pick(from: 'camera' | 'library') {
    setError(null);
    const permission =
      from === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(
        from === 'camera'
          ? 'Camera access is off. Enable it in Settings to photograph your report.'
          : 'Photo access is off. Enable it in Settings to pick your report.',
      );
      return;
    }

    const result =
      from === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });

    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    setImage({ uri: asset.uri, mime: asset.mimeType ?? 'image/jpeg' });
    setReviewing(false);
    setValues({});
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas }}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + spacing.base, borderBottomColor: theme.border },
        ]}
      >
        <Text variant="h2">{reviewing ? 'Check the numbers' : 'Body scan'}</Text>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Close">
          <Icon name="close" size={22} color={theme.textSecondary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: spacing['2xl'] }]}
        keyboardShouldPersistTaps="handled"
      >
        {!reviewing ? (
          <>
            <Text variant="body" tone="secondary">
              Photograph the results page of an InBody or similar body composition
              report. The numbers are read out for you to check — the photo itself is
              never stored.
            </Text>

            {image ? (
              <Image
                source={{ uri: image.uri }}
                style={[styles.preview, { borderColor: theme.border }]}
                resizeMode="contain"
              />
            ) : (
              <View style={[styles.placeholder, { borderColor: theme.borderStrong }]}>
                <Icon name="body" size={34} color={theme.textMuted} />
                <Text variant="small" tone="muted" center style={{ marginTop: spacing.md }}>
                  No photo yet
                </Text>
              </View>
            )}

            <View style={styles.pickRow}>
              <Button
                label="Take photo"
                variant="secondary"
                onPress={() => pick('camera')}
                style={{ flex: 1 }}
              />
              <Button
                label="Choose file"
                variant="secondary"
                onPress={() => pick('library')}
                style={{ flex: 1 }}
              />
            </View>
          </>
        ) : (
          <>
            <Card variant="tinted">
              <Text variant="smallMedium" tone="primary">
                Read from your report
              </Text>
              <Text variant="small" tone="secondary" style={{ marginTop: spacing.xs }}>
                Correct anything that looks wrong before saving. OCR on a printed table
                is good, not perfect — nothing is stored until you accept it.
              </Text>
            </Card>

            {FIELDS.map((field) => (
              <View key={field.key} style={styles.field}>
                <Text variant="caption" tone="muted">
                  {field.label}
                </Text>
                <View style={styles.inputRow}>
                  <TextInput
                    value={values[field.key] ?? ''}
                    onChangeText={(text) =>
                      setValues((current) => ({ ...current, [field.key]: text }))
                    }
                    placeholder="—"
                    placeholderTextColor={theme.textMuted}
                    keyboardType="decimal-pad"
                    style={[
                      styles.input,
                      {
                        backgroundColor: theme.surface,
                        borderColor: theme.border,
                        color: theme.text,
                      },
                    ]}
                  />
                  <Text variant="small" tone="muted" style={styles.unit}>
                    {field.unit}
                  </Text>
                </View>
              </View>
            ))}
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
        {reviewing ? (
          <>
            <Button
              label="Back"
              variant="secondary"
              onPress={() => setReviewing(false)}
              style={{ flex: 1 }}
            />
            <Button
              label="Save scan"
              onPress={() => save.mutate()}
              loading={save.isPending}
              style={{ flex: 2 }}
            />
          </>
        ) : (
          <Button
            label={image ? 'Read the report' : 'Add a photo first'}
            onPress={() => scan.mutate()}
            loading={scan.isPending}
            disabled={!image}
            size="lg"
            style={{ flex: 1 }}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  body: { padding: spacing.lg, gap: spacing.base },
  preview: { width: '100%', height: 260, borderRadius: radius.md, borderWidth: 1 },
  placeholder: {
    height: 200,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickRow: { flexDirection: 'row', gap: spacing.md },
  field: { gap: spacing.sm },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  input: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
  },
  unit: { width: 44 },
  error: { padding: spacing.md, borderRadius: radius.sm },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.base,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
