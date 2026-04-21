import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import AudioPlayer from '../../components/AudioPlayer';
import type { Recording, Session } from '../../types';

export default function AdminResponses() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<Session | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showRaw, setShowRaw] = useState<Record<string, boolean>>({});
  const [flagging, setFlagging] = useState<string | null>(null);
  const [filterQuestion, setFilterQuestion] = useState<string>('');

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

  const filteredRecordings = filterQuestion
    ? recordings.filter((r) => r.questionId === filterQuestion)
    : recordings;

  const questionMap = session
    ? Object.fromEntries(session.questions.map((q) => [q.id, q.promptText]))
    : {};

  function formatDuration(sec: number | null): string {
    if (!sec) return '—';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading responses…</p>
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <Link to={`/admin/sessions/${id}`} className="text-brand-600 hover:text-brand-800 text-sm font-medium">
          ← {session?.name ?? 'Session'}
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-lg font-bold text-gray-900">Responses</h1>
        <span className="ml-auto text-sm text-gray-500">{recordings.length} recording{recordings.length !== 1 ? 's' : ''}</span>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 flex flex-col gap-4">
        {/* Filter */}
        {session && session.questions.length > 0 && (
          <div>
            <label htmlFor="filter-q" className="label">Filter by question</label>
            <select
              id="filter-q"
              className="input max-w-md"
              value={filterQuestion}
              onChange={(e) => setFilterQuestion(e.target.value)}
            >
              <option value="">All questions</option>
              {session.questions.map((q) => (
                <option key={q.id} value={q.id}>
                  Q{q.order + 1}: {q.promptText.slice(0, 60)}…
                </option>
              ))}
            </select>
          </div>
        )}

        {filteredRecordings.length === 0 && (
          <div className="card text-center py-10 text-gray-400">
            <p>No recordings yet.</p>
          </div>
        )}

        {filteredRecordings.map((rec) => {
          const expanded = expandedId === rec.id;
          const qText = questionMap[rec.questionId] ?? rec.questionId;
          const isShowingRaw = showRaw[rec.id];

          return (
            <div
              key={rec.id}
              className={`card flex flex-col gap-0 overflow-hidden transition-all ${
                rec.flagged ? 'border-amber-300 bg-amber-50' : ''
              }`}
            >
              {/* Row summary */}
              <button
                onClick={() => setExpandedId(expanded ? null : rec.id)}
                className="flex items-start gap-3 text-left w-full p-0 min-h-0 rounded-none
                           bg-transparent hover:bg-gray-50 -mx-5 px-5 -mt-5 pt-5 pb-4"
                aria-expanded={expanded}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-semibold text-brand-600 uppercase tracking-wider">
                      {rec.isFollowup ? 'Follow-up' : `Q${(session?.questions.findIndex(q => q.id === rec.questionId) ?? 0) + 1}`}
                    </span>
                    <span className="text-xs text-gray-400">
                      Speaker {rec.speakerRole}
                    </span>
                    {rec.flagged && (
                      <span className="text-xs bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded">
                        Flagged
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 truncate">{qText}</p>
                  <div className="text-xs text-gray-400 mt-1 flex gap-3">
                    <span>{rec.respondent?.camperAName ?? 'Unknown'}</span>
                    <span>{formatDuration(rec.durationSec)}</span>
                    <span>{rec.uploadedAt ? 'Uploaded' : 'Pending upload'}</span>
                    {rec.transcriptRedacted || rec.transcript
                      ? <span className="text-green-600">Transcribed</span>
                      : <span>Not transcribed</span>
                    }
                  </div>
                </div>
                <ChevronIcon className={`w-5 h-5 text-gray-400 flex-shrink-0 mt-1 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              </button>

              {/* Expanded content */}
              {expanded && (
                <div className="border-t border-gray-100 pt-4 flex flex-col gap-4">
                  {/* Audio */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Audio</p>
                    {rec.audioKey ? (
                      <AudioPlayer recordingId={rec.id} />
                    ) : (
                      <p className="text-sm text-gray-400">No audio file available</p>
                    )}
                  </div>

                  {/* Transcript */}
                  {(rec.transcript || rec.transcriptRedacted) && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Transcript {isShowingRaw ? '(original)' : '(redacted)'}
                        </p>
                        {rec.transcript && rec.transcriptRedacted && (
                          <button
                            onClick={() => setShowRaw((prev) => ({ ...prev, [rec.id]: !isShowingRaw }))}
                            className="text-xs text-brand-600 hover:underline"
                          >
                            {isShowingRaw ? 'Show redacted' : 'Show original'}
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">
                        {isShowingRaw ? rec.transcript : (rec.transcriptRedacted ?? rec.transcript)}
                      </p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-3 pb-1">
                    <button
                      onClick={() => handleFlag(rec)}
                      disabled={flagging === rec.id}
                      className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                        rec.flagged
                          ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      } disabled:opacity-50`}
                    >
                      {flagging === rec.id ? '…' : rec.flagged ? 'Unflag' : 'Flag for review'}
                    </button>
                  </div>
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
