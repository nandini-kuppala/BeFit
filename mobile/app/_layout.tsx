import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import {
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform, View, type AppStateStatus } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { loadStoredBaseUrl } from '../src/api/client';
import { queryClient } from '../src/lib/queryClient';
import { useAuth } from '../src/store/auth';
import { useTheme } from '../src/theme';

export const unstable_settings = { initialRouteName: 'index' };

SplashScreen.preventAutoHideAsync().catch(() => {});

// React Native has no window focus or `navigator.onLine`, so TanStack Query's
// defaults never fire there. Teach it: foregrounding the app counts as focus
// (refetch stale screens), and losing the network pauses queries instead of
// burning their retries on requests that can't succeed.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    // Deliberately not `isInternetReachable`: that probes a public URL, and
    // the BeFit server is often on the LAN (or the emulator host) with no
    // internet behind it. Being on *a* network is the useful signal; a
    // genuinely unreachable server surfaces as a status-0 error instead.
    setOnline(state.isConnected !== false);
  }),
);

function onAppStateChange(status: AppStateStatus) {
  if (Platform.OS !== 'web') focusManager.setFocused(status === 'active');
}

export default function RootLayout() {
  const theme = useTheme();
  const restore = useAuth((state) => state.restore);
  const status = useAuth((state) => state.status);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  const [serverLoaded, setServerLoaded] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => subscription.remove();
  }, []);

  // Signing out mid-session (or the refresh token being rejected) has to leave
  // whatever screen she's on; nothing else watches the status after launch.
  const previousStatus = useRef(status);
  useEffect(() => {
    const previous = previousStatus.current;
    previousStatus.current = status;
    if (status === 'signed-out' && previous !== 'signed-out' && previous !== 'loading') {
      if (router.canDismiss()) router.dismissAll();
      router.replace('/sign-in');
    }
  }, [status, router]);

  useEffect(() => {
    // The saved server address has to be in place before the first request, so
    // token restore waits on it.
    let cancelled = false;
    (async () => {
      await loadStoredBaseUrl();
      if (cancelled) return;
      setServerLoaded(true);
      restore();
    })();
    return () => {
      cancelled = true;
    };
  }, [restore]);

  useEffect(() => {
    if (fontsLoaded && serverLoaded && status !== 'loading') {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, serverLoaded, status]);

  if (!fontsLoaded || !serverLoaded || status === 'loading') {
    return <View style={{ flex: 1, backgroundColor: theme.canvas }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <KeyboardProvider>
          <SafeAreaProvider>
            <StatusBar style={theme.isDark ? 'light' : 'dark'} />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: theme.canvas },
                animation: 'fade',
              }}
            >
              {/* Order matters: the first declared screen becomes the initial
                  route, so `index` must come before the modal. */}
              <Stack.Screen name="index" />
              <Stack.Screen name="sign-in" />
              <Stack.Screen name="onboarding" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen
                name="log"
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="coach"
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="body-scan"
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
              {/* Detail screens push from the right — they are places you go,
                  not sheets you summon. */}
              <Stack.Screen name="server" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="micros" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="supplements" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="progress" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="diet-edit" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="workout-edit" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen
                name="meal-edit"
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="food-new"
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
              {/* Food logging: one add flow, reached from Home, the Food tab and
                  the centre button, with scan / photo / recipe branching off it. */}
              <Stack.Screen
                name="food-add"
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="food-scan"
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="food-photo"
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen name="food-correct" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen
                name="recipe-edit"
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="coach-history" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="privacy" options={{ animation: 'slide_from_right' }} />
            </Stack>
          </SafeAreaProvider>
        </KeyboardProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
