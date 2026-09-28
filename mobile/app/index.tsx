import { Redirect } from 'expo-router';

import { useAuth } from '../src/store/auth';

export default function Index() {
  const status = useAuth((state) => state.status);

  if (status === 'signed-out') return <Redirect href="/sign-in" />;
  if (status === 'needs-onboarding') return <Redirect href="/onboarding" />;
  return <Redirect href="/(tabs)" />;
}
