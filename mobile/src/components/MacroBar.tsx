import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { motion, radius, spacing, useTheme } from '../theme';
import { Text } from './Text';

type MacroBarProps = {
  label: string;
  consumed: number;
  target: number;
  unit?: string;
  color: string;
};

export function MacroBar({ label, consumed, target, unit = 'g', color }: MacroBarProps) {
  const theme = useTheme();
  const ratio = target > 0 ? consumed / target : 0;
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withTiming(Math.min(ratio, 1), {
      duration: motion.slow,
      easing: Easing.bezier(...motion.easing),
      reduceMotion: ReduceMotion.System,
    });
  }, [ratio, width]);

  const fill = useAnimatedStyle(() => ({ width: `${width.value * 100}%` }));

  return (
    <View style={styles.row}>
      <View style={styles.header}>
        <Text variant="smallMedium">{label}</Text>
        <Text variant="small" tone="secondary" tabular>
          {Math.round(consumed)}
          <Text variant="small" tone="muted" tabular>
            {` / ${Math.round(target)}${unit}`}
          </Text>
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: theme.surfaceSunken }]}>
        <Animated.View style={[styles.fill, { backgroundColor: color }, fill]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.xs, flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  track: { height: 7, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
});
