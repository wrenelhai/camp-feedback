/**
 * Background transcription worker — polls every 60 seconds for recordings
 * that have been uploaded but not yet transcribed, then processes them in
 * batches. Runs inside the same Render process; no Redis or separate service needed.
 */
import { db } from './db';
import { getAudioBuffer } from './storage';
import { getTranscriptionProvider, redactTranscript } from './transcription';
import { config } from './config';

const POLL_INTERVAL_MS = 60_000;
const BATCH_SIZE = 5; // process at most 5 recordings per tick

async function processPending(): Promise<void> {
  const pending = await db.recording.findMany({
    where: {
      uploadedAt: { not: null },
      transcribedAt: null,
      audioKey: { not: null },
    },
    take: BATCH_SIZE,
    orderBy: { uploadedAt: 'asc' },
  });

  if (pending.length === 0) return;

  console.log(`[worker] Processing ${pending.length} pending recording(s)…`);

  for (const recording of pending) {
    try {
      const audioBuffer = await getAudioBuffer(recording.audioKey!);
      const mimeType = mimeFromKey(recording.audioKey!);

      const provider = getTranscriptionProvider();
      const transcript = await provider.transcribe(audioBuffer, mimeType);

      let transcriptRedacted: string;
      if (config.ANTHROPIC_API_KEY) {
        transcriptRedacted = await redactTranscript(transcript);
      } else {
        transcriptRedacted = transcript; // skip redaction if no key configured
      }

      await db.recording.update({
        where: { id: recording.id },
        data: {
          transcript,
          transcriptRedacted,
          transcribedAt: new Date(),
        },
      });

      console.log(`[worker] Transcribed recording ${recording.id}`);
    } catch (err) {
      console.error(`[worker] Failed to transcribe recording ${recording.id}:`, err);
      // Leave transcribedAt null so it will be retried next tick.
      // Surface the error in the admin dashboard via a flag.
      await db.recording.update({
        where: { id: recording.id },
        data: {
          flagged: true,
          flagReason: `Transcription failed: ${(err as Error).message}`,
        },
      }).catch(() => { /* ignore secondary failure */ });
    }
  }
}

function mimeFromKey(audioKey: string): string {
  const ext = audioKey.split('.').pop() ?? 'webm';
  const map: Record<string, string> = {
    webm: 'audio/webm',
    ogg: 'audio/ogg',
    mp4: 'audio/mp4',
    m4a: 'audio/mp4',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
  };
  return map[ext] ?? 'audio/webm';
}

export function startWorker(): void {
  if (!config.OPENAI_API_KEY) {
    console.log('[worker] OPENAI_API_KEY not set — transcription worker disabled');
    return;
  }

  console.log('[worker] Transcription worker started (polling every 60s)');

  // Run once immediately on startup to catch anything that landed while the service was down
  processPending().catch((err) => console.error('[worker] Initial poll error:', err));

  setInterval(() => {
    processPending().catch((err) => console.error('[worker] Poll error:', err));
  }, POLL_INTERVAL_MS);
}
