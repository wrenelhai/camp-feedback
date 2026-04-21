export interface Question {
  id: string;
  order: number;
  promptText: string;
  promptAudioKey?: string;
  sensitive?: boolean;
}

export interface Session {
  id: string;
  name: string;
  questions: Question[];
  status: string;
  createdAt: string;
}

export interface Respondent {
  id: string;
  sessionId: string;
  camperAName: string | null;
  camperBName: string | null;
  solo: boolean;
  status: string;
  createdAt: string;
  completedAt: string | null;
}

export interface Recording {
  id: string;
  respondentId: string;
  questionId: string;
  speakerRole: 'A' | 'B';
  isFollowup: boolean;
  solo: boolean;
  audioKey: string | null;
  durationSec: number | null;
  uploadedAt: string | null;
  transcript: string | null;
  transcriptRedacted: string | null;
  flagged: boolean;
  flagReason: string | null;
  testimonialAttribution: string | null;
  respondent?: Respondent;
}

/** Stored in IndexedDB while awaiting upload */
export interface PendingRecording {
  localId: string;
  sessionId: string;
  respondentId: string;
  questionId: string;
  speakerRole: 'A' | 'B';
  isFollowup: boolean;
  solo: boolean;
  blob: Blob;
  durationSec: number;
  createdAt: number;
  uploadStatus: 'pending' | 'uploading' | 'done' | 'failed';
  serverId?: string;
  errorMessage?: string;
}

/** Session progress persisted in IndexedDB for resumption */
export interface SessionState {
  sessionId: string;
  respondentId: string;
  camperName: string;
  currentQuestionIndex: number;
  completedQuestionIds: string[];
}
