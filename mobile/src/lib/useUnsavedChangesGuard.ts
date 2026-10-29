import { usePreventRemove } from 'expo-router/react-navigation';
import { useNavigation } from 'expo-router';
import { Alert } from 'react-native';

/**
 * Asks before leaving a screen with unsaved edits — back button, swipe, the
 * Android hardware back, or a header back arrow that calls `router.back()`.
 *
 * Pass `dirty = false` while a save is in flight or right after it succeeds,
 * so the screen can close itself without prompting.
 */
export function useUnsavedChangesGuard(
  dirty: boolean,
  message = 'You have changes that haven’t been saved. Discard them?',
) {
  const navigation = useNavigation();

  usePreventRemove(dirty, ({ data }) => {
    Alert.alert('Discard changes?', message, [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => navigation.dispatch(data.action),
      },
    ]);
  });
}
