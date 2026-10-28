import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { RECORDING_LIMITS } from '../../app/config';
import { newDocId } from '../../lib/id';
import { saveDraft, type StopReason } from '../../storage/drafts';
import { classifyMicError, levelFromSamples, pickMimeType } from './recordingUtils';

export type RecorderState =
  | { status: 'idle' }
  /** getUserMedia の応答待ち。needsPermission は許可ダイアログが出ている可能性 */
  | { status: 'preparing'; needsPermission: boolean }
  | { status: 'recording' | 'paused'; elapsedMs: number; levels: number[] }
  | { status: 'saving' }
  | { status: 'saved'; draftId: string; stopReason: StopReason }
  | { status: 'denied' | 'noDevice' | 'unsupported' }
  /** detail は原因の切り分け用（例外の名前。例: QuotaExceededError） */
  | { status: 'error'; reason: 'failed' | 'tooShort' | 'saveFailed'; detail?: string };

type Session = {
  stream: MediaStream | null;
  recorder: MediaRecorder | null;
  audioCtx: AudioContext | null;
  analyser: AnalyserNode | null;
  chunks: Blob[];
  bytes: number;
  accumulatedMs: number;
  segmentStart: number;
  paused: boolean;
  timer: ReturnType<typeof setInterval> | null;
  levels: number[];
  discard: boolean;
  stopReason: StopReason;
  mimeType: string;
  cleanup: (() => void)[];
};

type RecorderController = {
  state: RecorderState;
  bookId: string | null;
  setBookId: (id: string | null) => void;
  /** ユーザー操作（タップ）の中で呼ぶ。iOS では AudioContext の開始にユーザー操作が必要 */
  start: (bookId?: string | null) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  /** 録音を破棄する（下書きを作らない） */
  cancel: () => void;
  reset: () => void;
};

const RecorderContext = createContext<RecorderController | null>(null);

const elapsed = (s: Session) => s.accumulatedMs + (s.paused ? 0 : performance.now() - s.segmentStart);
const LEVEL_BARS = 28;

/**
 * 1回の録音 = 1件の下書き（要件 SCR-04）。録音状態はアプリ全体で1つ。
 * 停止・キャンセル・中断・画面離脱時にはマイク（MediaStream のトラック）を必ず解放する。
 */
export function RecorderProvider({ uid, children }: { uid: string; children: ReactNode }) {
  const [state, setState] = useState<RecorderState>({ status: 'idle' });
  const [bookId, setBookIdState] = useState<string | null>(null);
  const bookIdRef = useRef<string | null>(null);
  const session = useRef<Session | null>(null);

  const setBookId = useCallback((id: string | null) => {
    bookIdRef.current = id;
    setBookIdState(id);
  }, []);

  const release = useCallback((s: Session) => {
    if (s.timer) clearInterval(s.timer);
    s.timer = null;
    s.stream?.getTracks().forEach((t) => t.stop());
    s.cleanup.forEach((fn) => fn());
    s.cleanup = [];
    void s.audioCtx?.close().catch(() => {});
    s.audioCtx = null;
  }, []);

  const stopWith = useCallback((reason: StopReason) => {
    const s = session.current;
    if (!s?.recorder || s.recorder.state === 'inactive') return;
    s.stopReason = reason;
    s.accumulatedMs = elapsed(s);
    s.paused = true;
    s.recorder.stop();
  }, []);

  const finalize = useCallback(
    async (s: Session) => {
      release(s);
      session.current = null;
      if (s.discard) {
        setState({ status: 'idle' });
        return;
      }
      const durationMs = Math.round(s.accumulatedMs);
      const audio = new Blob(s.chunks, { type: s.recorder?.mimeType || s.mimeType });
      if (durationMs < RECORDING_LIMITS.minDurationMs || audio.size === 0) {
        setState({ status: 'error', reason: 'tooShort' });
        return;
      }
      setState({ status: 'saving' });
      const now = Date.now();
      const id = newDocId();
      try {
        await saveDraft({
          id,
          uid,
          noteId: newDocId(),
          createdAt: now,
          updatedAt: now,
          audio,
          mimeType: audio.type || s.mimeType,
          durationMs,
          size: audio.size,
          bookId: bookIdRef.current,
          stopReason: s.stopReason,
        });
        setState({ status: 'saved', draftId: id, stopReason: s.stopReason });
      } catch (e) {
        setState({ status: 'error', reason: 'saveFailed', detail: e instanceof Error ? e.name : undefined });
      }
    },
    [release, uid],
  );

  const start = useCallback(
    (initialBookId?: string | null) => {
      if (session.current) return;
      if (initialBookId !== undefined) setBookId(initialBookId);
      if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setState({ status: 'unsupported' });
        return;
      }
      const mimeType = pickMimeType((t) => MediaRecorder.isTypeSupported(t));
      if (!mimeType) {
        setState({ status: 'unsupported' });
        return;
      }
      const s: Session = {
        stream: null,
        recorder: null,
        audioCtx: null,
        analyser: null,
        chunks: [],
        bytes: 0,
        accumulatedMs: 0,
        segmentStart: 0,
        paused: false,
        timer: null,
        levels: [],
        discard: false,
        stopReason: 'user',
        mimeType,
        cleanup: [],
      };
      session.current = s;
      // ユーザー操作の中で生成する（iOS Safari の制約）。波形表示にのみ使う
      try {
        s.audioCtx = new AudioContext();
      } catch {
        s.audioCtx = null;
      }
      setState({ status: 'preparing', needsPermission: false });

      void (async () => {
        try {
          const permission = await navigator.permissions?.query({ name: 'microphone' as PermissionName }).catch(() => null);
          if (permission?.state === 'denied') throw new DOMException('denied', 'NotAllowedError');
          if (permission?.state === 'prompt' && session.current === s) setState({ status: 'preparing', needsPermission: true });
          s.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        } catch (e) {
          release(s);
          session.current = null;
          const kind = classifyMicError(e);
          setState(kind === 'failed' ? { status: 'error', reason: 'failed' } : { status: kind });
          return;
        }
        // 準備中にキャンセルされた
        if (session.current !== s || s.discard) {
          release(s);
          return;
        }
        try {
          const recorder = new MediaRecorder(s.stream, { mimeType });
          s.recorder = recorder;
          recorder.ondataavailable = (ev) => {
            if (ev.data.size === 0) return;
            s.chunks.push(ev.data);
            s.bytes += ev.data.size;
            if (s.bytes >= RECORDING_LIMITS.maxBytes) stopWith('size');
          };
          recorder.onstop = () => void finalize(s);
          recorder.onerror = () => {
            s.discard = true;
            release(s);
            session.current = null;
            setState({ status: 'error', reason: 'failed' });
          };

          if (s.audioCtx) {
            const analyser = s.audioCtx.createAnalyser();
            analyser.fftSize = 512;
            s.audioCtx.createMediaStreamSource(s.stream).connect(analyser);
            s.analyser = analyser;
            void s.audioCtx.resume().catch(() => {});
          }

          // マイクが失われた・画面ロック等でバックグラウンドへ移った場合は、そこまでを下書きとして保存する
          const track = s.stream.getAudioTracks()[0];
          const onEnded = () => stopWith('interrupted');
          track?.addEventListener('ended', onEnded);
          const onVisibility = () => {
            if (document.visibilityState === 'hidden') stopWith('interrupted');
          };
          document.addEventListener('visibilitychange', onVisibility);
          s.cleanup.push(
            () => track?.removeEventListener('ended', onEnded),
            () => document.removeEventListener('visibilitychange', onVisibility),
          );

          recorder.start(1000);
          s.segmentStart = performance.now();
          const samples = new Uint8Array(256);
          s.timer = setInterval(() => {
            if (s.analyser && !s.paused) {
              s.analyser.getByteTimeDomainData(samples);
              s.levels = [...s.levels, levelFromSamples(samples)].slice(-LEVEL_BARS);
            }
            const ms = elapsed(s);
            if (ms >= RECORDING_LIMITS.maxDurationMs) {
              stopWith('duration');
              return;
            }
            setState({ status: s.paused ? 'paused' : 'recording', elapsedMs: ms, levels: s.levels });
          }, 150);
          setState({ status: 'recording', elapsedMs: 0, levels: [] });
        } catch {
          release(s);
          session.current = null;
          setState({ status: 'error', reason: 'failed' });
        }
      })();
    },
    [finalize, release, setBookId, stopWith],
  );

  const stop = useCallback(() => stopWith('user'), [stopWith]);

  const pause = useCallback(() => {
    const s = session.current;
    if (!s?.recorder || s.recorder.state !== 'recording') return;
    s.recorder.pause();
    s.accumulatedMs = elapsed(s);
    s.paused = true;
    setState({ status: 'paused', elapsedMs: s.accumulatedMs, levels: s.levels });
  }, []);

  const resume = useCallback(() => {
    const s = session.current;
    if (!s?.recorder || s.recorder.state !== 'paused') return;
    s.recorder.resume();
    s.segmentStart = performance.now();
    s.paused = false;
    setState({ status: 'recording', elapsedMs: s.accumulatedMs, levels: s.levels });
  }, []);

  const cancel = useCallback(() => {
    const s = session.current;
    if (!s) {
      setState({ status: 'idle' });
      return;
    }
    s.discard = true;
    if (s.recorder && s.recorder.state !== 'inactive') {
      s.recorder.stop();
    } else {
      release(s);
      session.current = null;
      setState({ status: 'idle' });
    }
  }, [release]);

  const reset = useCallback(() => {
    if (!session.current) setState({ status: 'idle' });
  }, []);

  // アプリ終了（Provider のアンマウント）時はマイクを解放する
  useEffect(
    () => () => {
      const s = session.current;
      if (s) {
        s.discard = true;
        if (s.recorder && s.recorder.state !== 'inactive') s.recorder.stop();
        release(s);
      }
    },
    [release],
  );

  const value = useMemo(
    () => ({ state, bookId, setBookId, start, stop, pause, resume, cancel, reset }),
    [state, bookId, setBookId, start, stop, pause, resume, cancel, reset],
  );
  return <RecorderContext.Provider value={value}>{children}</RecorderContext.Provider>;
}

export function useRecorder(): RecorderController {
  const ctx = useContext(RecorderContext);
  if (!ctx) throw new Error('useRecorder must be used within RecorderProvider');
  return ctx;
}
