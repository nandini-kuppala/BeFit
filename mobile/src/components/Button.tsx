import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';

import { radius, shadow, spacing, useTheme } from '../theme';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  fullWidth?: boolean;
  style?: ViewStyle;
};

const HEIGHTS: Record<Size, number> = { sm: 38, md: 48, lg: 56 };

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled,
  loading,
  icon,
  fullWidth,
  style,
}: ButtonProps) {
  const theme = useTheme();
  const inactive = disabled || loading;

  const surface: Record<Variant, ViewStyle> = {
    primary: { backgroundColor: theme.primary },
    secondary: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.borderStrong,
    },
    ghost: { backgroundColor: 'transparent' },
  };

  const tone = variant === 'primary' ? 'inverse' : 'primary';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      accessibilityLabel={label}
      disabled={inactive}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [
        styles.base,
        { height: HEIGHTS[size] },
        surface[variant],
        variant === 'primary' && !inactive && shadow(theme, 1),
        fullWidth && styles.fullWidth,
        pressed && { opacity: 0.85, transform: [{ scale: 0.985 }] },
        inactive && { opacity: 0.45 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? theme.onPrimary : theme.primary} />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text
            variant={size === 'sm' ? 'smallMedium' : 'bodyMedium'}
            tone={tone}
            style={styles.label}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  fullWidth: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { letterSpacing: -0.1 },
});
