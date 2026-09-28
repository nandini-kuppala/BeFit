import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
  Easing,
  ReduceMotion,
} from 'react-native-reanimated';

import { motion, useTheme } from '../theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type ProgressRingProps = {
  /** 0–1. Values above 1 are clamped; the caller decides how to signal overshoot. */
  progress: number;
  size?: number;
  strokeWidth?: number;
  color: string;
  trackColor?: string;
  children?: React.ReactNode;
};

export function ProgressRing({
  progress,
  size = 200,
  strokeWidth = 16,
  color,
  trackColor,
  children,
}: ProgressRingProps) {
  const theme = useTheme();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const animated = useSharedValue(0);

  useEffect(() => {
    animated.value = withTiming(Math.min(Math.max(progress, 0), 1), {
      duration: motion.slow * 2,
      easing: Easing.bezier(...motion.easing),
      reduceMotion: ReduceMotion.System,
    });
  }, [progress, animated]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - animated.value),
    // A round line cap still paints a dot at zero progress, which reads as a
    // stray mark on an empty ring.
    strokeOpacity: animated.value < 0.005 ? 0 : 1,
  }));

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {/* Rotated so the ring fills from 12 o'clock rather than 3 o'clock. */}
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={trackColor ?? theme.surfaceSunken}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={circumference}
            animatedProps={animatedProps}
          />
        </G>
      </Svg>
      {children ? <View style={styles.center}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
