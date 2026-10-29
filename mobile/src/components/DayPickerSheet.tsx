import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, shadow, spacing, useTheme } from '../theme';
import { Icon } from './Icon';
import { Text } from './Text';

export const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

type DayPickerSheetProps = {
  visible: boolean;
  title: string;
  message?: string;
  /** Monday-first index (0–6) that is left out of the list. */
  exclude?: number;
  onPick: (weekday: number) => void;
  onClose: () => void;
};

/**
 * A bottom sheet listing weekdays.
 *
 * Replaces a multi-button Alert.alert: Android's native dialog shows at most
 * three buttons, so a "copy from which day?" alert silently lost three days.
 */
export function DayPickerSheet({
  visible,
  title,
  message,
  exclude,
  onPick,
  onClose,
}: DayPickerSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />
      <View
        style={[
          styles.sheet,
          shadow(theme, 3),
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            paddingBottom: insets.bottom + spacing.base,
          },
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: theme.borderStrong }]} />
        <Text variant="h3">{title}</Text>
        {message ? (
          <Text variant="small" tone="secondary" style={{ marginTop: spacing.xs }}>
            {message}
          </Text>
        ) : null}

        <View style={styles.list}>
          {WEEKDAY_NAMES.map((name, index) =>
            index === exclude ? null : (
              <Pressable
                key={name}
                accessibilityRole="button"
                onPress={() => onPick(index)}
                style={({ pressed }) => [
                  styles.row,
                  { borderBottomColor: theme.border },
                  pressed && { backgroundColor: theme.surfaceSunken },
                ]}
              >
                <Text variant="bodyMedium">{name}</Text>
                <Icon name="chevronRight" size={16} color={theme.textMuted} />
              </Pressable>
            ),
          )}
        </View>

        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          style={({ pressed }) => [styles.cancel, pressed && { opacity: 0.6 }]}
        >
          <Text variant="smallMedium" tone="secondary">
            Cancel
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(16, 13, 23, 0.45)' },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: spacing.md,
  },
  list: { marginTop: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cancel: { alignItems: 'center', paddingVertical: spacing.base, marginTop: spacing.xs },
});
