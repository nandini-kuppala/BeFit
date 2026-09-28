import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Ellipse, Rect } from 'react-native-svg';

import type { BodyZone } from '../api/befit';
import { radius, spacing, useTheme } from '../theme';
import { Text } from './Text';

export type View3D = 'front' | 'back';

type Hotspot = {
  zone: BodyZone;
  label: string;
  /** Percentages of the figure box. Hotspots are laid over the drawing rather
   *  than being SVG paths, so touch targets stay reliably large. */
  left: number;
  top: number;
  width: number;
  height: number;
};

const FRONT: Hotspot[] = [
  { zone: 'chest', label: 'Chest', left: 31, top: 15, width: 38, height: 11 },
  { zone: 'upper_arms', label: 'Arms', left: 14, top: 17, width: 16, height: 16 },
  { zone: 'upper_arms', label: 'Arms', left: 70, top: 17, width: 16, height: 16 },
  { zone: 'abdomen', label: 'Abdomen', left: 33, top: 27, width: 34, height: 8 },
  { zone: 'lower_belly', label: 'Lower belly', left: 34, top: 34, width: 32, height: 8 },
  { zone: 'hips', label: 'Hips', left: 28, top: 41, width: 44, height: 8 },
  { zone: 'front_thighs', label: 'Front thighs', left: 30, top: 50, width: 14, height: 16 },
  { zone: 'front_thighs', label: 'Front thighs', left: 56, top: 50, width: 14, height: 16 },
  { zone: 'inner_thighs', label: 'Inner thighs', left: 44, top: 51, width: 12, height: 14 },
  { zone: 'calves', label: 'Calves', left: 32, top: 72, width: 36, height: 15 },
];

const BACK: Hotspot[] = [
  { zone: 'upper_back', label: 'Upper back', left: 31, top: 15, width: 38, height: 12 },
  { zone: 'upper_arms', label: 'Arms', left: 14, top: 17, width: 16, height: 16 },
  { zone: 'upper_arms', label: 'Arms', left: 70, top: 17, width: 16, height: 16 },
  { zone: 'waist', label: 'Waist', left: 33, top: 28, width: 34, height: 9 },
  // Saddle bags are the outer hip, so these hug the edge of the hip block
  // rather than floating beside the figure.
  { zone: 'saddle_bags', label: 'Saddle bags', left: 25, top: 38, width: 13, height: 11 },
  { zone: 'saddle_bags', label: 'Saddle bags', left: 62, top: 38, width: 13, height: 11 },
  { zone: 'glutes', label: 'Glutes', left: 38, top: 40, width: 24, height: 11 },
  { zone: 'outer_thighs', label: 'Outer thighs', left: 29, top: 52, width: 11, height: 15 },
  { zone: 'outer_thighs', label: 'Outer thighs', left: 60, top: 52, width: 11, height: 15 },
  { zone: 'hamstrings', label: 'Hamstrings', left: 41, top: 52, width: 18, height: 15 },
  { zone: 'calves', label: 'Calves', left: 32, top: 72, width: 36, height: 15 },
];

export const HOTSPOTS: Record<View3D, Hotspot[]> = { front: FRONT, back: BACK };

export const ZONE_LABELS: Record<string, string> = Object.fromEntries(
  [...FRONT, ...BACK].map((spot) => [spot.zone, spot.label]),
);

/** A diagram rather than an anatomical silhouette — it reads clearly at phone
 *  size and matches the rounded language of the rest of the app. */
function Figure({ view, fill }: { view: View3D; fill: string }) {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 100 190" fill="none">
      <Ellipse cx={50} cy={13} rx={9} ry={10.5} fill={fill} />
      <Rect x={46} y={22} width={8} height={6} rx={3} fill={fill} />
      {/* torso */}
      <Rect x={29} y={27} width={42} height={26} rx={11} fill={fill} />
      <Rect x={33} y={50} width={34} height={22} rx={9} fill={fill} />
      <Rect x={28} y={68} width={44} height={24} rx={12} fill={fill} />
      {/* arms */}
      <Rect x={17} y={30} width={11} height={34} rx={5.5} fill={fill} />
      <Rect x={72} y={30} width={11} height={34} rx={5.5} fill={fill} />
      <Rect x={18} y={62} width={9} height={30} rx={4.5} fill={fill} />
      <Rect x={73} y={62} width={9} height={30} rx={4.5} fill={fill} />
      {/* legs */}
      <Rect x={31} y={89} width={17} height={48} rx={8.5} fill={fill} />
      <Rect x={52} y={89} width={17} height={48} rx={8.5} fill={fill} />
      <Rect x={33} y={133} width={13} height={44} rx={6.5} fill={fill} />
      <Rect x={54} y={133} width={13} height={44} rx={6.5} fill={fill} />
      {/* feet */}
      <Rect x={31} y={176} width={16} height={7} rx={3.5} fill={fill} />
      <Rect x={53} y={176} width={16} height={7} rx={3.5} fill={fill} />
      {view === 'back' ? (
        // Glute shaping, so the back view is distinguishable at a glance.
        <Rect x={30} y={84} width={40} height={16} rx={8} fill={fill} />
      ) : null}
    </Svg>
  );
}

type BodyMapProps = {
  view: View3D;
  /** zone → intensity 1-3. Tapping cycles 1 → 2 → 3 → off. */
  marks: Record<string, number>;
  onToggle: (zone: BodyZone) => void;
  tint: string;
};

export function BodyMap({ view, marks, onToggle, tint }: BodyMapProps) {
  const theme = useTheme();
  const spots = HOTSPOTS[view];

  return (
    <View style={styles.wrapper}>
      <View style={styles.figure}>
        <Figure view={view} fill={theme.surfaceSunken} />

        {spots.map((spot, index) => {
          const intensity = marks[spot.zone] ?? 0;
          return (
            <Pressable
              key={`${spot.zone}-${index}`}
              accessibilityRole="button"
              accessibilityLabel={spot.label}
              accessibilityState={{ selected: intensity > 0 }}
              hitSlop={8}
              onPress={() => onToggle(spot.zone)}
              style={[
                styles.hotspot,
                {
                  left: `${spot.left}%`,
                  top: `${spot.top}%`,
                  width: `${spot.width}%`,
                  height: `${spot.height}%`,
                  borderColor: intensity > 0 ? tint : 'transparent',
                  backgroundColor:
                    intensity > 0 ? tint + INTENSITY_ALPHA[intensity] : 'transparent',
                },
              ]}
            >
              {intensity > 0 ? (
                <Text variant="caption" style={{ color: tint, fontSize: 9 }}>
                  {'•'.repeat(intensity)}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// Hex alpha suffixes for 25% / 45% / 70% fill.
const INTENSITY_ALPHA: Record<number, string> = { 1: '40', 2: '73', 3: 'B3' };

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center' },
  figure: { width: 240, aspectRatio: 100 / 190 },
  hotspot: {
    position: 'absolute',
    borderRadius: radius.sm - 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export const INTENSITY_LABELS = ['', 'Mild', 'Moderate', 'Most'] as const;

export function IntensityKey({ tint }: { tint: string }) {
  return (
    <View style={keyStyles.row}>
      {[1, 2, 3].map((level) => (
        <View key={level} style={keyStyles.item}>
          <View
            style={[
              keyStyles.swatch,
              { backgroundColor: tint + INTENSITY_ALPHA[level], borderColor: tint },
            ]}
          />
          <Text variant="small" tone="muted">
            {INTENSITY_LABELS[level]}
          </Text>
        </View>
      ))}
    </View>
  );
}

const keyStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.base, justifyContent: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  swatch: { width: 14, height: 14, borderRadius: 4, borderWidth: 1.5 },
});
