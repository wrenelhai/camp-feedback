import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import type { Session, Question } from '../../types';

type SessionWithCount = Session & { _count: { respondents: number }; interviewCount: number };

const DEFAULT_QUESTIONS: Question[] = [
  { id: 'q1', order: 0, promptText: 'What was your role at camp this year? (e.g. returning camper, new camper, instructor, croo member)' },
  { id: 'q2', order: 1, promptText: 'Thinking about the overall vibe of camp — sense of community, belonging, inclusivity, joy, creative collaboration — what worked well? What did you like?' },
  { id: 'q3', order: 2, promptText: 'Still thinking about the overall camp vibe: what could be improved? What didn\'t you like?' },
  { id: 'q4', order: 3, promptText: 'Thinking about camp programming — classes, workshops, lunch and dinner concerts, nightly events — what worked well? What did you like?' },
  { id: 'q5', order: 4, promptText: 'Still thinking about camp programming: what could be improved? What didn\'t you like?' },
  { id: 'q6', order: 5, promptText: 'Thinking about the community agreements we formed at the start of camp: were there moments this week when we lived up to those agreements, or fell short?', sensitive: true },
  { id: 'q7', order: 6, promptText: 'Can you think of a new community agreement, or a change to an existing one, that you\'d suggest for next year?' },
  { id: 'q8', order: 7, promptText: 'Thinking about camp logistics — registration, transportation, food, lodging — what worked well? What did you like?' },
  { id: 'q9', order: 8, promptText: 'Still thinking about logistics: what could be improved? What didn\'t you like?' },
  { id: 'q10', order: 9, promptText: 'Thinking about communication before and during camp — emails, announcement boards, in-person announcements — what worked well?' },
  { id: 'q11', order: 10, promptText: 'Still thinking about communication: what didn\'t work well and could be improved?' },
  { id: 'q12', order: 11, promptText: 'If you\'d like to share, please give a short testimonial about what makes this camp special to you.' },
  { id: 'q13', order: 12, promptText: 'Anything else you\'d like to add?' },
];

export default function AdminSessions() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    loadSessions();
  }, []);

  async function loadSessions() {
    try {
      const data = await api.listSessions();
      setSessions(data);
    } catch (err) {
      if (err instanceof Error && err.message === 'Unauthorized') {
        navigate('/admin/login', { replace: true });
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setCreateError('');
    try {
      const session = await api.createSession({
        name: newName.trim(),
        questions: DEFAULT_QUESTIONS,
      });
      navigate(`/admin/sessions/${session.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create session');
      setCreating(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem('adminToken');
    navigate('/admin/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-brand-600 font-semibold uppercase tracking-widest">Miles of Music</p>
          <h1 className="text-lg font-bold text-gray-900">Admin Dashboard</h1>
        </div>
        <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-gray-700">
          Sign out
        </button>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-800">Sessions</h2>
          <button onClick={() => setShowCreate(true)} className="btn-primary w-auto px-5 py-2.5 text-sm">
            New session
          </button>
        </div>

        {/* Create session form */}
        {showCreate && (
          <form onSubmit={handleCreate} className="card flex flex-col gap-3">
            <h3 className="font-semibold text-gray-800">New session</h3>
            <p className="text-sm text-gray-500">
              The default question set for Miles of Music Camp will be pre-loaded. You can adjust questions later.
            </p>
            {createError && <p className="error-msg">{createError}</p>}
            <div>
              <label htmlFor="session-name" className="label">Session name</label>
              <input
                id="session-name"
                type="text"
                className="input"
                placeholder="e.g. Miles of Music 2026"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <button type="submit" className="btn-primary" disabled={creating}>
                {creating ? 'Creating…' : 'Create'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => { setShowCreate(false); setCreateError(''); }}
                disabled={creating}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {loading && <p className="text-gray-500 text-center py-8">Loading…</p>}

        {!loading && sessions.length === 0 && !showCreate && (
          <div className="card text-center py-10 text-gray-400">
            <p className="text-lg mb-2">No sessions yet</p>
            <p className="text-sm">Create a session to get started.</p>
          </div>
        )}

        {sessions.map((s) => (
          <Link
            key={s.id}
            to={`/admin/sessions/${s.id}`}
            className="card flex items-start justify-between gap-4 hover:border-brand-200
                       hover:shadow transition-all no-underline"
          >
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 truncate">{s.name}</p>
              <p className="text-sm text-gray-500 mt-0.5">
                {new Date(s.createdAt).toLocaleDateString()} ·{' '}
                {s.questions.length} questions ·{' '}
                {s.interviewCount} interview{s.interviewCount !== 1 ? 's' : ''}
              </p>
            </div>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${
                s.status === 'active'
                  ? 'bg-green-100 text-green-700'
                  : s.status === 'closed'
                  ? 'bg-gray-100 text-gray-500'
                  : 'bg-yellow-100 text-yellow-700'
              }`}
            >
              {s.status}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
