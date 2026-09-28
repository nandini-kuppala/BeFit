import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, spacing, useTheme } from '../theme';
import { Icon } from './Icon';
import { Text } from './Text';

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  /** Rendered at the trailing edge — a Save button, usually. */
  action?: ReactNode;
  onBack?: () => void;
};

/**
 * Back affordance for the modal screens.
 *
 * The root stack runs with `headerShown: false` so every screen controls its
 * own chrome; this keeps the back button in one place rather than five.
 */
export function ScreenHeader({ title, subtitle, action, onBack }: ScreenHeaderProps) {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: insets.top + spacing.sm,
          backgroundColor: theme.canvas,
          borderBottomColor: theme.border,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={() => (onBack ? onBack() : router.back())}
        hitSlop={12}
        style={({ pressed }) => [
          styles.back,
          { backgroundColor: theme.surfaceSunken },
          pressed && { opacity: 0.6 },
        ]}
      >
        <Icon name="chevronLeft" size={19} color={theme.text} />
      </Pressable>

      <View style={{ flex: 1 }}>
        <Text variant="h2" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" tone="muted" numberOfLines={1} style={{ marginTop: 1 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
