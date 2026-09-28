import { Text as RNText, type TextProps as RNTextProps, StyleSheet } from 'react-native';

import { type, useTheme } from '../theme';

type Variant = keyof typeof type;
type Tone = 'default' | 'secondary' | 'muted' | 'primary' | 'inverse';

export type TextProps = RNTextProps & {
  variant?: Variant;
  tone?: Tone;
  /** Line numbers up in columns while values animate. */
  tabular?: boolean;
  center?: boolean;
};

export function Text({
  variant = 'body',
  tone = 'default',
  tabular,
  center,
  style,
  ...rest
}: TextProps) {
  const theme = useTheme();

  const color = {
    default: theme.text,
    secondary: theme.textSecondary,
    muted: theme.textMuted,
    primary: theme.primaryInk,
    inverse: theme.onPrimary,
  }[tone];

  return (
    <RNText
      {...rest}
      style={StyleSheet.flatten([
        type[variant],
        { color },
        tabular && { fontVariant: ['tabular-nums' as const] },
        center && { textAlign: 'center' as const },
        style,
      ])}
    />
  );
}
