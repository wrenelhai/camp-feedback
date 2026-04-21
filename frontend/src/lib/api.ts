import type { Session, Respondent, Recording, Question, SessionCustomText, SynthesisRecord } from '../types';

// In dev, Vite proxies /api → localhost:3001. In prod, set VITE_API_URL to the backend origin.
const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

function adminHeaders(): Record<string, string> {
  const token = localStorage.getItem('adminToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function json<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...adminHeaders(),
    ...(options.headers as Record<string, string> | undefined ?? {}),
  };

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  // ── Public (camper) ──────────────────────────────────────────────────────────

  getSession: (id: string) => json<Session>(`/sessions/${id}`),

  createRespondent: (data: { sessionId: string; camperAName: string; camperBName?: string; solo: boolean }) =>
    json<Respondent>('/respondents', { method: 'POST', body: JSON.stringify(data) }),

  updateRespondent: (id: string, data: Partial<Pick<Respondent, 'status' | 'completedAt'>>) =>
    json<Respondent>(`/respondents/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  /**
   * Upload a single audio recording.
   * Sends as multipart/form-data so the binary blob is transmitted efficiently.
   */
  uploadRecording: async (params: {
    respondentId: string;
    questionId: string;
    speakerRole: 'A' | 'B';
    isFollowup: boolean;
    solo: boolean;
    durationSec: number;
    blob: Blob;
  }): Promise<Recording> => {
    const form = new FormData();
    form.append('respondentId', params.respondentId);
    form.append('questionId', params.questionId);
    form.append('speakerRole', params.speakerRole);
    form.append('isFollowup', String(params.isFollowup));
    form.append('solo', String(params.solo));
    form.append('durationSec', String(params.durationSec));
    form.append('audio', params.blob, 'recording.webm');

    const res = await fetch(`${BASE}/recordings`, {
      method: 'POST',
      body: form,
      // No Content-Type header — browser sets it with the correct multipart boundary
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
      throw new Error(body.error ?? 'Upload failed');
    }

    return res.json() as Promise<Recording>;
  },

  // ── Admin ────────────────────────────────────────────────────────────────────

  checkSetupStatus: () => json<{ setupComplete: boolean }>('/admin/setup/status'),

  adminSetup: (email: string, password: string) =>
    json<{ id: string; email: string }>('/admin/setup', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  adminLogin: (email: string, password: string) =>
    json<{ token: string; email: string }>('/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  listSessions: () => json<(Session & { _count: { respondents: number }; interviewCount: number })[]>('/admin/sessions'),

  createSession: (data: { name: string; questions: Question[] }) =>
    json<Session>('/admin/sessions', { method: 'POST', body: JSON.stringify(data) }),

  patchSession: (id: string, data: { name?: string; status?: string; questions?: Question[]; customText?: SessionCustomText }) =>
    json<Session>(`/admin/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  getSessionDetail: (id: string) =>
    json<Session & { respondents: (Respondent & { _count: { recordings: number } })[] }>(
      `/admin/sessions/${id}`,
    ),

  getResponses: (sessionId: string) =>
    json<Recording[]>(`/admin/sessions/${sessionId}/responses`),

  /** Fetches audio with auth, returns an object URL safe to use in <audio src>. */
  fetchAudio: async (recordingId: string): Promise<string> => {
    const res = await fetch(`${BASE}/admin/recordings/${recordingId}/audio`, {
      headers: adminHeaders(),
    });
    if (!res.ok) throw new Error('Audio not found');
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },

  /** Fetches the QR code PNG with auth, returns an object URL safe to use in <img src>. */
  fetchQr: async (sessionId: string): Promise<string> => {
    const res = await fetch(`${BASE}/admin/sessions/${sessionId}/qr`, {
      headers: adminHeaders(),
    });
    if (!res.ok) throw new Error('QR generation failed');
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },

  getSynthesis: (sessionId: string) =>
    json<SynthesisRecord[]>(`/admin/sessions/${sessionId}/synthesis`),

  synthesize: (sessionId: string, force = false) =>
    json<SynthesisRecord[] | { confirmRequired: true; existingAt: string }>(
      `/admin/sessions/${sessionId}/synthesize?force=${force}`,
      { method: 'POST', body: '{}' },
    ),

  exportSession: async (sessionId: string): Promise<void> => {
    const res = await fetch(`${BASE}/admin/sessions/${sessionId}/export`, {
      headers: adminHeaders(),
    });
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const filename = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ?? 'export.zip';
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  deleteRespondent: (id: string) =>
    fetch(`${BASE}/admin/respondents/${id}`, {
      method: 'DELETE',
      headers: adminHeaders(),
    }).then((res) => {
      if (!res.ok && res.status !== 204) throw new Error('Delete failed');
    }),

  flagRecording: (id: string, flagged: boolean, flagReason?: string) =>
    json<Recording>(`/admin/recordings/${id}/flag`, {
      method: 'PATCH',
      body: JSON.stringify({ flagged, flagReason }),
    }),

  updateTranscript: (id: string, transcript: string) =>
    json<Recording>(`/admin/recordings/${id}/transcript`, {
      method: 'PATCH',
      body: JSON.stringify({ transcript }),
    }),

  /** Returns the raw QR download URL (for the anchor download link, which also uses fetch+blob). */
  qrDownloadUrl: (sessionId: string): string => `${BASE}/admin/sessions/${sessionId}/qr`,
};
