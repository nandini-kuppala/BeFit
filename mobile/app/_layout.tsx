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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { loadStoredBaseUrl } from '../src/api/client';
import { useAuth } from '../src/store/auth';
import { useTheme } from '../src/theme';

export const unstable_settings = { initialRouteName: 'index' };

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Logging is the point of this app, so data should feel live without
      // hammering a free-tier backend.
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

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
          </Stack>
        </SafeAreaProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
