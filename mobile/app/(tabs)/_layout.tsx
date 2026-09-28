import * as Haptics from 'expo-haptics';
import { Tabs, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '../../src/components/Icon';
import { Text } from '../../src/components/Text';
import { radius, shadow, spacing, useTheme } from '../../src/theme';

const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Today', icon: 'today' },
  { name: 'food', title: 'Food', icon: 'food' },
  { name: 'train', title: 'Train', icon: 'train' },
  { name: 'body', title: 'Body', icon: 'body' },
];

// Two tabs, the log button, then two more — so the button sits dead centre
// and stays in the thumb's natural arc.
const LEFT = TABS.slice(0, 2);
const RIGHT = TABS.slice(2);

export default function TabsLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={({ state, navigation }) => {
        const renderTab = (tab: (typeof TABS)[number]) => {
          const routeIndex = state.routes.findIndex((r) => r.name === tab.name);
          const focused = state.index === routeIndex;
          return (
            <Pressable
              key={tab.name}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={tab.title}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                navigation.navigate(tab.name);
              }}
              style={styles.tab}
              hitSlop={8}
            >
              <Icon
                name={tab.icon}
                size={23}
                color={focused ? theme.primary : theme.textMuted}
                filled={focused}
              />
              <Text
                variant="caption"
                style={{
                  color: focused ? theme.primary : theme.textMuted,
                  fontSize: 10,
                  letterSpacing: 0.2,
                }}
              >
                {tab.title}
              </Text>
            </Pressable>
          );
        };

        return (
          <View
            style={[
              styles.bar,
              {
                backgroundColor: theme.surface,
                borderTopColor: theme.border,
                paddingBottom: insets.bottom || spacing.md,
              },
            ]}
          >
            {LEFT.map(renderTab)}

            <View style={styles.fabSlot}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Log food by voice"
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                  router.push('/log');
                }}
                style={({ pressed }) => [
                  styles.fab,
                  { backgroundColor: theme.primary },
                  shadow(theme, 2),
                  pressed && { transform: [{ scale: 0.94 }] },
                ]}
              >
                <Icon name="mic" size={26} color={theme.onPrimary} strokeWidth={2} />
              </Pressable>
            </View>

            {RIGHT.map(renderTab)}
          </View>
        );
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.title }} />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 2 },
  fabSlot: { flex: 1, alignItems: 'center' },
  fab: {
    position: 'absolute',
    top: -32,
    width: 58,
    height: 58,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
