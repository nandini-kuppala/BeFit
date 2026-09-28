import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { motion, radius, spacing, useTheme } from '../theme';
import { Text } from './Text';

export type Bar = {
  label: string;
  /** null renders an empty slot rather than a zero bar, so a day with no entry
   *  reads as "not recorded" instead of "nothing". */
  value: number | null;
  /** Marks today, or whichever column deserves emphasis. */
  highlight?: boolean;
};

type BarChartProps = {
  bars: Bar[];
  /** Full height of the track. Bars scale against this, not against the tallest
   *  bar, so the target line stays meaningful week to week. */
  max: number;
  color: string;
  height?: number;
  /** Draws a dashed reference line, e.g. the 8-hour sleep target. The line is
   *  deliberately unlabelled — a tag inside the plot collides with whichever
   *  bar happens to be tall that week. Name the target in surrounding copy. */
  target?: number;
  /** Rendered under each bar. */
  format?: (value: number) => string;
};

export function BarChart({ bars, max, color, height = 108, target, format }: BarChartProps) {
  const theme = useTheme();
  const safeMax = max > 0 ? max : 1;
  const targetRatio = target != null ? Math.min(target / safeMax, 1) : null;

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={[styles.plot, { height }]}>
        {targetRatio != null ? (
          <View
            pointerEvents="none"
            style={[styles.targetLine, { bottom: targetRatio * height }]}
          >
            {/* Drawn as discrete segments rather than `borderStyle: 'dashed'`,
                which Android silently renders solid on a single-side border. */}
            <View style={styles.dashes}>
              {Array.from({ length: 28 }).map((_, index) => (
                <View
                  key={index}
                  style={[styles.dash, { backgroundColor: theme.borderStrong }]}
                />
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.bars}>
          {bars.map((bar, index) => (
            <Column
              key={`${bar.label}-${index}`}
              bar={bar}
              index={index}
              max={safeMax}
              height={height}
              color={color}
            />
          ))}
        </View>
      </View>

      <View style={styles.labels}>
        {bars.map((bar, index) => (
          <View key={`${bar.label}-label-${index}`} style={styles.labelCell}>
            <Text
              variant="caption"
              tone={bar.highlight ? 'primary' : 'muted'}
              style={{ fontSize: 10 }}
            >
              {bar.label}
            </Text>
            {format && bar.value != null ? (
              <Text variant="caption" tone="secondary" tabular style={{ fontSize: 9.5 }}>
                {format(bar.value)}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function Column({
  bar,
  index,
  max,
  height,
  color,
}: {
  bar: Bar;
  index: number;
  max: number;
  height: number;
  color: string;
}) {
  const theme = useTheme();
  const grow = useSharedValue(0);
  const ratio = bar.value == null ? 0 : Math.min(bar.value / max, 1);

  useEffect(() => {
    // Staggered so the week reads left to right as it draws.
    grow.value = withDelay(index * 45, withTiming(ratio, { duration: motion.slow }));
  }, [grow, index, ratio]);

  const animated = useAnimatedStyle(() => ({
    height: Math.max(grow.value * height, bar.value == null ? 0 : 3),
  }));

  return (
    <View style={styles.column}>
      <View style={[styles.track, { height, backgroundColor: theme.surfaceSunken }]}>
        {bar.value == null ? (
          <View style={[styles.emptyMark, { backgroundColor: theme.border }]} />
        ) : (
          <Animated.View
            style={[
              styles.fill,
              animated,
              { backgroundColor: color, opacity: bar.highlight ? 1 : 0.72 },
            ]}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plot: { position: 'relative', justifyContent: 'flex-end' },
  bars: { flexDirection: 'row', gap: spacing.xs + 2, alignItems: 'flex-end' },
  column: { flex: 1 },
  track: {
    width: '100%',
    borderRadius: radius.sm - 4,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  fill: { width: '100%', borderRadius: radius.sm - 4 },
  emptyMark: { width: 10, height: 2, borderRadius: 1, marginBottom: 6 },
  targetLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1,
    alignItems: 'flex-end',
  },
  dashes: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dash: { width: 4, height: 1 },
  labels: { flexDirection: 'row', gap: spacing.xs + 2 },
  labelCell: { flex: 1, alignItems: 'center', gap: 1 },
});
