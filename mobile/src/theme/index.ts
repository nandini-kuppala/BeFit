import { useColorScheme } from 'react-native';

import { palettes, type Palette } from './tokens';

export * from './tokens';

export type Theme = Palette & { isDark: boolean };

/**
 * Built once per scheme. Returning a fresh spread on every call gave every
 * consumer a new object each render, which defeats memo and any dependency
 * array that mentions the theme.
 */
export const themes: { light: Theme; dark: Theme } = {
  light: Object.freeze({ ...palettes.light, isDark: false }),
  dark: Object.freeze({ ...palettes.dark, isDark: true }),
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? themes.dark : themes.light;
}

/** Violet-tinted elevation. Never black — black shadows read as cheap on a purple surface. */
export function shadow(palette: Palette, level: 1 | 2 | 3 = 1) {
  const config = {
    1: { radius: 12, offset: 3, opacity: palette.shadowOpacity * 0.6, elevation: 2 },
    2: { radius: 20, offset: 6, opacity: palette.shadowOpacity * 0.85, elevation: 5 },
    3: { radius: 32, offset: 12, opacity: palette.shadowOpacity, elevation: 10 },
  }[level];

  return {
    shadowColor: palette.shadowColor,
    shadowOffset: { width: 0, height: config.offset },
    shadowRadius: config.radius,
    shadowOpacity: config.opacity,
    elevation: config.elevation,
  };
}
