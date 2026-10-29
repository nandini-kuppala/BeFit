import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { BackHandler, Image, Linking, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { food, logs } from '../src/api/befit';
import { MEAL_ORDER, type Meal } from '../src/api/types';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { DraftReview, rowsFromDrafts, type DraftRow } from '../src/components/DraftReview';
import { Icon } from '../src/components/Icon';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Text } from '../src/components/Text';
import { mealForHour } from '../src/lib/date';
import { prepareForUpload } from '../src/lib/image';
import { radius, semantic, spacing, useTheme } from '../src/theme';

/** Plenty for recognising food; smaller uploads answer faster on mobile data. */
const PHOTO_EDGE = 1280;

/**
 * Snap your plate.
 *
 * The photo is sent for recognition, then discarded server-side. What comes
 * back is a draft — every dish matched against the food database with a
 * guessed amount — that she confirms or fixes before anything is logged.
 * Amounts from a photo are the weakest part, so the unit picker is right on
 * each item rather than buried.
 */
export default function FoodPhoto() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ meal?: Meal; date?: string }>();
  const presetMeal = params.meal && MEAL_ORDER.includes(params.meal) ? params.meal : undefined;

  const [image, setImage] = useState<{ uri: string; mime: string } | null>(null);
  const [hint, setHint] = useState('');
  const [rows, setRows] = useState<DraftRow[] | null>(null);
  const [meal, setMeal] = useState<Meal>(presetMeal ?? mealForHour(new Date().getHours()));
  const [error, setError] = useState<string | null>(null);
  const [permissionBlocked, setPermissionBlocked] = useState(false);

  useEffect(() => {
    if (!rows) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setRows(null);
      return true;
    });
    return () => sub.remove();
  }, [rows]);

  const recognise = useMutation({
    mutationFn: () => food.photo(image!.uri, image!.mime, hint.trim() || undefined, presetMeal),
    onSuccess: (result) => {
      setRows(rowsFromDrafts(result.items));
      setMeal(presetMeal ?? result.meal);
      setError(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    },
    onError: (err) => setError((err as Error).message),
  });

  const loggable = (rows ?? []).filter((row) => row.resolved && row.foodId);
  const unresolved = (rows ?? []).length - loggable.length;

  const save = useMutation({
    mutationFn: () =>
      logs.logFood(
        meal,
        loggable.map((row) => ({ food_id: row.foodId, quantity: row.quantity, unit: row.portionKey })),
        false,
        params.date,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['day'] });
      queryClient.invalidateQueries({ queryKey: ['day-history'] });
      queryClient.invalidateQueries({ queryKey: ['food-recent'] });
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
      setPermissionBlocked(!permission.canAskAgain);
      setError(
        from === 'camera'
          ? 'Camera access is off, so BeFit can’t take the photo.'
          : 'Photo access is off, so BeFit can’t open your gallery.',
      );
      return;
    }
    const result =
      from === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.8, mediaTypes: ['images'] });
    if (result.canceled || result.assets.length === 0) return;
    setImage(await prepareForUpload(result.assets[0], PHOTO_EDGE));
    setRows(null);
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas }}>
      <ScreenHeader
        title={rows ? 'Check what was found' : 'Snap your plate'}
        onBack={rows ? () => setRows(null) : undefined}
      />

      <KeyboardAwareScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 120 }]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={spacing.base}
      >
        {!rows ? (
          <>
            {image ? (
              <View>
                <Image source={{ uri: image.uri }} style={styles.preview} resizeMode="cover" />
                <Pressable
                  onPress={() => setImage(null)}
                  style={[styles.clear, { backgroundColor: theme.surface }]}
                  accessibilityLabel="Remove photo"
                >
                  <Icon name="close" size={18} color={theme.text} />
                </Pressable>
              </View>
            ) : (
              <View style={[styles.placeholder, { borderColor: theme.borderStrong }]}>
                <Icon name="camera" size={34} color={theme.textMuted} />
                <Text variant="small" tone="secondary" center>
                  Photograph the plate from above, with everything in frame.
                </Text>
              </View>
            )}

            <View style={styles.pickRow}>
              <Button
                label={image ? 'Retake' : 'Take photo'}
                icon={<Icon name="camera" size={18} color={theme.onPrimary} />}
                onPress={() => pick('camera')}
                style={{ flex: 1 }}
              />
              <Button label="From gallery" variant="secondary" onPress={() => pick('library')} style={{ flex: 1 }} />
            </View>

            <View style={{ gap: spacing.xs }}>
              <Text variant="small" tone="muted">
                Anything the photo can't show? (optional)
              </Text>
              <TextInput
                value={hint}
                onChangeText={setHint}
                placeholder="e.g. dal is moong, roti has ghee"
                placeholderTextColor={theme.textMuted}
                maxLength={200}
                style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface }]}
              />
            </View>

            <Card variant="tinted">
              <Text variant="small" tone="secondary">
                Recognition is good at naming dishes and rough at amounts — you'll confirm each item
                and its portion before anything is logged. The photo isn't stored.
              </Text>
            </Card>
          </>
        ) : (
          <DraftReview rows={rows} onChange={setRows} meal={meal} onMealChange={setMeal} />
        )}

        {error ? (
          <View style={[styles.error, { backgroundColor: theme.surfaceSunken }]}>
            <Text variant="small" style={{ color: semantic.danger }}>
              {error}
            </Text>
            {permissionBlocked ? (
              <Pressable onPress={() => Linking.openSettings()} hitSlop={8} style={{ marginTop: spacing.sm }}>
                <Text variant="smallMedium" tone="primary">
                  Open settings
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </KeyboardAwareScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom + spacing.base, borderTopColor: theme.border, backgroundColor: theme.canvas },
        ]}
      >
        {rows ? (
          <Button
            label={
              unresolved > 0
                ? `Log ${loggable.length} · ${unresolved} unmatched`
                : `Log ${loggable.length} item${loggable.length === 1 ? '' : 's'}`
            }
            onPress={() => save.mutate()}
            loading={save.isPending}
            disabled={loggable.length === 0}
            size="lg"
            style={{ flex: 1 }}
          />
        ) : (
          <Button
            label={recognise.isPending ? 'Looking at your plate…' : 'Find the food'}
            onPress={() => recognise.mutate()}
            loading={recognise.isPending}
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
  body: { padding: spacing.lg, gap: spacing.base },
  preview: { width: '100%', aspectRatio: 1, borderRadius: radius.lg },
  clear: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: {
    aspectRatio: 1.4,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  pickRow: { flexDirection: 'row', gap: spacing.md },
  input: {
    height: 46,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
  },
  error: { padding: spacing.md, borderRadius: radius.sm },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.base,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
