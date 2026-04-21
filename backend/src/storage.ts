/**
 * Storage abstraction — Supabase Storage in production, local disk in dev.
 * Set SUPABASE_URL + SUPABASE_SERVICE_KEY to activate Supabase Storage.
 */
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { config } from './config';

// Lazily initialise the Supabase client only when credentials are present.
function getSupabase() {
  if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_KEY) return null;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createClient } = require('@supabase/supabase-js');
  return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY);
}

const BUCKET = config.SUPABASE_BUCKET;

/**
 * Save an audio buffer.
 * Returns the audioKey stored in DB — a path relative to the storage root.
 */
export async function saveAudio(
  sessionId: string,
  respondentId: string,
  questionId: string,
  speakerRole: string,
  buffer: Buffer,
  ext = 'webm',
): Promise<string> {
  const audioKey = `${sessionId}/${respondentId}/${questionId}-${speakerRole}-${Date.now()}.${ext}`;
  const supabase = getSupabase();

  if (supabase) {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(audioKey, buffer, { contentType: `audio/${ext}`, upsert: false });
    if (error) throw new Error(`Supabase Storage upload failed: ${error.message}`);
  } else {
    const dir = path.join(config.UPLOAD_DIR, sessionId, respondentId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(config.UPLOAD_DIR, audioKey), buffer);
  }

  return audioKey;
}

/**
 * Returns a short-lived signed URL for the audio file, or null when using local disk.
 * The admin audio route should redirect to this URL when it is non-null.
 */
export async function getAudioSignedUrl(audioKey: string): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(audioKey, 3600); // 1-hour expiry
  if (error) throw new Error(`Signed URL generation failed: ${error.message}`);
  return data.signedUrl;
}

/** Resolve an audioKey to an absolute local filesystem path (local dev only). */
export function resolveAudioPath(audioKey: string): string {
  return path.join(config.UPLOAD_DIR, audioKey);
}

/** Check whether an audio file exists. */
export async function audioExists(audioKey: string): Promise<boolean> {
  const supabase = getSupabase();
  if (supabase) {
    const folder = audioKey.split('/').slice(0, -1).join('/');
    const filename = audioKey.split('/').pop()!;
    const { data, error } = await supabase.storage.from(BUCKET).list(folder);
    return !error && (data?.some((f: { name: string }) => f.name === filename) ?? false);
  }
  try {
    await fs.access(resolveAudioPath(audioKey));
    return true;
  } catch {
    return false;
  }
}

/** Delete an audio file. Used by the data-retention job (future milestone). */
export async function deleteAudio(audioKey: string): Promise<void> {
  const supabase = getSupabase();
  if (supabase) {
    await supabase.storage.from(BUCKET).remove([audioKey]);
  } else {
    await fs.unlink(resolveAudioPath(audioKey));
  }
}

/** Stream a local audio file into a Fastify reply (local dev only). */
export function createLocalAudioStream(audioKey: string) {
  return fsSync.createReadStream(resolveAudioPath(audioKey));
}
