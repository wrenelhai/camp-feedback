export interface Question {
  id: string;
  order: number;
  promptText: string;
  promptAudioKey?: string;
  sensitive?: boolean;
  type?: 'question' | 'info'; // 'question' is default; 'info' shows text only with no recording
}

export interface SessionCustomText {
  orgName?: string;
  pageTitle?: string;
  introBody?: string;
  privacyNotice?: string;
  completionMessage?: string;
  closingTagline?: string;
}

export interface Session {
  id: string;
  name: string;
  questions: Question[];
  customText?: SessionCustomText | null;
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

export interface SynthesisTheme {
  name: string;
  description: string;
  estimatedCount: number;
  quotes: string[];
}

export interface QuestionSynthesisData {
  themes: SynthesisTheme[];
  outliers: string[];
  distressFlags: Array<{ quote: string; concern: string }>;
}

export interface CrossQuestionSynthesisData {
  connections: Array<{ title: string; description: string }>;
  keyTakeaways: string[];
}

export interface SynthesisRecord {
  id: string;
  sessionId: string;
  questionId: string | null;
  type: 'per_question' | 'cross_question';
  generatedAt: string;
  themes: QuestionSynthesisData | CrossQuestionSynthesisData;
  promptVersion: string;
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
  partnerName?: string;   // set in partner mode
  solo: boolean;
  currentQuestionIndex: number;
  currentSpeaker: 'A' | 'B'; // partner mode: B answers first per question, then A
  completedQuestionIds: string[];
}
