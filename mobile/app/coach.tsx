import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
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
  const queryClient = useQueryClient();
  const listRef = useRef<FlatList<ChatMessage>>(null);
  // Opened from coach history: `/coach?thread=<id>`.
  const params = useLocalSearchParams<{ thread?: string | string[] }>();
  const requestedThread = Array.isArray(params.thread) ? params.thread[0] : params.thread;

  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const suggestions = useQuery({
    queryKey: ['coach-suggestions'],
    queryFn: () => coach.suggestions(),
  });

  const savedThread = useQuery({
    queryKey: ['coach-thread', requestedThread],
    queryFn: () => coach.thread(requestedThread!),
    enabled: !!requestedThread,
  });

  // Seed the conversation once per requested thread. Later refetches must not
  // clobber messages she has sent since, and "new chat" must stay new.
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    const loaded = savedThread.data;
    if (!requestedThread || !loaded || seededFor.current === requestedThread) return;
    seededFor.current = requestedThread;
    setThreadId(loaded._id ?? loaded.id ?? requestedThread);
    setMessages(loaded.messages ?? []);
    setError(null);
  }, [requestedThread, savedThread.data]);

  const loadingThread =
    !!requestedThread && seededFor.current !== requestedThread && savedThread.isPending;

  function startNewChat() {
    seededFor.current = requestedThread ?? null;
    setMessages([]);
    setThreadId(null);
    setDraft('');
    setError(null);
    if (requestedThread) router.setParams({ thread: undefined });
  }

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
      // Inverted list: offset 0 is the newest message.
      requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }));
    },
    onSuccess: (result) => {
      setThreadId(result.thread_id);
      setMessages(result.messages);
      queryClient.invalidateQueries({ queryKey: ['coach-threads'] });
      queryClient.invalidateQueries({ queryKey: ['coach-thread', result.thread_id] });
      requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }));
    },
    onError: (err) => setError((err as Error).message),
  });

  const empty = messages.length === 0;
  // An inverted list renders its data bottom-up, so newest goes first.
  const newestFirst = useMemo(() => [...messages].reverse(), [messages]);

  function submit(text: string) {
    const trimmed = text.trim();
    if (trimmed.length === 0 || send.isPending) return;
    send.mutate(trimmed);
  }

  return (
    // keyboard-controller's KAV works on edge-to-edge Android, where RN's own
    // does nothing. The negative offset hands back the composer's safe-area
    // padding so it sits flush on the keyboard.
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.canvas }}
      behavior="padding"
      keyboardVerticalOffset={-insets.bottom}
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
        <View style={styles.headerActions}>
          {!empty || threadId ? (
            <Pressable
              onPress={startNewChat}
              disabled={send.isPending}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="New chat"
              style={({ pressed }) => [(pressed || send.isPending) && { opacity: 0.5 }]}
            >
              <Icon name="plus" size={22} color={theme.textSecondary} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => router.push('/coach-history')}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Past conversations"
            style={({ pressed }) => [pressed && { opacity: 0.5 }]}
          >
            <Icon name="history" size={22} color={theme.textSecondary} />
          </Pressable>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Close">
            <Icon name="close" size={22} color={theme.textSecondary} />
          </Pressable>
        </View>
      </View>

      {loadingThread ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : requestedThread && savedThread.error && seededFor.current !== requestedThread ? (
        <View style={[styles.body, { flex: 1 }]}>
          <ErrorNote message={(savedThread.error as Error).message} />
          <Pressable onPress={startNewChat} hitSlop={8}>
            <Text variant="smallMedium" tone="primary">
              Start a new chat instead
            </Text>
          </Pressable>
        </View>
      ) : empty ? (
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: spacing.xl }]}
          keyboardShouldPersistTaps="handled"
        >
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

          {send.isPending ? <Thinking /> : null}
          {error ? <ErrorNote message={error} /> : null}
        </ScrollView>
      ) : (
        // Inverted: the list is anchored to the bottom, opens on the newest
        // message, and only renders what's on screen — a ScrollView + map
        // rendered every bubble of a long thread on each keystroke.
        <FlatList
          ref={listRef}
          inverted
          data={newestFirst}
          keyExtractor={(message, index) => `${message.role}-${messages.length - 1 - index}`}
          // Inverted flips the container, so paddingTop is the visual bottom.
          contentContainerStyle={[styles.body, { paddingTop: spacing.xl }]}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item: message }) => (
            <View
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
          )}
          // Inverted, so the "header" renders at the bottom, under the newest.
          ListHeaderComponent={
            <>
              {send.isPending ? <Thinking /> : null}
              {error ? <ErrorNote message={error} /> : null}
              <Text variant="small" tone="muted" center style={styles.disclaimer}>
                Not medical advice. For anything clinical, ask your doctor.
              </Text>
            </>
          }
          ListHeaderComponentStyle={{ gap: spacing.md }}
        />
      )}

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

function Thinking() {
  const theme = useTheme();
  return (
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
  );
}

function ErrorNote({ message }: { message: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.error, { backgroundColor: theme.surfaceSunken }]}>
      <Text variant="small" style={{ color: semantic.danger }}>
        {message}
      </Text>
    </View>
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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
