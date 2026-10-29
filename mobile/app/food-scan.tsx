import { useMutation } from '@tanstack/react-query';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { food } from '../src/api/befit';
import { ApiError } from '../src/api/client';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { Icon } from '../src/components/Icon';
import { KeyboardScreen } from '../src/components/KeyboardScreen';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Text } from '../src/components/Text';
import { radius, semantic, spacing, useTheme } from '../src/theme';

const BARCODE = /^\d{6,14}$/;

/**
 * Scan a packet, get its food.
 *
 * The first readable code wins and the camera stops listening until the
 * lookup settles — the scanner fires many times a second, and each of those
 * would otherwise be a server call. A code Open Food Facts doesn't know goes
 * straight to the hand-entry form with the barcode attached, so the next scan
 * of the same packet finds her own entry.
 */
export default function FoodScan() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ meal?: string; date?: string }>();
  const passthrough = `${params.meal ? `&meal=${params.meal}` : ''}${params.date ? `&date=${params.date}` : ''}`;

  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  // A ref, not state: barcode events arrive faster than React re-renders.
  const locked = useRef(false);

  // Ask straight away the first time; a refusal is never re-prompted here.
  useEffect(() => {
    if (permission && !permission.granted && permission.status === 'undetermined') {
      requestPermission().catch(() => {});
    }
  }, [permission, requestPermission]);

  const lookup = useMutation({
    mutationFn: (barcode: string) => food.barcode(barcode),
    onSuccess: (found) => {
      router.dismissTo(`/food-add?foodId=${found.id}${passthrough}`);
    },
  });

  const start = (barcode: string) => {
    if (locked.current) return;
    locked.current = true;
    setCode(barcode);
    setTorch(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    lookup.mutate(barcode);
  };

  const onScanned = ({ data }: BarcodeScanningResult) => {
    const digits = data.replace(/\D/g, '');
    if (BARCODE.test(digits)) start(digits);
  };

  const scanAgain = () => {
    lookup.reset();
    setCode(null);
    locked.current = false;
  };

  const notFound = lookup.error instanceof ApiError && lookup.error.status === 404;
  const busy = code !== null;
  const typedValid = BARCODE.test(typed);

  return (
    <KeyboardScreen
      header={<ScreenHeader title="Scan a barcode" subtitle="Point at the stripes on the packet" />}
      contentContainerStyle={styles.page}
    >
      <CameraArea
        granted={!!permission?.granted}
        loading={permission === null}
        canAskAgain={permission?.canAskAgain ?? true}
        onRequest={() => requestPermission()}
        busy={busy}
        torch={torch}
        onToggleTorch={() => setTorch((on) => !on)}
        onScanned={busy ? undefined : onScanned}
      />

      {busy ? (
        <Card>
          {lookup.isPending || lookup.isSuccess ? (
            <View style={styles.statusRow}>
              <ActivityIndicator color={theme.primary} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyMedium">Looking it up…</Text>
                <Text variant="small" tone="muted" tabular>
                  {code}
                </Text>
              </View>
            </View>
          ) : notFound ? (
            <View style={{ gap: spacing.md }}>
              <View style={{ gap: spacing.xs }}>
                <Text variant="h3">Not in Open Food Facts yet</Text>
                <Text variant="small" tone="secondary">
                  Barcode {code} isn't in the database. Copy the numbers from the label once
                  and BeFit will recognise this packet every time after.
                </Text>
              </View>
              <Button
                label="Add it from the label"
                onPress={() => router.replace(`/food-new?barcode=${code}${passthrough}`)}
                fullWidth
              />
              <Button label="Scan again" variant="secondary" onPress={scanAgain} fullWidth />
            </View>
          ) : (
            <View style={{ gap: spacing.md }}>
              <View style={{ gap: spacing.xs }}>
                <Text variant="h3">Couldn't look that up</Text>
                <Text variant="small" style={{ color: semantic.danger }}>
                  {lookup.error instanceof Error ? lookup.error.message : 'Something went wrong.'}
                </Text>
              </View>
              <Button label="Scan again" variant="secondary" onPress={scanAgain} fullWidth />
            </View>
          )}
        </Card>
      ) : null}

      <Card>
        <Text variant="caption" tone="muted">
          Type the barcode
        </Text>
        <Text variant="small" tone="secondary" style={{ marginTop: spacing.xs }}>
          For a crumpled or curved label — the digits printed under the stripes.
        </Text>
        <View style={styles.manualRow}>
          <TextInput
            value={typed}
            onChangeText={(value) => setTyped(value.replace(/\D/g, '').slice(0, 14))}
            placeholder="8901234567890"
            placeholderTextColor={theme.textMuted}
            keyboardType="number-pad"
            maxLength={14}
            returnKeyType="search"
            onSubmitEditing={() => typedValid && !busy && start(typed)}
            style={[
              styles.input,
              { backgroundColor: theme.surfaceSunken, borderColor: theme.border, color: theme.text },
            ]}
            accessibilityLabel="Barcode digits"
          />
          <Button
            label="Look up"
            onPress={() => start(typed)}
            disabled={!typedValid || busy}
            style={{ height: 46 }}
          />
        </View>
        {typed.length > 0 && !typedValid ? (
          <Text variant="small" tone="muted" style={{ marginTop: spacing.sm }}>
            Barcodes are 6 to 14 digits.
          </Text>
        ) : null}
      </Card>
    </KeyboardScreen>
  );
}

function CameraArea({
  granted,
  loading,
  canAskAgain,
  onRequest,
  busy,
  torch,
  onToggleTorch,
  onScanned,
}: {
  granted: boolean;
  loading: boolean;
  canAskAgain: boolean;
  onRequest: () => void;
  busy: boolean;
  torch: boolean;
  onToggleTorch: () => void;
  onScanned?: (result: BarcodeScanningResult) => void;
}) {
  const theme = useTheme();

  if (loading) {
    return (
      <View style={[styles.camera, styles.centered, { backgroundColor: theme.surfaceSunken }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  if (!granted) {
    return (
      <Card style={{ gap: spacing.md }}>
        <View style={[styles.permissionIcon, { backgroundColor: theme.primarySoft }]}>
          <Icon name="barcode" size={26} color={theme.primary} />
        </View>
        <View style={{ gap: spacing.xs }}>
          <Text variant="h3">
            {canAskAgain ? 'Allow the camera to scan' : 'Camera access is off'}
          </Text>
          <Text variant="small" tone="secondary">
            {canAskAgain
              ? 'BeFit only reads the barcode — nothing is recorded or uploaded except the number itself.'
              : 'Turn on camera access for BeFit in your phone settings to scan packets. You can still type the barcode below.'}
          </Text>
        </View>
        {canAskAgain ? (
          <Button label="Allow camera" onPress={onRequest} fullWidth />
        ) : (
          <Button
            label="Open settings"
            variant="secondary"
            onPress={() => Linking.openSettings().catch(() => {})}
            fullWidth
          />
        )}
      </Card>
    );
  }

  return (
    <View style={[styles.camera, { backgroundColor: '#000' }]}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
        onBarcodeScanned={onScanned}
      />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.centered]}>
        <View
          style={[
            styles.reticle,
            { borderColor: busy ? theme.primary : 'rgba(255,255,255,0.9)' },
          ]}
        />
      </View>
      <Pressable
        onPress={onToggleTorch}
        accessibilityRole="button"
        accessibilityLabel={torch ? 'Turn torch off' : 'Turn torch on'}
        accessibilityState={{ selected: torch }}
        hitSlop={8}
        style={[
          styles.torch,
          { backgroundColor: torch ? theme.primary : 'rgba(0,0,0,0.45)' },
        ]}
      >
        <Icon name="bolt" size={20} color="#FFFFFF" filled={torch} />
      </Pressable>
      {busy ? (
        <View style={[StyleSheet.absoluteFill, styles.centered, styles.dim]}>
          <ActivityIndicator color="#FFFFFF" size="large" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: spacing.base, gap: spacing.md, paddingBottom: spacing['4xl'] },
  camera: {
    height: 320,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  centered: { alignItems: 'center', justifyContent: 'center' },
  reticle: {
    width: '78%',
    height: 130,
    borderWidth: 2.5,
    borderRadius: radius.md,
  },
  dim: { backgroundColor: 'rgba(0,0,0,0.35)' },
  torch: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  permissionIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  input: {
    flex: 1,
    height: 46,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    letterSpacing: 1,
  },
});
