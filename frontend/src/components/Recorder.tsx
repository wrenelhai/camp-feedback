import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { saveRecording, markRecordingDone, markRecordingFailed } from '../lib/idb';
import type { PendingRecording } from '../types';

const MAX_DURATION_SEC = 180; // 3 minutes

type RecorderState =
  | 'idle'
  | 'requesting-permission'
  | 'permission-denied'
  | 'recording'
  | 'playback'
  | 'uploading'
  | 'done'
  | 'error';

interface Props {
  respondentId: string;
  sessionId: string;
  questionId: string;
  speakerRole?: 'A' | 'B';
  isFollowup?: boolean;
  solo?: boolean;
  onConfirmed: () => void;
}

export default function Recorder({
  respondentId,
  sessionId,
  questionId,
  speakerRole = 'A',
  isFollowup = false,
  solo = true,
  onConfirmed,
}: Props) {
  const [recState, setRecState] = useState<RecorderState>('idle');
  const [elapsed, setElapsed] = useState(0); // seconds elapsed while recording
  const [errorMsg, setErrorMsg] = useState('');
  const [pendingCount, setPendingCount] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const playbackUrlRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const localIdRef = useRef<string>(`rec-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTimer();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (playbackUrlRef.current) {
        URL.revokeObjectURL(playbackUrlRef.current);
      }
    };
  }, []);

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function formatTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  const startRecording = async () => {
    setRecState('requesting-permission');
    setErrorMsg('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
          channelCount: 1,
        },
      });
      streamRef.current = stream;

      // Pick the best supported MIME type
      const mimeType =
        ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
          .find((t) => MediaRecorder.isTypeSupported(t)) ?? '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        blobRef.current = blob;
        if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current);
        playbackUrlRef.current = URL.createObjectURL(blob);
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setRecState('playback');
      };

      recorder.start(250); // collect chunks every 250ms
      setElapsed(0);
      setRecState('recording');

      timerRef.current = setInterval(() => {
        setElapsed((prev) => {
          const next = prev + 1;
          if (next >= MAX_DURATION_SEC) {
            stopRecording();
          }
          return next;
        });
      }, 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Permission') || msg.includes('NotAllowed') || msg.includes('denied')) {
        setRecState('permission-denied');
      } else {
        setErrorMsg('Could not access microphone. Please check your device settings.');
        setRecState('error');
      }
    }
  };

  const stopRecording = useCallback(() => {
    stopTimer();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const confirmRecording = async () => {
    const blob = blobRef.current;
    if (!blob) return;

    const durationSec = elapsed;
    const localId = localIdRef.current;

    // 1. Write to IndexedDB immediately (zero data loss guarantee)
    const pending: PendingRecording = {
      localId,
      sessionId,
      respondentId,
      questionId,
      speakerRole,
      isFollowup,
      solo,
      blob,
      durationSec,
      createdAt: Date.now(),
      uploadStatus: 'pending',
    };
    await saveRecording(pending);

    // 2. Attempt upload
    setRecState('uploading');
    setPendingCount(1);

    try {
      await api.uploadRecording({
        respondentId,
        questionId,
        speakerRole,
        isFollowup,
        solo,
        durationSec,
        blob,
      });
      await markRecordingDone(localId, 'uploaded');
      setPendingCount(0);
      setRecState('done');
      onConfirmed();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      await markRecordingFailed(localId, msg);
      // Still let the user continue — recording is safe in IndexedDB
      setPendingCount(1);
      setRecState('done');
      onConfirmed();
    }
  };

  const reRecord = () => {
    blobRef.current = null;
    if (playbackUrlRef.current) {
      URL.revokeObjectURL(playbackUrlRef.current);
      playbackUrlRef.current = null;
    }
    // generate a new localId for the fresh attempt
    localIdRef.current = `rec-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setElapsed(0);
    setErrorMsg('');
    setRecState('idle');
  };

  const remaining = MAX_DURATION_SEC - elapsed;
  const pct = (elapsed / MAX_DURATION_SEC) * 100;

  return (
    <div className="flex flex-col items-center gap-5">
      {/* Pending upload indicator */}
      {pendingCount > 0 && recState !== 'uploading' && (
        <p className="text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-1.5">
          {pendingCount} recording{pendingCount > 1 ? 's' : ''} waiting to upload
        </p>
      )}

      {/* ── IDLE ── */}
      {recState === 'idle' && (
        <button
          onClick={startRecording}
          className="w-28 h-28 rounded-full bg-red-500 hover:bg-red-600 active:bg-red-700
                     flex items-center justify-center shadow-lg transition-colors"
          aria-label="Start recording"
        >
          <MicIcon className="w-12 h-12 text-white" />
        </button>
      )}

      {/* ── REQUESTING PERMISSION ── */}
      {recState === 'requesting-permission' && (
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-28 h-28 rounded-full bg-gray-100 flex items-center justify-center animate-pulse">
            <MicIcon className="w-12 h-12 text-gray-400" />
          </div>
          <p className="text-gray-600 text-sm">Requesting microphone access…</p>
          <p className="text-xs text-gray-400 max-w-xs">
            We need microphone access to record your answer. Recordings are only used for camp feedback.
          </p>
        </div>
      )}

      {/* ── PERMISSION DENIED ── */}
      {recState === 'permission-denied' && (
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-28 h-28 rounded-full bg-red-50 flex items-center justify-center">
            <MicOffIcon className="w-12 h-12 text-red-400" />
          </div>
          <p className="font-medium text-red-700">Microphone access was denied</p>
          <p className="text-sm text-gray-600 max-w-xs">
            To record your answer, allow microphone access in your browser settings, then reload the page.
          </p>
        </div>
      )}

      {/* ── RECORDING ── */}
      {recState === 'recording' && (
        <div className="flex flex-col items-center gap-4 w-full">
          {/* Animated recording button */}
          <button
            onClick={stopRecording}
            className="w-28 h-28 rounded-full bg-red-500 hover:bg-red-600 active:bg-red-700
                       flex items-center justify-center shadow-lg transition-colors relative"
            aria-label="Stop recording"
          >
            <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-40" />
            <StopIcon className="w-12 h-12 text-white relative z-10" />
          </button>

          {/* Timer */}
          <div className="text-center">
            <p className="text-2xl font-mono font-bold text-gray-800">{formatTime(elapsed)}</p>
            <p className="text-sm text-gray-500">{formatTime(remaining)} remaining</p>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-red-500 h-2 rounded-full transition-all duration-1000"
              style={{ width: `${pct}%` }}
            />
          </div>

          <p className="text-sm text-gray-500 font-medium animate-pulse">Recording…</p>
        </div>
      )}

      {/* ── PLAYBACK ── */}
      {recState === 'playback' && playbackUrlRef.current && (
        <div className="flex flex-col gap-4 w-full">
          <p className="text-sm font-medium text-gray-700 text-center">
            Recorded: {formatTime(elapsed)}
          </p>
          <audio
            src={playbackUrlRef.current}
            controls
            className="w-full rounded-lg"
            aria-label="Playback your recording"
          />
          <button onClick={confirmRecording} className="btn-primary">
            Confirm answer
          </button>
          <button onClick={reRecord} className="btn-secondary">
            Re-record
          </button>
        </div>
      )}

      {/* ── UPLOADING ── */}
      {recState === 'uploading' && (
        <div className="flex flex-col items-center gap-3">
          <div className="w-20 h-20 rounded-full bg-brand-50 flex items-center justify-center animate-spin">
            <UploadIcon className="w-8 h-8 text-brand-600" />
          </div>
          <p className="text-gray-600 text-sm">Saving your answer…</p>
        </div>
      )}

      {/* ── ERROR ── */}
      {recState === 'error' && (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-red-600 font-medium">{errorMsg || 'Something went wrong'}</p>
          <button onClick={reRecord} className="btn-secondary">
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

// ── Inline SVG icons ──────────────────────────────────────────────────────────

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z" />
      <path d="M19 11a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.93V20H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.07A7 7 0 0 0 19 11z" />
    </svg>
  );
}

function MicOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function StopIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  );
}
