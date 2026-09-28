import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { supplements as api, type SupplementBody } from '../src/api/befit';
import {
  SUPPLEMENT_TIME_LABELS,
  SUPPLEMENT_TIME_ORDER,
  type Supplement,
  type SupplementTime,
} from '../src/api/types';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { Icon } from '../src/components/Icon';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Text } from '../src/components/Text';
import { radius, semantic, spacing, useTheme } from '../src/theme';

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const BLANK: SupplementBody = {
  name: '',
  dose: '',
  time_of_day: 'breakfast',
  days: [],
  note: '',
  is_active: true,
};

export default function Supplements() {
  const theme = useTheme();
  const queryClient = useQueryClient();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SupplementBody | null>(null);

  const list = useQuery({ queryKey: ['supplements'], queryFn: () => api.list() });

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['supplements'] }),
      queryClient.invalidateQueries({ queryKey: ['supplements-today'] }),
    ]);

  const save = useMutation({
    mutationFn: () =>
      editingId && editingId !== 'new'
        ? api.update(editingId, draft!)
        : api.create(draft!),
    onSuccess: async () => {
      await refresh();
      setEditingId(null);
      setDraft(null);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.remove(id),
    onSuccess: async () => {
      await refresh();
      setEditingId(null);
      setDraft(null);
    },
  });

  const starter = useMutation({
    mutationFn: () => api.addStarterSet(),
    onSuccess: refresh,
  });

  const items = list.data ?? [];
  const editing = editingId !== null && draft !== null;

  const openNew = () => {
    setEditingId('new');
    setDraft({ ...BLANK });
  };

  const openEdit = (item: Supplement) => {
    setEditingId(item.id);
    setDraft({
      name: item.name,
      dose: item.dose,
      time_of_day: item.time_of_day,
      days: item.days,
      note: item.note ?? '',
      is_active: item.is_active,
    });
  };

  const confirmDelete = (item: Supplement) =>
    Alert.alert('Remove supplement', `Remove ${item.name} and its history?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => remove.mutate(item.id) },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas }}>
      <ScreenHeader
        title="Supplements"
        subtitle={items.length ? `${items.length} set up` : undefined}
        action={
          !editing ? (
            <Pressable
              onPress={openNew}
              accessibilityLabel="Add supplement"
              hitSlop={10}
              style={({ pressed }) => [
                styles.addButton,
                { backgroundColor: theme.primary },
                pressed && { opacity: 0.8 },
              ]}
            >
              <Icon name="plus" size={18} color={theme.onPrimary} strokeWidth={2.4} />
            </Pressable>
          ) : undefined
        }
      />

      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        {editing ? (
          <Editor
            draft={draft!}
            onChange={setDraft}
            onCancel={() => {
              setEditingId(null);
              setDraft(null);
            }}
            onSave={() => save.mutate()}
            saving={save.isPending}
            error={save.isError ? (save.error as Error).message : null}
          />
        ) : null}

        {!editing && items.length === 0 && !list.isLoading ? (
          <Card variant="tinted">
            <Text variant="smallMedium" tone="primary">
              Nothing here yet
            </Text>
            <Text variant="small" tone="secondary" style={{ marginTop: spacing.xs }}>
              Add what you actually take, or start from a common set for someone on
              levothyroxine and edit it down.
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <Button
                label="Use a starter set"
                size="sm"
                variant="secondary"
                onPress={() => starter.mutate()}
                loading={starter.isPending}
                style={{ flex: 1 }}
              />
              <Button label="Add my own" size="sm" onPress={openNew} style={{ flex: 1 }} />
            </View>
          </Card>
        ) : null}

        {!editing && items.length > 0
          ? items.map((item) => (
              <Card key={item.id} padded={false}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.titleRow}>
                      <Text variant="bodyMedium">{item.name}</Text>
                      {!item.is_active ? (
                        <View style={[styles.tag, { backgroundColor: theme.surfaceSunken }]}>
                          <Text variant="caption" tone="muted" style={{ fontSize: 9 }}>
                            Paused
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text variant="small" tone="secondary" style={{ marginTop: 2 }}>
                      {[item.dose, item.time_label].filter(Boolean).join(' · ')}
                    </Text>
                    <Text variant="small" tone="muted" style={{ marginTop: 2, fontSize: 11.5 }}>
                      {item.days.length === 0
                        ? 'Every day'
                        : item.days.map((day) => DAY_SHORT[day]).join(', ')}
                    </Text>
                    {item.note ? (
                      <Text variant="small" tone="muted" style={{ marginTop: spacing.xs }}>
                        {item.note}
                      </Text>
                    ) : null}
                  </View>

                  <View style={styles.actions}>
                    <Pressable onPress={() => openEdit(item)} hitSlop={10}>
                      <Icon name="edit" size={18} color={theme.textMuted} />
                    </Pressable>
                    <Pressable onPress={() => confirmDelete(item)} hitSlop={10}>
                      <Icon name="trash" size={18} color={theme.textMuted} />
                    </Pressable>
                  </View>
                </View>
              </Card>
            ))
          : null}

        {!editing && items.length > 0 ? (
          <Text variant="small" tone="muted" style={{ marginTop: spacing.xs }}>
            BeFit flags anything that binds levothyroxine — iron, calcium, magnesium, zinc
            and most multivitamins — so the four-hour gap doesn't rely on memory.
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Editor({
  draft,
  onChange,
  onCancel,
  onSave,
  saving,
  error,
}: {
  draft: SupplementBody;
  onChange: (next: SupplementBody) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  error: string | null;
}) {
  const theme = useTheme();
  const set = (patch: Partial<SupplementBody>) => onChange({ ...draft, ...patch });

  const inputStyle = [
    styles.input,
    { backgroundColor: theme.surfaceSunken, borderColor: theme.border, color: theme.text },
  ];

  return (
    <Card>
      <Text variant="caption" tone="muted">
        {draft.name ? 'Edit supplement' : 'New supplement'}
      </Text>

      <View style={{ gap: spacing.md, marginTop: spacing.md }}>
        <Field label="Name">
          <TextInput
            value={draft.name}
            onChangeText={(name) => set({ name })}
            placeholder="Vitamin D3"
            placeholderTextColor={theme.textMuted}
            style={inputStyle}
            autoFocus={!draft.name}
          />
        </Field>

        <Field label="Dose">
          <TextInput
            value={draft.dose}
            onChangeText={(dose) => set({ dose })}
            placeholder="60,000 IU"
            placeholderTextColor={theme.textMuted}
            style={inputStyle}
          />
        </Field>

        <Field label="When">
          <View style={styles.chips}>
            {SUPPLEMENT_TIME_ORDER.map((slot: SupplementTime) => {
              const active = draft.time_of_day === slot;
              return (
                <Pressable
                  key={slot}
                  onPress={() => set({ time_of_day: slot })}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? theme.primary : theme.surfaceSunken,
                      borderColor: active ? theme.primary : theme.border,
                    },
                  ]}
                >
                  <Text variant="caption" tone={active ? 'inverse' : 'secondary'}>
                    {SUPPLEMENT_TIME_LABELS[slot]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Field>

        <Field label="Days — leave all off for every day">
          <View style={styles.chips}>
            {DAY_SHORT.map((label, index) => {
              const active = draft.days.includes(index);
              return (
                <Pressable
                  key={label}
                  onPress={() =>
                    set({
                      days: active
                        ? draft.days.filter((day) => day !== index)
                        : [...draft.days, index].sort(),
                    })
                  }
                  style={[
                    styles.dayChip,
                    {
                      backgroundColor: active ? theme.primary : theme.surfaceSunken,
                      borderColor: active ? theme.primary : theme.border,
                    },
                  ]}
                >
                  <Text variant="caption" tone={active ? 'inverse' : 'secondary'} style={{ fontSize: 10 }}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Field>

        <Field label="Note">
          <TextInput
            value={draft.note ?? ''}
            onChangeText={(note) => set({ note })}
            placeholder="Take with food"
            placeholderTextColor={theme.textMuted}
            multiline
            style={[...inputStyle, styles.multiline]}
          />
        </Field>

        <Pressable
          onPress={() => set({ is_active: !draft.is_active })}
          style={styles.toggleRow}
        >
          <Text variant="small" tone="secondary">
            {draft.is_active ? 'Active' : 'Paused — hidden from today'}
          </Text>
          <View
            style={[
              styles.toggle,
              {
                backgroundColor: draft.is_active ? theme.primary : theme.surfaceSunken,
                borderColor: draft.is_active ? theme.primary : theme.borderStrong,
              },
            ]}
          >
            <View
              style={[
                styles.knob,
                {
                  backgroundColor: draft.is_active ? theme.onPrimary : theme.textMuted,
                  alignSelf: draft.is_active ? 'flex-end' : 'flex-start',
                },
              ]}
            />
          </View>
        </Pressable>

        {error ? (
          <Text variant="small" style={{ color: semantic.danger }}>
            {error}
          </Text>
        ) : null}

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button
            label="Cancel"
            variant="secondary"
            onPress={onCancel}
            style={{ flex: 1 }}
          />
          <Button
            label="Save"
            onPress={onSave}
            loading={saving}
            disabled={!draft.name.trim()}
            style={{ flex: 1 }}
          />
        </View>
      </View>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.xs + 2 }}>
      <Text variant="small" tone="muted">
        {label}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: spacing.base, gap: spacing.md, paddingBottom: spacing['4xl'] * 2 },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', gap: spacing.md, padding: spacing.base },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tag: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  actions: { gap: spacing.base, alignItems: 'center', paddingTop: 2 },
  input: {
    height: 46,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
  },
  multiline: { height: 70, paddingTop: spacing.md, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 1,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  dayChip: {
    width: 44,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggle: {
    width: 46,
    height: 27,
    borderRadius: radius.pill,
    borderWidth: 1,
    padding: 2,
    justifyContent: 'center',
  },
  knob: { width: 21, height: 21, borderRadius: radius.pill },
});
