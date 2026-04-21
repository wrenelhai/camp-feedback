import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { saveSessionState, getSessionState, clearSessionState } from '../lib/idb';
import Recorder from '../components/Recorder';
import type { Session, Question } from '../types';

interface LocationState {
  sessionId: string;
  respondentId: string;
  solo: boolean;
  camperAName?: string;
  camperBName?: string;
}

export default function Interview() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | null;

  const [session, setSession] = useState<Session | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [currentSpeaker, setCurrentSpeaker] = useState<'A' | 'B'>('A');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const sessionId = state?.sessionId ?? '';
  const respondentId = state?.respondentId ?? '';
  const solo = state?.solo ?? true;
  const camperAName = state?.camperAName ?? 'You';
  const camperBName = state?.camperBName ?? 'Partner';

  useEffect(() => {
    if (!sessionId || !respondentId) {
      navigate('/join', { replace: true });
      return;
    }
    loadSession();
  }, [sessionId, respondentId]);

  async function loadSession() {
    try {
      const [s, idbState] = await Promise.all([
        api.getSession(sessionId),
        getSessionState(sessionId, respondentId),
      ]);
      setSession(s);

      if (idbState) {
        setCurrentIndex(idbState.currentQuestionIndex);
        setCompletedIds(idbState.completedQuestionIds);
        setCurrentSpeaker(idbState.currentSpeaker ?? (solo ? 'A' : 'B'));
      } else {
        setCurrentSpeaker(solo ? 'A' : 'B');
      }
    } catch {
      setError('Could not load interview questions. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  async function advance() {
    if (!session) return;

    const question = session.questions[currentIndex];
    const isInfo = question.type === 'info';

    // Partner mode, regular question, B just answered → switch to A (same question)
    if (!solo && !isInfo && currentSpeaker === 'B') {
      const newSpeaker: 'A' | 'B' = 'A';
      setCurrentSpeaker(newSpeaker);
      await saveSessionState({
        sessionId,
        respondentId,
        camperName: camperAName,
        partnerName: solo ? undefined : camperBName,
        solo,
        currentQuestionIndex: currentIndex,
        currentSpeaker: newSpeaker,
        completedQuestionIds: completedIds,
      });
      return;
    }

    // Advance to next question
    const newCompleted = [...completedIds, question.id];
    const newIndex = currentIndex + 1;
    const newSpeaker: 'A' | 'B' = solo ? 'A' : 'B';

    setCompletedIds(newCompleted);
    setCurrentIndex(newIndex);
    setCurrentSpeaker(newSpeaker);

    await saveSessionState({
      sessionId,
      respondentId,
      camperName: camperAName,
      partnerName: solo ? undefined : camperBName,
      solo,
      currentQuestionIndex: newIndex,
      currentSpeaker: newSpeaker,
      completedQuestionIds: newCompleted,
    });

    if (newIndex >= session.questions.length) {
      await finishInterview(newCompleted);
    }
  }

  async function finishInterview(finalCompleted: string[]) {
    if (!session) return;
    try {
      await api.updateRespondent(respondentId, {
        status: 'completed',
        completedAt: new Date().toISOString(),
      });
    } catch {
      // Non-fatal: recordings are already uploaded
    }
    await clearSessionState(sessionId, respondentId);
    localStorage.removeItem(`session-context-${sessionId}`);
    navigate('/done', { state: { sessionName: session.name, count: finalCompleted.length } });
  }

  if (loading) {
    return (
      <div className="page-container items-center justify-center">
        <p className="text-gray-500 animate-pulse">Loading questions…</p>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="page-container">
        <div className="page-content items-center justify-center text-center">
          <p className="text-red-600">{error || 'Session not found'}</p>
          <button onClick={() => navigate(-1)} className="btn-secondary mt-4 max-w-xs">
            Go back
          </button>
        </div>
      </div>
    );
  }

  if (currentIndex >= session.questions.length) {
    return (
      <div className="page-container items-center justify-center">
        <p className="text-gray-500">Finishing up…</p>
      </div>
    );
  }

  const question: Question = session.questions[currentIndex];
  const isInfo = question.type === 'info';
  const total = session.questions.length;
  const progress = (currentIndex / total) * 100;
  const stepLabel = isInfo ? 'Note' : 'Question';

  const speakerName = currentSpeaker === 'B' ? camperBName : camperAName;

  return (
    <div className="page-container">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <div className="flex-1">
          <div className="text-xs text-gray-500 mb-1 font-medium">
            {stepLabel} {currentIndex + 1} of {total}
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-brand-600 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      <div className="page-content">
        {isInfo ? (
          // ── Info / text-only step ──────────────────────────────────────────
          <>
            <div className="card">
              <p className="text-xs font-semibold text-brand-600 uppercase tracking-wider mb-2">
                Note
              </p>
              <p className="text-base text-gray-800 leading-relaxed whitespace-pre-wrap">
                {question.promptText}
              </p>
            </div>

            <button onClick={advance} className="btn-primary">
              Continue →
            </button>
          </>
        ) : (
          // ── Regular question with recorder ─────────────────────────────────
          <>
            {/* Speaker banner (partner mode only) */}
            {!solo && (
              <div className="rounded-xl bg-brand-50 border border-brand-100 px-4 py-3 text-center">
                <p className="text-sm font-semibold text-brand-700">
                  {speakerName}'s turn
                </p>
              </div>
            )}

            <div className="card">
              <p className="text-xs font-semibold text-brand-600 uppercase tracking-wider mb-2">
                Question {currentIndex + 1}
              </p>
              <p className="text-lg font-medium text-gray-900 leading-snug">
                {question.promptText}
              </p>
              {question.sensitive && (
                <p className="mt-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5">
                  This question covers sensitive topics. Your answer is confidential and will be
                  reviewed carefully before any synthesis.
                </p>
              )}
            </div>

            <div className="text-center text-sm text-gray-500">
              {solo
                ? 'Tap the microphone to start recording your answer.'
                : `${speakerName}, tap the microphone to record your answer.`}
              <br />
              You have up to 3 minutes.
            </div>

            <Recorder
              key={`${question.id}-${currentSpeaker}`}
              respondentId={respondentId}
              sessionId={sessionId}
              questionId={question.id}
              speakerRole={currentSpeaker}
              isFollowup={false}
              solo={solo}
              onConfirmed={advance}
            />

            <button
              onClick={advance}
              className="text-sm text-gray-400 hover:text-gray-600 underline underline-offset-2 text-center"
            >
              Skip this question
            </button>
          </>
        )}

        {/* Progress dots */}
        {total <= 15 && (
          <div className="flex justify-center gap-1.5 pt-2">
            {session.questions.map((q, i) => (
              <div
                key={q.id}
                className={`rounded-full ${q.type === 'info' ? 'w-1.5 h-1.5' : 'w-2 h-2'} ${
                  completedIds.includes(q.id)
                    ? 'bg-brand-600'
                    : i === currentIndex
                    ? 'bg-brand-300'
                    : 'bg-gray-200'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
