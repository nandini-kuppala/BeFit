import { StyleSheet, View } from 'react-native';

import type { Confidence } from '../api/types';
import { confidence as tokens, radius, spacing } from '../theme';
import { Text } from './Text';

/**
 * Provenance made visible.
 *
 * A verified database value and an AI estimate must never look identical on
 * screen — that is the difference between a tracker you can trust and one that
 * quietly drifts.
 */
export function ConfidenceDot({
  level,
  showLabel = false,
}: {
  level: Confidence;
  showLabel?: boolean;
}) {
  const token = tokens[level];
  if (!showLabel) {
    return (
      <View
        accessibilityLabel={token.label}
        style={[styles.dot, { backgroundColor: token.color }]}
      />
    );
  }
  return (
    <View style={[styles.pill, { borderColor: token.color }]}>
      <View style={[styles.dot, { backgroundColor: token.color }]} />
      <Text variant="caption" style={{ color: token.color }}>
        {token.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { width: 7, height: 7, borderRadius: radius.pill },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
});
