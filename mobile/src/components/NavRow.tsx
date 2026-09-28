import { Pressable, StyleSheet, View } from 'react-native';

import { radius, spacing, useTheme } from '../theme';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

type NavRowProps = {
  title: string;
  subtitle?: string;
  icon?: IconName;
  /** Small count or status shown before the chevron. */
  trailing?: string;
  tint?: string;
  onPress: () => void;
};

/**
 * A tappable row that leads somewhere else.
 *
 * Used wherever a section is worth surfacing on a summary screen but not worth
 * the vertical space of showing in full — "Track your micronutrients" being the
 * case this was built for.
 */
export function NavRow({ title, subtitle, icon, trailing, tint, onPress }: NavRowProps) {
  const theme = useTheme();
  const color = tint ?? theme.primary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          shadowColor: theme.shadowColor,
          shadowOpacity: theme.shadowOpacity * 0.5,
        },
        pressed && { opacity: 0.75 },
      ]}
    >
      {icon ? (
        <View style={[styles.badge, { backgroundColor: theme.primarySoft }]}>
          <Icon name={icon} size={18} color={color} />
        </View>
      ) : null}

      <View style={{ flex: 1 }}>
        <Text variant="bodyMedium">{title}</Text>
        {subtitle ? (
          <Text variant="small" tone="muted" numberOfLines={1} style={{ marginTop: 1 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {trailing ? (
        <Text variant="smallMedium" tone="secondary" tabular>
          {trailing}
        </Text>
      ) : null}
      <Icon name="chevronRight" size={18} color={theme.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md + 2,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
  },
  badge: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
