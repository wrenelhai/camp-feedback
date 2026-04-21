import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import jsPDF from 'jspdf';
import { api } from '../../lib/api';
import type {
  Session,
  SynthesisRecord,
  QuestionSynthesisData,
  CrossQuestionSynthesisData,
} from '../../types';

export default function AdminSynthesis() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<Session | null>(null);
  const [syntheses, setSyntheses] = useState<SynthesisRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [synthesizing, setSynthesizing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [confirmOverwrite, setConfirmOverwrite] = useState<{ existingAt: string } | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([api.getSessionDetail(id), api.getSynthesis(id)])
      .then(([s, synths]) => {
        setSession(s);
        setSyntheses(synths);
      })
      .catch((err) => {
        if (err instanceof Error && err.message === 'Unauthorized') {
          navigate('/admin/login', { replace: true });
        } else {
          setError('Could not load synthesis data');
        }
      })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  async function handleSynthesize(force = false) {
    if (!id) return;
    setError('');
    setSynthesizing(true);
    setConfirmOverwrite(null);
    try {
      const result = await api.synthesize(id, force);
      if ('confirmRequired' in result) {
        setConfirmOverwrite({ existingAt: result.existingAt });
        setSynthesizing(false);
        return;
      }
      setSyntheses(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Synthesis failed. Please try again.');
    } finally {
      setSynthesizing(false);
    }
  }

  function handleExportPDF() {
    if (!session) return;
    setExporting(true);
    try {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 20;
      const contentW = pageW - margin * 2;
      let y = margin;

      function checkPageBreak(needed = 15) {
        if (y + needed > pageH - margin) { doc.addPage(); y = margin; }
      }

      function addText(text: string, size: number, bold = false, indent = 0) {
        doc.setFontSize(size);
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        const lines = doc.splitTextToSize(text, contentW - indent) as string[];
        const lineH = size * 0.45;
        checkPageBreak(lines.length * lineH + 2);
        doc.text(lines, margin + indent, y);
        y += lines.length * lineH + 2;
      }

      // Title
      addText(session.name, 18, true);
      addText(`Synthesis Report  ·  ${new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`, 9);
      y += 6;

      // Per-question sections
      for (const synth of sortedPerQuestion) {
        const data = synth.themes as QuestionSynthesisData;
        const qMeta = synth.questionId ? questionMap[synth.questionId] : null;
        if (!qMeta) continue;

        checkPageBreak(30);
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, y, pageW - margin, y);
        y += 5;

        addText(`QUESTION ${qMeta.num}`, 7, true);
        addText(qMeta.promptText, 13, true);
        y += 3;

        for (const theme of data.themes) {
          checkPageBreak(22);
          addText(`${theme.name}  (~${theme.estimatedCount} responses)`, 10, true);
          addText(theme.description, 9);
          for (const q of theme.quotes) {
            checkPageBreak(10);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'italic');
            const lines = doc.splitTextToSize(`"${q}"`, contentW - 8) as string[];
            checkPageBreak(lines.length * 3.8 + 1);
            doc.text(lines, margin + 4, y);
            y += lines.length * 3.8 + 1;
          }
          y += 3;
        }

        if (data.outliers?.length) {
          checkPageBreak(14);
          addText('Outliers & minority perspectives', 8, true);
          for (const o of data.outliers) addText(`• ${o}`, 8, false, 3);
          y += 2;
        }

        if (data.distressFlags?.length) {
          checkPageBreak(14);
          addText('Flagged for follow-up', 8, true);
          for (const f of data.distressFlags) addText(`• "${f.quote}" — ${f.concern}`, 8, false, 3);
          y += 2;
        }

        y += 4;
      }

      // Cross-question section
      if (crossQuestion) {
        const data = crossQuestion.themes as CrossQuestionSynthesisData;
        checkPageBreak(30);
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, y, pageW - margin, y);
        y += 5;
        addText('PATTERNS ACROSS QUESTIONS', 7, true);
        addText('Cross-question synthesis', 13, true);
        y += 3;

        for (const c of data.connections) {
          checkPageBreak(20);
          addText(c.title, 10, true);
          addText(c.description, 9);
          y += 3;
        }

        if (data.keyTakeaways?.length) {
          checkPageBreak(14);
          addText('Key takeaways', 10, true);
          for (const t of data.keyTakeaways) addText(`• ${t}`, 9, false, 3);
        }
      }

      const filename = `${session.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-synthesis.pdf`;
      doc.save(filename);
    } finally {
      setExporting(false);
    }
  }

  const questionMap = session
    ? Object.fromEntries(session.questions.filter((q) => q.type !== 'info').map((q, i) => [q.id, { ...q, num: i + 1 }]))
    : {};

  const sortedPerQuestion = syntheses
    .filter((s) => s.type === 'per_question')
    .sort((a, b) => {
      const numA = a.questionId ? (questionMap[a.questionId]?.num ?? 999) : 999;
      const numB = b.questionId ? (questionMap[b.questionId]?.num ?? 999) : 999;
      return numA - numB;
    });

  const crossQuestion = syntheses.find((s) => s.type === 'cross_question');
  const lastGeneratedAt = syntheses.length > 0
    ? new Date(syntheses[0].generatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  const allDistressFlags = sortedPerQuestion.flatMap((s) => {
    const data = s.themes as QuestionSynthesisData;
    return (data.distressFlags ?? []).map((f) => ({
      ...f,
      questionId: s.questionId,
    }));
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading…</p>
      </div>
    );
  }

  if (error && !session) {
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
        <h1 className="text-lg font-bold text-gray-900">Synthesis</h1>
        <div className="ml-auto flex items-center gap-3">
          {syntheses.length > 0 && (
            <button
              onClick={handleExportPDF}
              disabled={exporting}
              className="btn-secondary w-auto px-4 py-2 text-sm"
            >
              {exporting ? 'Preparing…' : 'Export PDF'}
            </button>
          )}
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-6">

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Distress flags alert */}
        {allDistressFlags.length > 0 && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-4 flex flex-col gap-3">
            <p className="text-sm font-semibold text-amber-800">
              ⚠️ {allDistressFlags.length} response{allDistressFlags.length !== 1 ? 's' : ''} flagged for follow-up
            </p>
            <div className="flex flex-col gap-2">
              {allDistressFlags.map((f, i) => {
                const q = f.questionId ? questionMap[f.questionId] : null;
                return (
                  <div key={i} className="text-sm text-amber-900">
                    {q && <span className="font-medium">Q{q.num}: </span>}
                    <span className="italic">"{f.quote}"</span>
                    <span className="text-amber-700"> — {f.concern}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Synthesize action area */}
        <div className="card flex flex-col gap-3">
          {synthesizing ? (
            <div className="flex items-center gap-3 py-2">
              <div className="w-4 h-4 border-2 border-brand-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <p className="text-sm text-gray-600">Synthesizing responses… this may take a minute or two.</p>
            </div>
          ) : confirmOverwrite ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-gray-700">
                A synthesis already exists from <strong>{new Date(confirmOverwrite.existingAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</strong>. Overwrite it?
              </p>
              <div className="flex gap-3">
                <button onClick={() => handleSynthesize(true)} className="btn-primary w-auto px-5 py-2 text-sm">
                  Yes, overwrite
                </button>
                <button onClick={() => setConfirmOverwrite(null)} className="btn-secondary w-auto px-5 py-2 text-sm">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="font-medium text-gray-800">
                  {lastGeneratedAt ? `Last synthesized: ${lastGeneratedAt}` : 'No synthesis yet'}
                </p>
                {!lastGeneratedAt && (
                  <p className="text-sm text-gray-500 mt-0.5">
                    Run synthesis to generate thematic summaries from all transcribed responses.
                  </p>
                )}
              </div>
              <button
                onClick={() => handleSynthesize(false)}
                className="btn-primary w-auto px-5 py-2.5 text-sm flex-shrink-0"
              >
                {lastGeneratedAt ? 'Re-synthesize' : 'Synthesize all questions'}
              </button>
            </div>
          )}
        </div>

        {/* Per-question synthesis */}
        {sortedPerQuestion.map((synth) => {
          const data = synth.themes as QuestionSynthesisData;
          const qMeta = synth.questionId ? questionMap[synth.questionId] : null;
          if (!qMeta) return null;

          return (
            <div key={synth.id} className="flex flex-col gap-4">
              {/* Question heading */}
              <div>
                <p className="text-xs font-semibold text-brand-600 uppercase tracking-wider">
                  Question {qMeta.num}
                </p>
                <h2 className="text-base font-semibold text-gray-900 mt-0.5">{qMeta.promptText}</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {data.themes.length} themes · {data.themes.reduce((a, t) => a + t.estimatedCount, 0)} responses analyzed
                </p>
              </div>

              {/* Theme cards */}
              <div className="flex flex-col gap-3">
                {data.themes.map((theme, ti) => (
                  <div key={ti} className="card py-4">
                    <div className="flex items-baseline justify-between gap-2 mb-2">
                      <h3 className="font-semibold text-gray-900 text-sm">{theme.name}</h3>
                      <span className="text-xs text-gray-400 flex-shrink-0">~{theme.estimatedCount} responses</span>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">{theme.description}</p>
                    {theme.quotes.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        {theme.quotes.map((q, qi) => (
                          <blockquote key={qi} className="border-l-2 border-brand-200 pl-3 text-sm text-gray-500 italic">
                            "{q}"
                          </blockquote>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Outliers */}
              {data.outliers?.length > 0 && (
                <div className="card py-3 bg-gray-50">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Outliers & minority perspectives
                  </p>
                  <ul className="flex flex-col gap-1">
                    {data.outliers.map((o, i) => (
                      <li key={i} className="text-sm text-gray-600">— {o}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Per-question distress flags */}
              {data.distressFlags?.length > 0 && (
                <div className="card py-3 border-amber-200 bg-amber-50">
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">
                    ⚠️ Flagged for follow-up
                  </p>
                  <ul className="flex flex-col gap-1.5">
                    {data.distressFlags.map((f, i) => (
                      <li key={i} className="text-sm text-amber-900">
                        <span className="italic">"{f.quote}"</span>
                        <span className="text-amber-700"> — {f.concern}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}

        {/* Cross-question synthesis */}
        {crossQuestion && (() => {
          const data = crossQuestion.themes as CrossQuestionSynthesisData;
          return (
            <div className="flex flex-col gap-4 pt-2 border-t border-gray-200">
              <div>
                <p className="text-xs font-semibold text-brand-600 uppercase tracking-wider">Patterns across questions</p>
                <h2 className="text-base font-semibold text-gray-900 mt-0.5">Cross-question synthesis</h2>
              </div>

              <div className="flex flex-col gap-3">
                {data.connections.map((c, i) => (
                  <div key={i} className="card py-4">
                    <h3 className="font-semibold text-gray-900 text-sm mb-1">{c.title}</h3>
                    <p className="text-sm text-gray-600">{c.description}</p>
                  </div>
                ))}
              </div>

              {data.keyTakeaways?.length > 0 && (
                <div className="card py-4 bg-brand-50 border-brand-100">
                  <p className="text-xs font-semibold text-brand-700 uppercase tracking-wider mb-3">Key takeaways</p>
                  <ul className="flex flex-col gap-2">
                    {data.keyTakeaways.map((t, i) => (
                      <li key={i} className="flex gap-2 text-sm text-brand-900">
                        <span className="text-brand-400 flex-shrink-0">•</span>
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })()}

        {/* Empty state */}
        {syntheses.length === 0 && !synthesizing && (
          <div className="card text-center py-12 text-gray-400">
            <p className="text-lg mb-1">No synthesis yet</p>
            <p className="text-sm">Click "Synthesize all questions" above to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}
