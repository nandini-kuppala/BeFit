import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';

import { coach } from '../src/api/befit';
import type { ThreadSummary } from '../src/api/types';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { Icon } from '../src/components/Icon';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Text } from '../src/components/Text';
import { radius, semantic, spacing, useTheme } from '../src/theme';

/** Server timestamps can arrive without a zone (naive UTC from Mongo). */
function parseServerDate(value: string): Date {
  const hasZone = /([zZ]|[+-]\d\d:?\d\d)$/.test(value);
  return new Date(hasZone ? value : `${value}Z`);
}

function relativeDate(value: string, now = new Date()): string {
  const date = parseServerDate(value);
  if (Number.isNaN(date.getTime())) return '';
  const minutes = Math.round((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24 && date.getDate() === now.getDate()) return `${hours} h ago`;

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = Math.ceil((startOfToday - date.getTime()) / 86_400_000);
  if (days <= 1) return 'Yesterday';
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: 'long' });
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}

export default function CoachHistory() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();

  const threads = useQuery({ queryKey: ['coach-threads'], queryFn: () => coach.threads() });

  const remove = useMutation({
    mutationFn: (id: string) => coach.deleteThread(id),
    onSuccess: (_, id) => {
      queryClient.setQueryData<ThreadSummary[]>(['coach-threads'], (current) =>
        current?.filter((thread) => thread.id !== id),
      );
      queryClient.invalidateQueries({ queryKey: ['coach-threads'] });
    },
    onError: (err) => Alert.alert("Couldn't delete", (err as Error).message),
  });

  const confirmDelete = (thread: ThreadSummary) =>
    Alert.alert('Delete this conversation?', `"${thread.title}" will be removed for good.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(thread.id) },
    ]);

  const items = threads.data ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas }}>
      <ScreenHeader
        title="Coach history"
        subtitle={items.length > 0 ? `${items.length} conversation${items.length === 1 ? '' : 's'}` : undefined}
        action={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="New conversation"
            hitSlop={12}
            onPress={() => router.push('/coach')}
            style={({ pressed }) => [
              styles.iconButton,
              { backgroundColor: theme.primarySoft },
              pressed && { opacity: 0.6 },
            ]}
          >
            <Icon name="plus" size={19} color={theme.primary} />
          </Pressable>
        }
      />

      {threads.isPending ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(thread) => thread.id}
          contentContainerStyle={[styles.page, items.length === 0 && { flexGrow: 1 }]}
          refreshControl={
            <RefreshControl
              refreshing={threads.isRefetching}
              onRefresh={() => threads.refetch()}
              tintColor={theme.primary}
              colors={[theme.primary]}
            />
          }
          ListHeaderComponent={
            threads.error ? (
              <Card>
                <Text variant="small" style={{ color: semantic.danger }}>
                  {(threads.error as Error).message}
                </Text>
              </Card>
            ) : null
          }
          ListEmptyComponent={
            threads.error ? null : (
              <View style={styles.empty}>
                <View style={[styles.emptyBadge, { backgroundColor: theme.primarySoft }]}>
                  <Icon name="history" size={26} color={theme.primary} />
                </View>
                <Text variant="h3" center>
                  No conversations yet
                </Text>
                <Text variant="small" tone="muted" center style={{ maxWidth: 260 }}>
                  Chats with the coach are saved here so you can pick one up later.
                </Text>
                <Button
                  label="Ask the coach"
                  size="sm"
                  onPress={() => router.push('/coach')}
                  style={{ marginTop: spacing.sm }}
                />
              </View>
            )
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.title}`}
              onPress={() => router.push(`/coach?thread=${item.id}`)}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: theme.surface, borderColor: theme.border },
                pressed && { opacity: 0.75 },
              ]}
            >
              <View style={{ flex: 1 }}>
                <View style={styles.rowTop}>
                  <Text variant="bodyMedium" numberOfLines={1} style={{ flex: 1 }}>
                    {item.title || 'Conversation'}
                  </Text>
                  <Text variant="small" tone="muted">
                    {relativeDate(item.updated_at)}
                  </Text>
                </View>
                {item.preview ? (
                  <Text variant="small" tone="secondary" numberOfLines={2} style={{ marginTop: 2 }}>
                    {item.preview}
                  </Text>
                ) : null}
                <Text variant="small" tone="muted" tabular style={{ marginTop: spacing.xs }}>
                  {item.message_count} message{item.message_count === 1 ? '' : 's'}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete ${item.title}`}
                hitSlop={10}
                disabled={remove.isPending && remove.variables === item.id}
                onPress={() => confirmDelete(item)}
                style={({ pressed }) => [styles.trash, pressed && { opacity: 0.5 }]}
              >
                {remove.isPending && remove.variables === item.id ? (
                  <ActivityIndicator size="small" color={theme.textMuted} />
                ) : (
                  <Icon name="trash" size={19} color={theme.textMuted} />
                )}
              </Pressable>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: spacing.base, gap: spacing.sm, paddingBottom: spacing['4xl'] * 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingLeft: spacing.base,
    paddingRight: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  trash: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
  emptyBadge: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
});
