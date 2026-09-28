import { useColorScheme } from 'react-native';

import { palettes, type Palette } from './tokens';

export * from './tokens';

export function useTheme(): Palette & { isDark: boolean } {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  return { ...palettes[isDark ? 'dark' : 'light'], isDark };
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
