import { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import AudioPlayer from '../../components/AudioPlayer';
import type { Recording, Session, Respondent } from '../../types';

interface InterviewView {
  key: string;
  respondentId: string;
  name: string;
  speaker: 'A' | 'B';
  solo: boolean;
  createdAt: string;
  status: string;
  recordings: Recording[];
}

export default function AdminResponses() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<Session | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showRaw, setShowRaw] = useState<Record<string, boolean>>({});
  const [flagging, setFlagging] = useState<string | null>(null);
  const [showAudio, setShowAudio] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!id) return;
    Promise.all([api.getSessionDetail(id), api.getResponses(id)])
      .then(([s, recs]) => {
        setSession(s);
        setRecordings(recs);
      })
      .catch((err) => {
        if (err instanceof Error && err.message === 'Unauthorized') {
          navigate('/admin/login', { replace: true });
        } else {
          setError('Could not load responses');
        }
      })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const interviews = useMemo<InterviewView[]>(() => {
    const groups = new Map<string, { respondent: Respondent; recordings: Recording[] }>();
    for (const rec of recordings) {
      const r = rec.respondent!;
      if (!groups.has(r.id)) groups.set(r.id, { respondent: r, recordings: [] });
      groups.get(r.id)!.recordings.push(rec);
    }

    const result: InterviewView[] = [];
    for (const [, { respondent, recordings: recs }] of groups) {
      if (respondent.solo) {
        result.push({
          key: `${respondent.id}-A`,
          respondentId: respondent.id,
          name: respondent.camperAName ?? 'Anonymous',
          speaker: 'A',
          solo: true,
          createdAt: respondent.createdAt,
          status: respondent.status,
          recordings: recs.filter((r) => r.speakerRole === 'A'),
        });
      } else {
        result.push({
          key: `${respondent.id}-A`,
          respondentId: respondent.id,
          name: respondent.camperAName ?? 'Camper A',
          speaker: 'A',
          solo: false,
          createdAt: respondent.createdAt,
          status: respondent.status,
          recordings: recs.filter((r) => r.speakerRole === 'A'),
        });
        result.push({
          key: `${respondent.id}-B`,
          respondentId: respondent.id,
          name: respondent.camperBName ?? 'Camper B',
          speaker: 'B',
          solo: false,
          createdAt: respondent.createdAt,
          status: respondent.status,
          recordings: recs.filter((r) => r.speakerRole === 'B'),
        });
      }
    }

    result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return result;
  }, [recordings]);

  async function handleFlag(recording: Recording) {
    setFlagging(recording.id);
    try {
      const updated = await api.flagRecording(recording.id, !recording.flagged, 'manual-review-required');
      setRecordings((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch {
      // ignore
    } finally {
      setFlagging(null);
    }
  }

  function formatDuration(sec: number | null): string {
    if (!sec) return '—';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  const questionMap = session
    ? Object.fromEntries(session.questions.map((q, i) => [q.id, { text: q.promptText, index: i }]))
    : {};

  const sortedQuestions = session
    ? session.questions.filter((q) => q.type !== 'info')
    : [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <Link to={`/admin/sessions/${id}`} className="text-brand-600 hover:text-brand-800 text-sm font-medium">
          ← {session?.name ?? 'Session'}
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-lg font-bold text-gray-900">Transcripts</h1>
        <span className="ml-auto text-sm text-gray-500">
          {interviews.length} interview{interviews.length !== 1 ? 's' : ''}
        </span>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-3">
        {interviews.length === 0 && (
          <div className="card text-center py-10 text-gray-400">
            <p>No interviews yet.</p>
          </div>
        )}

        {interviews.map((interview) => {
          const expanded = expandedKey === interview.key;
          const recCount = interview.recordings.length;
          const transcribedCount = interview.recordings.filter(
            (r) => r.transcript || r.transcriptRedacted,
          ).length;
          const hasFlagged = interview.recordings.some((r) => r.flagged);

          return (
            <div
              key={interview.key}
              className={`card flex flex-col gap-0 overflow-hidden transition-all ${
                hasFlagged ? 'border-amber-300' : ''
              }`}
            >
              {/* Row */}
              <button
                onClick={() => setExpandedKey(expanded ? null : interview.key)}
                className="flex items-center gap-3 text-left w-full p-0 min-h-0 rounded-none
                           bg-transparent hover:bg-gray-50 -mx-5 px-5 -mt-5 pt-5 pb-4"
                aria-expanded={expanded}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-semibold text-gray-900">{interview.name}</span>
                    {!interview.solo && (
                      <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                        pair interview
                      </span>
                    )}
                    {hasFlagged && (
                      <span className="text-xs bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded">
                        flagged
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 flex gap-3 flex-wrap">
                    <span>{formatDate(interview.createdAt)}</span>
                    <span>{recCount} recording{recCount !== 1 ? 's' : ''}</span>
                    {transcribedCount > 0 && (
                      <span className="text-green-600">
                        {transcribedCount}/{recCount} transcribed
                      </span>
                    )}
                    <span
                      className={`px-1.5 py-0.5 rounded-full ${
                        interview.status === 'completed' ? 'bg-green-100 text-green-700'
                        : interview.status === 'in_progress' ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {interview.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
                <ChevronIcon className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              </button>

              {/* Expanded transcript view */}
              {expanded && (
                <div className="border-t border-gray-100 pt-4 flex flex-col gap-5">
                  {sortedQuestions.length === 0 && (
                    <p className="text-sm text-gray-400">No questions found.</p>
                  )}

                  {sortedQuestions.map((q, qi) => {
                    const rec = interview.recordings.find((r) => r.questionId === q.id);
                    const isShowingRaw = showRaw[rec?.id ?? ''];
                    const isAudioOpen = showAudio[rec?.id ?? ''];

                    return (
                      <div key={q.id} className="flex flex-col gap-1.5">
                        {/* Question label */}
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-semibold text-brand-600 uppercase tracking-wider flex-shrink-0">
                            Q{qi + 1}
                          </span>
                          <p className="text-sm font-medium text-gray-700">{q.promptText}</p>
                        </div>

                        {!rec ? (
                          <p className="text-sm text-gray-400 italic pl-8">Skipped</p>
                        ) : (
                          <div className="pl-8 flex flex-col gap-2">
                            {/* Transcript */}
                            {rec.transcript || rec.transcriptRedacted ? (
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs text-gray-400">
                                    Transcript {isShowingRaw ? '(original)' : '(redacted)'}
                                    {' · '}{formatDuration(rec.durationSec)}
                                  </span>
                                  <div className="flex items-center gap-3">
                                    {rec.transcript && rec.transcriptRedacted && (
                                      <button
                                        onClick={() =>
                                          setShowRaw((prev) => ({ ...prev, [rec.id]: !isShowingRaw }))
                                        }
                                        className="text-xs text-brand-600 hover:underline"
                                      >
                                        {isShowingRaw ? 'Show redacted' : 'Show original'}
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleFlag(rec)}
                                      disabled={flagging === rec.id}
                                      className={`text-xs px-2 py-0.5 rounded font-medium transition-colors ${
                                        rec.flagged
                                          ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                                          : 'text-gray-400 hover:text-amber-700'
                                      } disabled:opacity-50`}
                                    >
                                      {flagging === rec.id ? '…' : rec.flagged ? 'Flagged ✕' : 'Flag'}
                                    </button>
                                  </div>
                                </div>
                                <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">
                                  {isShowingRaw
                                    ? rec.transcript
                                    : (rec.transcriptRedacted ?? rec.transcript)}
                                </p>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between">
                                <p className="text-sm text-gray-400 italic">
                                  {rec.audioKey ? 'Pending transcription' : 'No audio recorded'}
                                  {rec.durationSec ? ` · ${formatDuration(rec.durationSec)}` : ''}
                                </p>
                                {rec.flagged && (
                                  <button
                                    onClick={() => handleFlag(rec)}
                                    disabled={flagging === rec.id}
                                    className="text-xs px-2 py-0.5 rounded font-medium bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-50"
                                  >
                                    {flagging === rec.id ? '…' : 'Flagged ✕'}
                                  </button>
                                )}
                              </div>
                            )}

                            {/* Audio (collapsed by default) */}
                            {rec.audioKey && (
                              <div>
                                <button
                                  onClick={() =>
                                    setShowAudio((prev) => ({ ...prev, [rec.id]: !isAudioOpen }))
                                  }
                                  className="text-xs text-gray-400 hover:text-gray-600"
                                >
                                  {isAudioOpen ? 'Hide audio ▲' : 'Play audio ▶'}
                                </button>
                                {isAudioOpen && (
                                  <div className="mt-2">
                                    <AudioPlayer recordingId={rec.id} />
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
