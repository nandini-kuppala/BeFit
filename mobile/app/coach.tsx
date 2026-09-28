import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { coach, type ChatMessage } from '../src/api/befit';
import { Card } from '../src/components/Card';
import { Icon } from '../src/components/Icon';
import { Text } from '../src/components/Text';
import { radius, semantic, shadow, spacing, useTheme } from '../src/theme';

export default function Coach() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);

  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const suggestions = useQuery({
    queryKey: ['coach-suggestions'],
    queryFn: () => coach.suggestions(),
  });

  const send = useMutation({
    mutationFn: (text: string) => coach.send(text, threadId),
    onMutate: (text) => {
      // Show her message straight away; waiting on the round trip to echo it
      // back makes the app feel broken.
      setMessages((current) => [
        ...current,
        { role: 'user', content: text, at: new Date().toISOString() },
      ]);
      setDraft('');
      setError(null);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    },
    onSuccess: (result) => {
      setThreadId(result.thread_id);
      setMessages(result.messages);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    },
    onError: (err) => setError((err as Error).message),
  });

  const empty = messages.length === 0;

  function submit(text: string) {
    const trimmed = text.trim();
    if (trimmed.length === 0 || send.isPending) return;
    send.mutate(trimmed);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.canvas }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + spacing.base, borderBottomColor: theme.border },
        ]}
      >
        <View style={styles.headerTitle}>
          <Icon name="sparkle" size={20} color={theme.primary} />
          <Text variant="h2">Coach</Text>
        </View>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Close">
          <Icon name="close" size={22} color={theme.textSecondary} />
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.body, { paddingBottom: spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        {empty ? (
          <>
            <Card variant="tinted">
              <Text variant="smallMedium" tone="primary">
                Ask me about your own data
              </Text>
              <Text variant="small" tone="secondary" style={{ marginTop: spacing.xs }}>
                I can see today's log, your targets and your health conditions, so
                answers are about you rather than generic advice. I can't advise on
                medication doses — that's your doctor's call.
              </Text>
            </Card>

            <Text variant="caption" tone="muted" style={{ marginTop: spacing.sm }}>
              Try asking
            </Text>
            <View style={{ gap: spacing.sm }}>
              {(suggestions.data ?? []).map((prompt) => (
                <Pressable
                  key={prompt}
                  onPress={() => submit(prompt)}
                  style={({ pressed }) => [
                    styles.suggestion,
                    { borderColor: theme.border, backgroundColor: theme.surface },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text variant="small" tone="secondary">
                    {prompt}
                  </Text>
                  <Icon name="chevronRight" size={16} color={theme.textMuted} />
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          messages.map((message, index) => (
            <View
              key={`${message.role}-${index}`}
              style={[
                styles.bubble,
                message.role === 'user'
                  ? [styles.userBubble, { backgroundColor: theme.primary }]
                  : [
                      styles.coachBubble,
                      { backgroundColor: theme.surface, borderColor: theme.border },
                    ],
              ]}
            >
              <Text
                variant="body"
                tone={message.role === 'user' ? 'inverse' : 'default'}
                style={styles.bubbleText}
              >
                {message.content}
              </Text>
            </View>
          ))
        )}

        {send.isPending ? (
          <View
            style={[
              styles.bubble,
              styles.coachBubble,
              styles.thinking,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <ActivityIndicator size="small" color={theme.primary} />
            <Text variant="small" tone="muted">
              Thinking…
            </Text>
          </View>
        ) : null}

        {error ? (
          <View style={[styles.error, { backgroundColor: theme.surfaceSunken }]}>
            <Text variant="small" style={{ color: semantic.danger }}>
              {error}
            </Text>
          </View>
        ) : null}

        {!empty ? (
          <Text variant="small" tone="muted" center style={styles.disclaimer}>
            Not medical advice. For anything clinical, ask your doctor.
          </Text>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.composer,
          { paddingBottom: insets.bottom + spacing.base, borderTopColor: theme.border },
        ]}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask about your nutrition or training…"
          placeholderTextColor={theme.textMuted}
          multiline
          style={[
            styles.input,
            { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          disabled={draft.trim().length === 0 || send.isPending}
          onPress={() => submit(draft)}
          style={({ pressed }) => [
            styles.send,
            { backgroundColor: theme.primary },
            shadow(theme, 1),
            (draft.trim().length === 0 || send.isPending) && { opacity: 0.4 },
            pressed && { transform: [{ scale: 0.94 }] },
          ]}
        >
          <Icon name="chevronRight" size={20} color={theme.onPrimary} strokeWidth={2.4} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  body: { padding: spacing.lg, gap: spacing.md },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  bubble: { maxWidth: '88%', borderRadius: radius.lg, paddingHorizontal: spacing.base, paddingVertical: spacing.md },
  userBubble: { alignSelf: 'flex-end', borderBottomRightRadius: radius.sm },
  coachBubble: { alignSelf: 'flex-start', borderBottomLeftRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth * 2 },
  bubbleText: { lineHeight: 22 },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  error: { padding: spacing.md, borderRadius: radius.sm },
  disclaimer: { marginTop: spacing.md },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 130,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
  },
  send: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
