import { useMutation } from '@tanstack/react-query';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { voiceInput } from '../api/befit';
import { radius, semantic, spacing, useTheme } from '../theme';
import { Icon } from './Icon';
import { Text } from './Text';

type RecorderProps = {
  onTranscript: (text: string) => void;
  onError: (message: string | null) => void;
};

/** Below this, it's a mis-tap rather than speech. */
const MIN_MS = 700;
/** Sarvam's limit is generous, but a runaway recording helps nobody. */
const MAX_MS = 55_000;

/**
 * Press-and-hold voice capture, transcribed by Sarvam on the server.
 *
 * This replaces leaning on the Android keyboard's dictation button. That was
 * free and kept audio on the phone, but its generic language model mangles
 * Indian food names — "idli sambar" came back as things that were never said,
 * and a wrong transcript becomes a wrong log two steps later. Sarvam is built
 * for Indian and code-mixed speech, which is what actually gets spoken here.
 */
export function Recorder({ onTranscript, onError }: RecorderProps) {
  const theme = useTheme();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);

  const [permission, setPermission] = useState<boolean | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number | null>(null);
  const pulse = useSharedValue(0);

  useEffect(() => {
    (async () => {
      const granted = await AudioModule.requestRecordingPermissionsAsync();
      setPermission(granted.granted);
      if (granted.granted) {
        // Without this, Android records at a level so low that Sarvam returns
        // an empty transcript.
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      }
    })().catch(() => setPermission(false));
  }, []);

  const recording = state.isRecording;

  useEffect(() => {
    if (!recording) {
      setElapsed(0);
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
    const timer = setInterval(() => {
      const started = startedAt.current;
      if (!started) return;
      const ms = Date.now() - started;
      setElapsed(ms);
      if (ms >= MAX_MS) stop();
    }, 100);
    return () => clearInterval(timer);
  }, [recording]);

  const transcribe = useMutation({
    mutationFn: (uri: string) => voiceInput.transcribe(uri),
    onSuccess: (result) => {
      if (result.transcript?.trim()) {
        onTranscript(result.transcript.trim());
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } else {
        onError("I couldn't make that out. Try again somewhere quieter.");
      }
    },
    onError: (error) => onError((error as Error).message),
  });

  async function start() {
    if (permission === false) {
      onError('Microphone access is off. Enable it in Settings to log by voice.');
      return;
    }
    onError(null);
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
      startedAt.current = Date.now();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } catch {
      onError("Couldn't start recording.");
    }
  }

  async function stop() {
    const started = startedAt.current;
    startedAt.current = null;
    try {
      await recorder.stop();
    } catch {
      onError("Couldn't finish the recording.");
      return;
    }

    const held = started ? Date.now() - started : 0;
    if (held < MIN_MS) {
      onError('Hold the button while you speak.');
      return;
    }
    const uri = recorder.uri;
    if (!uri) {
      onError('Nothing was recorded.');
      return;
    }
    transcribe.mutate(uri);
  }

  const ring = useAnimatedStyle(() => ({
    opacity: 0.18 + pulse.value * 0.22,
    transform: [{ scale: 1 + pulse.value * 0.22 }],
  }));

  const busy = transcribe.isPending;
  const seconds = Math.floor(elapsed / 1000);

  return (
    <View style={styles.wrapper}>
      <View style={styles.buttonArea}>
        {recording ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.ring, ring, { backgroundColor: semantic.danger }]}
          />
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Hold to record what you ate"
          disabled={busy || permission === false}
          onPressIn={start}
          onPressOut={stop}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: recording ? semantic.danger : theme.primary,
              opacity: busy || permission === false ? 0.5 : pressed ? 0.9 : 1,
            },
          ]}
        >
          <Icon name="mic" size={30} color={theme.onPrimary} strokeWidth={2} />
        </Pressable>
      </View>

      <Text variant="smallMedium" center tone={recording ? 'default' : 'secondary'}>
        {busy
          ? 'Transcribing…'
          : recording
            ? `Listening · ${seconds}s`
            : permission === false
              ? 'Microphone access needed'
              : 'Hold to speak'}
      </Text>

      {!recording && !busy && permission !== false ? (
        <Text variant="small" tone="muted" center style={{ fontSize: 11.5 }}>
          Transcribed by Sarvam, which handles Indian food names and Tamil or Hindi
          mixed in. Audio is discarded after transcription.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.base },
  buttonArea: { alignItems: 'center', justifyContent: 'center', height: 92, width: 92 },
  ring: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: radius.pill,
  },
  button: {
    width: 76,
    height: 76,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
