/**
 * BeFit design tokens.
 *
 * Light purple and white, kept professional by restraint: violet carries the
 * brand, the primary action and one data series; everything else is a
 * near-neutral warmed slightly toward violet so the surface reads intentional
 * rather than grey.
 */

export const violet = {
  50: '#F6F4FE',
  100: '#EDE9FE',
  200: '#DCD4FD',
  300: '#C3B4FB',
  400: '#A78BFA',
  500: '#8B5CF6',
  600: '#7C3AED', // primary action fill — white text is 5.5:1, AA
  700: '#6D28D9',
  900: '#4C1D95',
} as const;

export type Palette = {
  canvas: string;
  surface: string;
  surfaceSunken: string;
  surfaceRaised: string;
  border: string;
  borderStrong: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  primaryPressed: string;
  primarySoft: string;
  primarySoftBorder: string;
  primaryInk: string;
  onPrimary: string;
  shadowColor: string;
  shadowOpacity: number;
};

const lightPalette: Palette = {
  canvas: '#FBFAFD',
  surface: '#FFFFFF',
  surfaceSunken: '#F4F2F8',
  surfaceRaised: '#FFFFFF',
  border: '#E9E5F2',
  borderStrong: '#D8D2E6',

  text: '#17131F',
  textSecondary: '#5F5870',
  textMuted: '#8F87A1',

  primary: violet[600],
  primaryPressed: violet[700],
  primarySoft: violet[100],
  primarySoftBorder: violet[200],
  primaryInk: violet[700],
  onPrimary: '#FFFFFF',

  shadowColor: '#4C1D95',
  shadowOpacity: 0.1,
};

const darkPalette: Palette = {
  canvas: '#100D17',
  surface: '#1A1523',
  surfaceSunken: '#241D30',
  surfaceRaised: '#241D30',
  border: '#2E2640',
  borderStrong: '#3D3352',

  text: '#F4F1F9',
  textSecondary: '#A79FB8',
  textMuted: '#7D7490',

  primary: violet[400],
  primaryPressed: violet[300],
  primarySoft: '#241A3B',
  primarySoftBorder: '#3D2D63',
  primaryInk: violet[300],
  // Dark mode flips the primary to a light violet, so ink-on-primary must
  // flip too or the label vanishes.
  onPrimary: '#1A1023',

  shadowColor: '#000000',
  shadowOpacity: 0.4,
};

/**
 * Data series colours.
 *
 * Chosen to stay distinguishable under deuteranopia and protanopia by varying
 * lightness as well as hue. Colour is never the only signal — every ring and
 * bar in the app also carries a label and a number.
 */
export const series = {
  protein: '#7C3AED',
  carbs: '#F59E0B',
  fat: '#0EA5E9',
  fibre: '#10B981',
  water: '#38BDF8',
  sleep: '#6366F1',
  workout: '#F43F5E',
  weight: '#7C3AED',
} as const;

export const semantic = {
  success: '#059669',
  warning: '#D97706',
  danger: '#DC2626',
  info: '#2563EB',
} as const;

/** Provenance badges — an estimate must never look like a measured value. */
export const confidence = {
  verified: { color: '#059669', label: 'Verified' },
  database: { color: violet[600], label: 'Database' },
  estimated: { color: '#D97706', label: 'Estimated' },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const font = {
  display: 'PlusJakartaSans_800ExtraBold',
  displayBold: 'PlusJakartaSans_700Bold',
  displaySemi: 'PlusJakartaSans_600SemiBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
} as const;

export const type = {
  displayXl: { fontFamily: font.display, fontSize: 40, lineHeight: 44, letterSpacing: -1.2 },
  display: { fontFamily: font.displayBold, fontSize: 32, lineHeight: 38, letterSpacing: -0.9 },
  h1: { fontFamily: font.displayBold, fontSize: 26, lineHeight: 32, letterSpacing: -0.6 },
  h2: { fontFamily: font.displaySemi, fontSize: 21, lineHeight: 28, letterSpacing: -0.4 },
  h3: { fontFamily: font.displaySemi, fontSize: 17, lineHeight: 24, letterSpacing: -0.2 },
  body: { fontFamily: font.body, fontSize: 15, lineHeight: 22 },
  bodyMedium: { fontFamily: font.bodyMedium, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: font.body, fontSize: 13, lineHeight: 18 },
  smallMedium: { fontFamily: font.bodyMedium, fontSize: 13, lineHeight: 18 },
  caption: {
    fontFamily: font.bodySemi,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
  },
} as const;

/** 180–260ms on a gentle ease-out. Fast enough to feel instant, slow enough to read. */
export const motion = {
  fast: 180,
  base: 220,
  slow: 260,
  easing: [0.2, 0.8, 0.2, 1] as const,
} as const;

export const palettes = { light: lightPalette, dark: darkPalette };
