import { Pressable, StyleSheet, View } from 'react-native';

import { radius, useTheme } from '../theme';
import { Icon } from './Icon';

type CheckboxProps = {
  checked: boolean;
  onToggle: () => void;
  label: string;
  size?: number;
  color?: string;
  disabled?: boolean;
  /** Round reads as "tick it off today"; square reads as "part of a set". */
  shape?: 'circle' | 'square';
};

export function Checkbox({
  checked,
  onToggle,
  label,
  size = 26,
  color,
  disabled,
  shape = 'circle',
}: CheckboxProps) {
  const theme = useTheme();
  const tint = color ?? theme.primary;

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !!disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onToggle}
      hitSlop={10}
      style={({ pressed }) => [pressed && !disabled && { opacity: 0.6 }]}
    >
      <View
        style={[
          styles.box,
          {
            width: size,
            height: size,
            borderRadius: shape === 'circle' ? radius.pill : radius.sm - 4,
            borderColor: checked ? tint : theme.borderStrong,
            backgroundColor: checked ? tint : 'transparent',
            opacity: disabled ? 0.45 : 1,
          },
        ]}
      >
        {checked ? (
          <Icon name="check" size={size * 0.6} color={theme.onPrimary} strokeWidth={2.6} />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1.8, alignItems: 'center', justifyContent: 'center' },
});
