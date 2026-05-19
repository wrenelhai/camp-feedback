import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import type { Session, Respondent, Question, SessionCustomText } from '../../types';

type DetailSession = Session & { respondents: (Respondent & { _count: { recordings: number } })[] };

export default function AdminSessionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<DetailSession | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Question editing state
  const [editingQuestions, setEditingQuestions] = useState(false);
  const [draftQuestions, setDraftQuestions] = useState<Question[]>([]);
  const [savingQuestions, setSavingQuestions] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Custom text editing state
  const [editingText, setEditingText] = useState(false);
  const [draftText, setDraftText] = useState<SessionCustomText>({});
  const [savingText, setSavingText] = useState(false);
  const [saveTextError, setSaveTextError] = useState('');

  const [copied, setCopied] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.getSessionDetail(id)
      .then((s) => setSession(s as DetailSession))
      .catch((err) => {
        if (err instanceof Error && err.message === 'Unauthorized') {
          navigate('/admin/login', { replace: true });
        } else {
          setError('Could not load session');
        }
      })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const loadQr = useCallback(async () => {
    if (!id) return;
    setQrLoading(true);
    try {
      const url = await api.fetchQr(id);
      setQrUrl(url);
    } catch {
      setError('Could not generate QR code');
    } finally {
      setQrLoading(false);
    }
  }, [id]);

  function startEditingQuestions() {
    if (!session) return;
    setDraftQuestions(session.questions.map((q) => ({ ...q })));
    setSaveError('');
    setEditingQuestions(true);
  }

  function updateDraftQuestion(index: number, field: keyof Question, value: unknown) {
    setDraftQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, [field]: value } : q)),
    );
  }

  function addQuestion() {
    setDraftQuestions((prev) => [
      ...prev,
      {
        id: `q-${Date.now()}`,
        order: prev.length,
        promptText: '',
        sensitive: false,
      },
    ]);
  }

  function removeQuestion(index: number) {
    setDraftQuestions((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((q, i) => ({ ...q, order: i })),
    );
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    const next = index + direction;
    setDraftQuestions((prev) => {
      const arr = [...prev];
      [arr[index], arr[next]] = [arr[next], arr[index]];
      return arr.map((q, i) => ({ ...q, order: i }));
    });
  }

  async function saveQuestions() {
    if (!id) return;
    const trimmed = draftQuestions.map((q) => ({
      ...q,
      promptText: q.promptText.trim(),
    }));
    if (trimmed.some((q) => !q.promptText)) {
      setSaveError('All questions must have text.');
      return;
    }
    setSavingQuestions(true);
    setSaveError('');
    try {
      const updated = await api.patchSession(id, { questions: trimmed });
      setSession((prev) => prev ? { ...prev, questions: updated.questions } : prev);
      setEditingQuestions(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingQuestions(false);
    }
  }

  async function saveCustomText() {
    if (!id) return;
    setSavingText(true);
    setSaveTextError('');
    try {
      const updated = await api.patchSession(id, { customText: draftText });
      setSession((prev) => prev ? { ...prev, customText: updated.customText } : prev);
      setEditingText(false);
    } catch (err) {
      setSaveTextError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingText(false);
    }
  }

  async function downloadQr() {
    const url = qrUrl ?? await (async () => { await loadQr(); return qrUrl; })();
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `qr-${session?.name.replace(/\s+/g, '-') ?? id}.png`;
    a.click();
  }

  async function handleDeleteRespondent(respondentId: string) {
    setDeleting(respondentId);
    try {
      await api.deleteRespondent(respondentId);
      setSession((prev) =>
        prev ? { ...prev, respondents: prev.respondents.filter((r) => r.id !== respondentId) } : prev,
      );
    } catch {
      // ignore — leave UI unchanged
    } finally {
      setDeleting(null);
      setConfirmDeleteId(null);
    }
  }

  function copyJoinUrl() {
    if (!id) return;
    const url = `${window.location.origin}/join?session=${id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const joinUrl = `${window.location.origin}/join?session=${id}`;

  const stats = session ? {
    total: session.respondents.reduce((acc, r) => acc + (r.solo ? 1 : 2), 0),
    completed: session.respondents.filter((r) => r.status === 'completed').reduce((acc, r) => acc + (r.solo ? 1 : 2), 0),
    partial: session.respondents.filter((r) => r.status === 'partially_complete').reduce((acc, r) => acc + (r.solo ? 1 : 2), 0),
    inProgress: session.respondents.filter((r) => r.status === 'in_progress').reduce((acc, r) => acc + (r.solo ? 1 : 2), 0),
  } : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading…</p>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-red-500">{error || 'Session not found'}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <Link to="/admin/sessions" className="text-brand-600 hover:text-brand-800 text-sm font-medium">
          ← Sessions
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-lg font-bold text-gray-900 truncate">{session.name}</h1>
        <span
          className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
            session.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {session.status}
        </span>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-6">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total interviews', value: stats.total },
              { label: 'Completed', value: stats.completed },
              { label: 'In progress', value: stats.inProgress },
              { label: 'Partial', value: stats.partial },
            ].map((s) => (
              <div key={s.label} className="card text-center py-4">
                <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                <p className="text-xs text-gray-500 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <Link
            to={`/admin/sessions/${id}/responses`}
            className="btn-primary w-auto px-5 py-2.5 text-sm"
          >
            View transcripts
          </Link>
          <Link
            to={`/admin/sessions/${id}/synthesis`}
            className="btn-secondary w-auto px-5 py-2.5 text-sm"
          >
            Synthesis
          </Link>
        </div>

        {/* QR Code */}
        <div className="card flex flex-col gap-4">
          <h2 className="font-semibold text-gray-800">QR Code</h2>
          <p className="text-sm text-gray-500 break-all">{joinUrl}</p>

          <div className="flex gap-3 flex-wrap">
            <button onClick={copyJoinUrl} className="btn-secondary w-auto px-4 py-2 text-sm">
              {copied ? 'Copied!' : 'Copy link'}
            </button>
            {!qrUrl && (
              <button onClick={loadQr} disabled={qrLoading} className="btn-secondary w-auto px-4 py-2 text-sm">
                {qrLoading ? 'Generating…' : 'Show QR code'}
              </button>
            )}
            {qrUrl && (
              <button onClick={downloadQr} className="btn-primary w-auto px-4 py-2 text-sm">
                Download QR as PNG
              </button>
            )}
          </div>

          {qrUrl && (
            <div className="flex justify-center p-4 bg-white border border-gray-100 rounded-xl">
              <img
                src={qrUrl}
                alt={`QR code for ${session.name}`}
                className="w-48 h-48"
              />
            </div>
          )}
        </div>

        {/* Custom text */}
        {(() => {
          const DEFAULTS = {
            orgName: 'Miles of Music Camp',
            pageTitle: 'Camp Feedback',
            introBody: "You'll record short audio answers to a series of questions about your camp experience. You can do it alone or interview each other with a partner.",
            privacyNotice: 'Your recordings will be transcribed and reviewed only by Miles of Music organizers. Names are not required. Data is deleted 90 days after camp closes.',
            completionMessage: 'Thanks for sharing your feedback. Your responses will help shape future camps.',
            closingTagline: '🎵 See you next year at Miles of Music Camp!',
          } as const;
          const fields = [
            { key: 'orgName' as const, label: 'Organization name (shown above page title)', rows: 1 },
            { key: 'pageTitle' as const, label: 'Page title', rows: 1 },
            { key: 'introBody' as const, label: '"How it works" description', rows: 3 },
            { key: 'privacyNotice' as const, label: 'Privacy notice', rows: 2 },
            { key: 'completionMessage' as const, label: 'Completion message', rows: 3 },
            { key: 'closingTagline' as const, label: 'Closing tagline', rows: 1 },
          ] as const;
          return (
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-800">Customize camper-facing text</h2>
                {!editingText && (
                  <button
                    onClick={() => {
                      setDraftText({
                        orgName: session.customText?.orgName ?? DEFAULTS.orgName,
                        pageTitle: session.customText?.pageTitle ?? DEFAULTS.pageTitle,
                        introBody: session.customText?.introBody ?? DEFAULTS.introBody,
                        privacyNotice: session.customText?.privacyNotice ?? DEFAULTS.privacyNotice,
                        completionMessage: session.customText?.completionMessage ?? DEFAULTS.completionMessage,
                        closingTagline: session.customText?.closingTagline ?? DEFAULTS.closingTagline,
                      });
                      setSaveTextError('');
                      setEditingText(true);
                    }}
                    className="text-sm text-brand-600 hover:text-brand-800 font-medium"
                  >
                    Edit
                  </button>
                )}
              </div>

              {!editingText && (
                <div className="flex flex-col gap-3 text-sm text-gray-600">
                  {fields.map(({ key, label }) => (
                    <div key={key}>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
                      <p className="text-gray-700">{session.customText?.[key] ?? DEFAULTS[key]}</p>
                    </div>
                  ))}
                </div>
              )}

              {editingText && (
                <div className="flex flex-col gap-4">
                  {saveTextError && (
                    <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{saveTextError}</p>
                  )}
                  {fields.map(({ key, label, rows }) => (
                    <div key={key}>
                      <label className="label">{label}</label>
                      <textarea
                        className="input resize-y text-sm py-2"
                        rows={rows}
                        value={draftText[key] ?? ''}
                        onChange={(e) => setDraftText((prev) => ({ ...prev, [key]: e.target.value }))}
                      />
                    </div>
                  ))}
                  <div className="flex gap-3">
                    <button onClick={saveCustomText} disabled={savingText} className="btn-primary text-sm py-2.5">
                      {savingText ? 'Saving…' : 'Save text'}
                    </button>
                    <button onClick={() => setEditingText(false)} disabled={savingText} className="btn-secondary text-sm py-2.5">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Questions */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-800">
              Questions ({session.questions.length})
            </h2>
            {!editingQuestions && (
              <button
                onClick={startEditingQuestions}
                className="text-sm text-brand-600 hover:text-brand-800 font-medium"
              >
                Edit
              </button>
            )}
          </div>

          {/* Read-only view */}
          {!editingQuestions && (
            <ol className="flex flex-col gap-2">
              {session.questions.map((q, i) => (
                <li key={q.id} className="flex gap-3 text-sm text-gray-700">
                  <span className="text-gray-400 font-mono flex-shrink-0 w-6 text-right">
                    {i + 1}.
                  </span>
                  <span>
                    {q.promptText}
                    {q.type === 'info' && (
                      <span className="ml-1 text-xs text-blue-600">(info text)</span>
                    )}
                    {q.sensitive && (
                      <span className="ml-1 text-xs text-amber-600">(sensitive)</span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}

          {/* Edit view */}
          {editingQuestions && (
            <div className="flex flex-col gap-3">
              {saveError && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{saveError}</p>
              )}

              {draftQuestions.map((q, i) => {
                const isInfo = q.type === 'info';
                return (
                  <div
                    key={q.id}
                    className={`border rounded-xl p-3 flex flex-col gap-2 ${
                      isInfo ? 'border-blue-200 bg-blue-50/40' : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-gray-400 w-6 text-right flex-shrink-0">
                        {i + 1}.
                      </span>
                      <textarea
                        className="input flex-1 resize-none text-sm py-2"
                        rows={isInfo ? 4 : 2}
                        value={q.promptText}
                        onChange={(e) => updateDraftQuestion(i, 'promptText', e.target.value)}
                        placeholder={isInfo ? 'Info text shown to camper (e.g. list of community agreements)…' : 'Question text…'}
                      />
                    </div>

                    <div className="flex items-center justify-between pl-8">
                      <div className="flex items-center gap-4">
                        {/* Type toggle */}
                        <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isInfo}
                            onChange={(e) =>
                              updateDraftQuestion(i, 'type', e.target.checked ? 'info' : 'question')
                            }
                            className="rounded"
                          />
                          Info text (no recording)
                        </label>

                        {/* Sensitive — only relevant for questions */}
                        {!isInfo && (
                          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={q.sensitive ?? false}
                              onChange={(e) => updateDraftQuestion(i, 'sensitive', e.target.checked)}
                              className="rounded"
                            />
                            Sensitive
                          </label>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => moveQuestion(i, -1)}
                          disabled={i === 0}
                          className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                          aria-label="Move up"
                          title="Move up"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => moveQuestion(i, 1)}
                          disabled={i === draftQuestions.length - 1}
                          className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                          aria-label="Move down"
                          title="Move down"
                        >
                          ↓
                        </button>
                        <button
                          onClick={() => removeQuestion(i)}
                          className="p-1 text-red-400 hover:text-red-600 ml-1"
                          aria-label="Remove"
                          title="Remove"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              <button
                onClick={addQuestion}
                className="btn-secondary text-sm py-2"
              >
                + Add question
              </button>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={saveQuestions}
                  disabled={savingQuestions}
                  className="btn-primary text-sm py-2.5"
                >
                  {savingQuestions ? 'Saving…' : 'Save questions'}
                </button>
                <button
                  onClick={() => setEditingQuestions(false)}
                  disabled={savingQuestions}
                  className="btn-secondary text-sm py-2.5"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Recent respondents */}
        {session.respondents.length > 0 && (
          <div className="card">
            <h2 className="font-semibold text-gray-800 mb-3">Recent interviews</h2>
            <div className="flex flex-col gap-2">
              {session.respondents.slice(0, 10).map((r) => (
                <div key={r.id} className="flex items-center justify-between text-sm py-1.5 gap-3">
                  <span className="text-gray-700 min-w-0 truncate">
                    {r.camperAName ?? 'Anonymous'}
                    {r.camperBName ? ` & ${r.camperBName}` : ''}
                  </span>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-gray-400">{r._count.recordings} recording{r._count.recordings !== 1 ? 's' : ''}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        r.status === 'completed' ? 'bg-green-100 text-green-700'
                        : r.status === 'in_progress' ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {r.status.replace(/_/g, ' ')}
                    </span>

                    {confirmDeleteId === r.id ? (
                      <span className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleDeleteRespondent(r.id)}
                          disabled={deleting === r.id}
                          className="text-xs text-white bg-red-500 hover:bg-red-600 px-2 py-0.5 rounded disabled:opacity-50"
                        >
                          {deleting === r.id ? '…' : 'Confirm'}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-xs text-gray-500 hover:text-gray-700"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(r.id)}
                        className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                        title="Delete this response"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {session.respondents.length > 10 && (
                <p className="text-xs text-gray-400 mt-1">
                  …and {session.respondents.length - 10} more
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
