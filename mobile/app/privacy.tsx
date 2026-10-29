import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Card } from '../src/components/Card';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Text } from '../src/components/Text';
import { spacing, useTheme } from '../src/theme';

type Processor = { name: string; when: string; what: string };

const PROCESSORS: Processor[] = [
  {
    name: 'Google Gemini',
    when: 'When you describe or photograph food, scan a body-composition report, or chat with the coach.',
    what:
      'The text, photo or chat message, plus the context the coach needs (today’s log, targets, health conditions). ' +
      'BeFit may use Gemini’s free tier, where Google can use inputs to improve its products — so keep names, ' +
      'addresses and other identifying details out of coach messages.',
  },
  {
    name: 'Sarvam AI',
    when: 'Only when you use voice input.',
    what: 'The audio recording, for transcription. BeFit keeps the text and discards the audio.',
  },
  {
    name: 'USDA FoodData Central, Open Food Facts, Tavily',
    when: 'When a food isn’t already in BeFit’s own database.',
    what: 'The food name or barcode only — nothing about you.',
  },
];

const STORED = [
  'Account email (and a hashed password — never the password itself)',
  'Profile: name, age, height, goal, activity level, health conditions, medications, dietary rules and routine',
  'Food, water, sleep, weight and workout logs',
  'Diet and workout plans, saved meals, custom foods and supplements',
  'Body-scan numbers you confirm — not the scan images, which are read and discarded',
  'Coach conversations',
];

export default function Privacy() {
  const theme = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas }}>
      <ScreenHeader title="Privacy & disclaimer" />

      <ScrollView contentContainerStyle={styles.page}>
        <Card variant="tinted">
          <Text variant="h3" tone="primary">
            Not a medical device
          </Text>
          <Text variant="body" tone="secondary" style={styles.para}>
            BeFit is a tracking tool. It does not diagnose, treat, cure or prevent any condition,
            and its targets, estimates and coach replies are not medical advice. Talk to your
            doctor before changing your diet or training — and always about thyroid medication,
            its dose or timing.
          </Text>
        </Card>

        <Section title="What BeFit stores">
          {STORED.map((item) => (
            <Bullet key={item}>{item}</Bullet>
          ))}
          <Text variant="small" tone="muted" style={styles.para}>
            It lives on the BeFit server your app points to (Settings → Server). There are no ads
            and no analytics trackers.
          </Text>
        </Section>

        <Section title="Who else processes it">
          {PROCESSORS.map((processor) => (
            <View key={processor.name} style={styles.processor}>
              <Text variant="bodyMedium">{processor.name}</Text>
              <Text variant="small" tone="secondary" style={{ marginTop: 2 }}>
                {processor.when}
              </Text>
              <Text variant="small" tone="muted" style={{ marginTop: 2 }}>
                {processor.what}
              </Text>
            </View>
          ))}
        </Section>

        <Section title="Your rights">
          <Bullet>Export: Settings → Export my data gives you everything as JSON.</Bullet>
          <Bullet>
            Delete: Settings → Delete account permanently removes your account and all of its
            data. It can’t be undone.
          </Bullet>
          <Bullet>Delete a single coach chat any time from the coach history.</Bullet>
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <Text variant="h3">{title}</Text>
      <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>{children}</View>
    </Card>
  );
}

function Bullet({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.bullet}>
      <View style={[styles.dot, { backgroundColor: theme.primary }]} />
      <Text variant="small" tone="secondary" style={{ flex: 1 }}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: spacing.base, gap: spacing.md, paddingBottom: spacing['4xl'] * 2 },
  para: { marginTop: spacing.sm },
  processor: { paddingVertical: spacing.xs },
  bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 7 },
});
