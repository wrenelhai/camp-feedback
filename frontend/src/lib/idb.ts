import { openDB, type IDBPDatabase } from 'idb';
import type { PendingRecording, SessionState } from '../types';

const DB_NAME = 'camp-feedback';
const DB_VERSION = 1;

type CampDB = {
  recordings: {
    key: string;
    value: PendingRecording;
    indexes: { by_status: string; by_respondent: string };
  };
  'session-state': {
    key: string; // `${sessionId}-${respondentId}`
    value: SessionState;
  };
};

let _db: IDBPDatabase<CampDB> | null = null;

async function getDb(): Promise<IDBPDatabase<CampDB>> {
  if (_db) return _db;
  _db = await openDB<CampDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('recordings')) {
        const store = db.createObjectStore('recordings', { keyPath: 'localId' });
        store.createIndex('by_status', 'uploadStatus');
        store.createIndex('by_respondent', 'respondentId');
      }
      if (!db.objectStoreNames.contains('session-state')) {
        db.createObjectStore('session-state');
      }
    },
  });
  return _db;
}

// ── Recordings ────────────────────────────────────────────────────────────────

export async function saveRecording(recording: PendingRecording): Promise<void> {
  const db = await getDb();
  await db.put('recordings', recording);
}

export async function getRecording(localId: string): Promise<PendingRecording | undefined> {
  const db = await getDb();
  return db.get('recordings', localId);
}

export async function getPendingRecordings(): Promise<PendingRecording[]> {
  const db = await getDb();
  return db.getAllFromIndex('recordings', 'by_status', 'pending');
}

export async function markRecordingUploading(localId: string): Promise<void> {
  const db = await getDb();
  const rec = await db.get('recordings', localId);
  if (rec) await db.put('recordings', { ...rec, uploadStatus: 'uploading' });
}

export async function markRecordingDone(localId: string, serverId: string): Promise<void> {
  const db = await getDb();
  const rec = await db.get('recordings', localId);
  if (rec) await db.put('recordings', { ...rec, uploadStatus: 'done', serverId });
}

export async function markRecordingFailed(localId: string, errorMessage: string): Promise<void> {
  const db = await getDb();
  const rec = await db.get('recordings', localId);
  if (rec) await db.put('recordings', { ...rec, uploadStatus: 'failed', errorMessage });
}

// ── Session state ─────────────────────────────────────────────────────────────

function stateKey(sessionId: string, respondentId: string): string {
  return `${sessionId}-${respondentId}`;
}

export async function saveSessionState(state: SessionState): Promise<void> {
  const db = await getDb();
  await db.put('session-state', state, stateKey(state.sessionId, state.respondentId));
}

export async function getSessionState(
  sessionId: string,
  respondentId: string,
): Promise<SessionState | undefined> {
  const db = await getDb();
  return db.get('session-state', stateKey(sessionId, respondentId));
}

export async function clearSessionState(sessionId: string, respondentId: string): Promise<void> {
  const db = await getDb();
  await db.delete('session-state', stateKey(sessionId, respondentId));
}
