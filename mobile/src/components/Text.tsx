import { Text as RNText, type TextProps as RNTextProps, StyleSheet } from 'react-native';

import { themes, type, useTheme, type Theme } from '../theme';

type Variant = keyof typeof type;
type Tone = 'default' | 'secondary' | 'muted' | 'primary' | 'inverse';

export type TextProps = RNTextProps & {
  variant?: Variant;
  tone?: Tone;
  /** Line numbers up in columns while values animate. */
  tabular?: boolean;
  center?: boolean;
};

const variantStyles = StyleSheet.create(type);

function toneStyles(theme: Theme) {
  return StyleSheet.create({
    default: { color: theme.text },
    secondary: { color: theme.textSecondary },
    muted: { color: theme.textMuted },
    primary: { color: theme.primaryInk },
    inverse: { color: theme.onPrimary },
  });
}

// One registered style per tone per scheme, built at import rather than per render.
const tones = { light: toneStyles(themes.light), dark: toneStyles(themes.dark) };

const modifiers = StyleSheet.create({
  tabular: { fontVariant: ['tabular-nums'] },
  center: { textAlign: 'center' },
});

/**
 * Text is the most-rendered component in the app, so it passes a style array
 * straight through (RN flattens natively) instead of flattening and allocating
 * a colour object on every render.
 */
export function Text({
  variant = 'body',
  tone = 'default',
  tabular,
  center,
  style,
  ...rest
}: TextProps) {
  const theme = useTheme();
  const toneStyle = tones[theme.isDark ? 'dark' : 'light'][tone];

  return (
    <RNText
      {...rest}
      style={[
        variantStyles[variant],
        toneStyle,
        tabular && modifiers.tabular,
        center && modifiers.center,
        style,
      ]}
    />
  );
}
