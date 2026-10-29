import { useState, type ReactNode, type Ref } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  KeyboardAvoidingView,
  KeyboardAwareScrollView,
  KeyboardStickyView,
  type KeyboardAwareScrollViewProps,
  type KeyboardAwareScrollViewRef,
} from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing, useTheme } from '../theme';

type KeyboardScreenProps = {
  children: ReactNode;
  /** Fixed above the content; never scrolls, never moves. */
  header?: ReactNode;
  /**
   * Pinned to the bottom and carried up on top of the keyboard — a Save
   * button, a composer. The safe-area bottom inset is added for you (see
   * `safeAreaBottom`), so don't pad for it yourself.
   */
  footer?: ReactNode;
  /**
   * `true` (default): children go in a scroll view that keeps the focused
   * input visible above the keyboard (and above the footer).
   *
   * `false`: children are laid out as-is in a flex:1 area that shrinks when
   * the keyboard opens. Use this when the content is its own list — a
   * FlatList, an inverted chat — so it isn't nested in a ScrollView.
   */
  scroll?: boolean;
  /** Pad the footer by the bottom safe-area inset. Default true. */
  safeAreaBottom?: boolean;
  /** Gap between the focused input and the keyboard (or footer). Default 16. */
  bottomOffset?: number;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  footerStyle?: StyleProp<ViewStyle>;
  /** Passed through to the KeyboardAwareScrollView when `scroll` is true. */
  scrollProps?: Omit<KeyboardAwareScrollViewProps, 'children' | 'contentContainerStyle'>;
  scrollRef?: Ref<KeyboardAwareScrollViewRef>;
};

/**
 * Screen scaffold that handles the keyboard on both platforms.
 *
 * React Native's own KeyboardAvoidingView does nothing on Android once the
 * app is edge-to-edge (SDK 54+ is always edge-to-edge): the window no longer
 * resizes, so `behavior={undefined}` leaves inputs under the keyboard. This
 * uses react-native-keyboard-controller, which reads the real keyboard frame
 * on both platforms and animates in step with it.
 *
 * Requires `<KeyboardProvider>` above it (set up in app/_layout.tsx).
 */
export function KeyboardScreen({
  children,
  header,
  footer,
  scroll = true,
  safeAreaBottom = true,
  bottomOffset = spacing.base,
  style,
  contentContainerStyle,
  footerStyle,
  scrollProps,
  scrollRef,
}: KeyboardScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [footerHeight, setFooterHeight] = useState(0);
  const bottomInset = safeAreaBottom ? insets.bottom : 0;

  const footerNode = footer ? (
    <View
      // Opaque, because it slides up over the scrolled content.
      style={[{ paddingBottom: bottomInset, backgroundColor: theme.canvas }, footerStyle]}
      onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
    >
      {footer}
    </View>
  ) : null;

  if (!scroll) {
    // The whole column shrinks by the keyboard height. The negative offset
    // gives back the safe-area inset the footer is already padded with, so
    // the footer sits flush on the keyboard instead of floating above it.
    return (
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={footer ? -bottomInset : 0}
        style={[styles.fill, { backgroundColor: theme.canvas }, style]}
      >
        {header}
        <View style={styles.fill}>{children}</View>
        {footerNode}
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: theme.canvas }, style]}>
      {header}
      <KeyboardAwareScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        {...scrollProps}
        style={[styles.fill, scrollProps?.style]}
        contentContainerStyle={contentContainerStyle}
        // Keep the focused field clear of the footer riding on the keyboard,
        // not just of the keyboard itself.
        bottomOffset={bottomOffset + (footer ? footerHeight - bottomInset : 0)}
        extraKeyboardSpace={footer ? -bottomInset : 0}
      >
        {children}
      </KeyboardAwareScrollView>
      {footerNode ? (
        <KeyboardStickyView offset={{ closed: 0, opened: bottomInset }}>
          {footerNode}
        </KeyboardStickyView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
