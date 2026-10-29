import { useMutation } from '@tanstack/react-query';
import {
  AudioQuality,
  getRecordingPermissionsAsync,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
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
 * Speech, not music. Speech recognisers work at 16 kHz mono anyway, so the
 * HIGH_QUALITY preset (44.1 kHz stereo, 128 kbps) was uploading ~8× the bytes
 * for no gain in accuracy — on mobile data, that's the difference between a
 * snappy transcript and a spinner.
 */
const SPEECH_PRESET: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 16_000,
  numberOfChannels: 1,
  bitRate: 32_000,
  android: {
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
  },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.MEDIUM,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 32_000,
  },
};

/**
 * Where the press is. A ref, not state: press-in and press-out can both fire
 * before `prepareToRecordAsync` resolves, and the async start has to see the
 * release that happened while it was waiting.
 */
type Phase = 'idle' | 'starting' | 'recording';

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
  const recorder = useAudioRecorder(SPEECH_PRESET);
  // The recorder's own clock drives the counter; no setState interval of ours.
  const state = useAudioRecorderState(recorder, 250);

  /** null = not asked yet. Asked on first press, not on mount. */
  const [permission, setPermission] = useState<boolean | null>(null);
  const audioModeSet = useRef(false);
  const phase = useRef<Phase>('idle');
  const pressed = useRef(false);
  const startedAt = useRef<number | null>(null);
  const pulse = useSharedValue(0);

  const recording = state.isRecording;

  useEffect(() => {
    if (!recording) {
      cancelAnimation(pulse);
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
  }, [recording, pulse]);

  useEffect(() => {
    if (recording && state.durationMillis >= MAX_MS) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, state.durationMillis]);

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

  /** Resolves true once the mic is usable. Prompts only the first time. */
  async function ensurePermission(): Promise<boolean> {
    if (permission === true && audioModeSet.current) return true;
    let response = await getRecordingPermissionsAsync();
    if (!response.granted && response.canAskAgain) {
      response = await requestRecordingPermissionsAsync();
    }
    if (!response.granted) {
      // Only lock the button when the OS won't show the prompt again.
      if (!response.canAskAgain) setPermission(false);
      onError('Microphone access is off. Enable it in Settings to log by voice.');
      return false;
    }
    setPermission(true);
    if (!audioModeSet.current) {
      // Without this, Android records at a level so low that Sarvam returns
      // an empty transcript.
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      audioModeSet.current = true;
    }
    return true;
  }

  async function start() {
    pressed.current = true;
    if (phase.current !== 'idle') return;
    if (permission === false) {
      onError('Microphone access is off. Enable it in Settings to log by voice.');
      return;
    }
    onError(null);
    phase.current = 'starting';
    try {
      const firstAsk = permission === null;
      if (!(await ensurePermission())) {
        phase.current = 'idle';
        return;
      }
      await recorder.prepareToRecordAsync();
      // Released while we were preparing (or answering the permission
      // prompt): a quick tap, not a recording. Don't start one nobody will stop.
      if (!pressed.current) {
        phase.current = 'idle';
        onError(
          firstAsk
            ? 'Microphone ready. Hold the button while you speak.'
            : 'Hold the button while you speak.',
        );
        return;
      }
      recorder.record();
      startedAt.current = Date.now();
      phase.current = 'recording';
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } catch {
      phase.current = 'idle';
      onError("Couldn't start recording.");
    }
  }

  async function stop() {
    pressed.current = false;
    // Still starting: `start` sees the release and cancels itself.
    if (phase.current !== 'recording') return;
    phase.current = 'idle';

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
  const seconds = recording ? Math.floor(state.durationMillis / 1000) : 0;

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
