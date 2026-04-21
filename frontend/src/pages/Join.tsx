import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { saveSessionState, getSessionState } from '../lib/idb';
import type { Session } from '../types';

type Step = 'loading' | 'resume-prompt' | 'landing' | 'name' | 'mode' | 'partner-name' | 'creating' | 'error';

export default function Join() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = searchParams.get('session') ?? '';

  const [step, setStep] = useState<Step>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [name, setName] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [nameError, setNameError] = useState('');
  const [partnerNameError, setPartnerNameError] = useState('');
  const [error, setError] = useState('');

  const [savedState, setSavedState] = useState<{ respondentId: string; name: string; partnerName?: string; solo: boolean } | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setError('No session ID found. Please scan the QR code again.');
      setStep('error');
      return;
    }
    loadSession();
  }, [sessionId]);

  async function loadSession() {
    try {
      const s = await api.getSession(sessionId);
      setSession(s);

      const stored = localStorage.getItem(`session-context-${sessionId}`);
      if (stored) {
        const ctx = JSON.parse(stored) as { respondentId: string; name: string; partnerName?: string; solo: boolean };
        const idbState = await getSessionState(sessionId, ctx.respondentId);
        if (idbState) {
          setSavedState(ctx);
          setStep('resume-prompt');
          return;
        }
      }

      setStep('landing');
    } catch {
      setError('This session could not be found. Please scan the QR code again.');
      setStep('error');
    }
  }

  function handleResume() {
    if (!savedState) return;
    navigate('/interview', {
      state: {
        sessionId,
        respondentId: savedState.respondentId,
        solo: savedState.solo,
        camperAName: savedState.name,
        camperBName: savedState.partnerName,
      },
    });
  }

  function handleStartFresh() {
    setSavedState(null);
    setStep('landing');
  }

  function handleNameSubmit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('Please enter a name or nickname.');
      return;
    }
    setNameError('');
    setStep('mode');
  }

  function handlePartnerNameSubmit() {
    const trimmed = partnerName.trim();
    if (!trimmed) {
      setPartnerNameError('Please enter your partner\'s name.');
      return;
    }
    setPartnerNameError('');
    handlePartner();
  }

  async function handleSolo() {
    if (!session) return;
    setStep('creating');
    try {
      const respondent = await api.createRespondent({
        sessionId,
        camperAName: name.trim(),
        solo: true,
      });

      const ctx = { respondentId: respondent.id, name: name.trim(), solo: true };
      localStorage.setItem(`session-context-${sessionId}`, JSON.stringify(ctx));

      await saveSessionState({
        sessionId,
        respondentId: respondent.id,
        camperName: name.trim(),
        solo: true,
        currentQuestionIndex: 0,
        currentSpeaker: 'A',
        completedQuestionIds: [],
      });

      navigate('/interview', {
        state: { sessionId, respondentId: respondent.id, solo: true, camperAName: name.trim() },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start session. Please try again.');
      setStep('mode');
    }
  }

  async function handlePartner() {
    if (!session) return;
    setStep('creating');
    const aName = name.trim();
    const bName = partnerName.trim();
    try {
      const respondent = await api.createRespondent({
        sessionId,
        camperAName: aName,
        camperBName: bName,
        solo: false,
      });

      const ctx = { respondentId: respondent.id, name: aName, partnerName: bName, solo: false };
      localStorage.setItem(`session-context-${sessionId}`, JSON.stringify(ctx));

      await saveSessionState({
        sessionId,
        respondentId: respondent.id,
        camperName: aName,
        partnerName: bName,
        solo: false,
        currentQuestionIndex: 0,
        currentSpeaker: 'B',
        completedQuestionIds: [],
      });

      navigate('/interview', {
        state: { sessionId, respondentId: respondent.id, solo: false, camperAName: aName, camperBName: bName },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start session. Please try again.');
      setStep('partner-name');
    }
  }

  if (step === 'loading') {
    return (
      <div className="page-container items-center justify-center">
        <p className="text-gray-500">Loading…</p>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="page-container">
        <div className="page-content items-center justify-center text-center">
          <p className="text-red-600 font-medium">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-content">
        {/* Header */}
        <div className="text-center pt-4">
          <p className="text-brand-600 font-semibold text-sm uppercase tracking-widest mb-1">
            Miles of Music Camp
          </p>
          <h1 className="text-2xl font-bold text-gray-900">Camp Feedback</h1>
        </div>

        {/* ── RESUME PROMPT ── */}
        {step === 'resume-prompt' && savedState && (
          <div className="card flex flex-col gap-4">
            <p className="font-medium text-gray-800">
              Welcome back, {savedState.name}!
            </p>
            <p className="text-gray-600 text-sm">
              You have an interview in progress. Would you like to pick up where you left off?
            </p>
            <button onClick={handleResume} className="btn-primary">
              Resume my interview
            </button>
            <button onClick={handleStartFresh} className="btn-secondary">
              Start over
            </button>
          </div>
        )}

        {/* ── LANDING ── */}
        {step === 'landing' && session && (
          <>
            <div className="card">
              <h2 className="font-semibold text-gray-800 mb-2">How it works</h2>
              <p className="text-gray-600 text-sm leading-relaxed">
                {session.customText?.introBody ??
                  "You'll record short audio answers to a series of questions about your camp experience. It takes about 10–15 minutes. You can do it alone or interview each other with a partner."}
              </p>
              <p className="text-xs text-gray-400 mt-3 leading-relaxed">
                <strong>Privacy notice:</strong>{' '}
                {session.customText?.privacyNotice ??
                  'Your recordings will be transcribed and reviewed only by Miles of Music organizers. Names are not required. Data is deleted 90 days after camp closes.'}
              </p>
            </div>
            <div className="text-center text-sm text-gray-500">
              {session.questions.length} questions · about 10–15 min
            </div>
            <button onClick={() => setStep('name')} className="btn-primary">
              Get started
            </button>
          </>
        )}

        {/* ── NAME ── */}
        {step === 'name' && (
          <div className="card flex flex-col gap-4">
            <div>
              <h2 className="font-semibold text-gray-800 mb-1">What should we call you?</h2>
              <p className="text-sm text-gray-500">
                A first name or nickname is fine — or make something up.
              </p>
            </div>
            <div>
              <label htmlFor="name-input" className="label">Your name or nickname</label>
              <input
                id="name-input"
                type="text"
                className="input"
                placeholder="e.g. Sam"
                value={name}
                onChange={(e) => { setName(e.target.value); setNameError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
                autoFocus
                autoComplete="off"
                maxLength={80}
              />
              {nameError && <p className="error-msg">{nameError}</p>}
            </div>
            <button onClick={handleNameSubmit} className="btn-primary">
              Continue
            </button>
          </div>
        )}

        {/* ── MODE ── */}
        {step === 'mode' && (
          <div className="card flex flex-col gap-4">
            <div>
              <h2 className="font-semibold text-gray-800 mb-1">How are you doing this?</h2>
              <p className="text-sm text-gray-500">
                You can record on your own, or take turns interviewing each other with a partner on one phone.
              </p>
            </div>

            {error && <p className="error-msg">{error}</p>}

            <button onClick={handleSolo} className="btn-primary">
              On my own
            </button>

            <button onClick={() => setStep('partner-name')} className="btn-secondary">
              With a partner
            </button>
          </div>
        )}

        {/* ── PARTNER NAME ── */}
        {step === 'partner-name' && (
          <div className="card flex flex-col gap-4">
            <div>
              <h2 className="font-semibold text-gray-800 mb-1">What's your partner's name?</h2>
              <p className="text-sm text-gray-500">
                You're <strong>{name}</strong>. Who are you doing this with?
              </p>
            </div>
            <div>
              <label htmlFor="partner-name-input" className="label">Partner's name or nickname</label>
              <input
                id="partner-name-input"
                type="text"
                className="input"
                placeholder="e.g. Alex"
                value={partnerName}
                onChange={(e) => { setPartnerName(e.target.value); setPartnerNameError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handlePartnerNameSubmit()}
                autoFocus
                autoComplete="off"
                maxLength={80}
              />
              {partnerNameError && <p className="error-msg">{partnerNameError}</p>}
              {error && <p className="error-msg">{error}</p>}
            </div>
            <button onClick={handlePartnerNameSubmit} className="btn-primary">
              Start interview
            </button>
            <button onClick={() => setStep('mode')} className="btn-secondary">
              Back
            </button>
          </div>
        )}

        {/* ── CREATING ── */}
        {step === 'creating' && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-gray-500 animate-pulse">Setting up your session…</p>
          </div>
        )}
      </div>
    </div>
  );
}
