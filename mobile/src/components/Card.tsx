import type { ReactNode } from 'react';
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';

import { radius, shadow, spacing, useTheme } from '../theme';

type CardProps = ViewProps & {
  children: ReactNode;
  /** `flat` for list containers, `raised` for things that should lift off the canvas. */
  variant?: 'flat' | 'raised' | 'tinted';
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Card({
  children,
  variant = 'raised',
  padded = true,
  style,
  ...rest
}: CardProps) {
  const theme = useTheme();

  const surface: ViewStyle =
    variant === 'tinted'
      ? { backgroundColor: theme.primarySoft, borderColor: theme.primarySoftBorder }
      : { backgroundColor: theme.surface, borderColor: theme.border };

  return (
    <View
      {...rest}
      style={[
        styles.base,
        surface,
        padded && styles.padded,
        variant === 'raised' && shadow(theme, 1),
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  padded: {
    padding: spacing.base,
  },
});
