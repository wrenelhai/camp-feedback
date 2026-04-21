import type { FastifyPluginAsync } from 'fastify';
import Anthropic from '@anthropic-ai/sdk';
import JSZip from 'jszip';
import { db } from '../../db';
import { config } from '../../config';

// ── Types ────────────────────────────────────────────────────────────────────

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

type ParsedQuestion = { id: string; order: number; promptText: string; type?: string };

const PROMPT_VERSION = '1.0';
const MODEL = 'claude-sonnet-4-6';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getClient(): Anthropic {
  if (!config.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');
  return new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
}

function parseJson<T>(text: string): T {
  // Strip markdown code fences if present
  const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(clean) as T;
}

async function synthesizeQuestion(
  client: Anthropic,
  questionText: string,
  transcripts: string[],
): Promise<QuestionSynthesisData> {
  const numbered = transcripts.map((t, i) => `${i + 1}. ${t}`).join('\n\n');

  const prompt = `You are analyzing feedback from a music camp. Here are ${transcripts.length} responses from campers to the question: "${questionText}"

Responses:
${numbered}

Analyze these responses and return a JSON object with this exact structure:
{
  "themes": [
    {
      "name": "Theme name (3-5 words)",
      "description": "2-3 sentence description of this theme and what campers said",
      "estimatedCount": <number of responses touching on this theme>,
      "quotes": ["verbatim quote", "verbatim quote", "verbatim quote"]
    }
  ],
  "outliers": ["description of a surprising minority perspective or unique observation"],
  "distressFlags": [
    {
      "quote": "verbatim quote indicating personal distress or safety concern",
      "concern": "brief description of the concern"
    }
  ]
}

Identify 4-7 themes. Include 2-3 direct verbatim quotes per theme. Only populate distressFlags if a response genuinely indicates personal distress, a safety concern, or something requiring organizer follow-up — not just strong opinions. Return only the JSON object, no other text.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
  return parseJson<QuestionSynthesisData>(text);
}

async function synthesizeCrossQuestion(
  client: Anthropic,
  summaries: Array<{ questionText: string; themes: SynthesisTheme[] }>,
): Promise<CrossQuestionSynthesisData> {
  const body = summaries.map(({ questionText, themes }) => {
    const lines = themes.map((t) => `  - ${t.name}: ${t.description}`).join('\n');
    return `Question: "${questionText}"\nThemes:\n${lines}`;
  }).join('\n\n');

  const prompt = `You are analyzing feedback from a music camp. Below are thematic summaries of camper responses to multiple questions.

${body}

Identify 3-5 interesting connections, patterns, or tensions that emerge across questions. Return a JSON object:
{
  "connections": [
    {
      "title": "Connection title (5-8 words)",
      "description": "2-3 sentences describing the cross-question pattern or connection"
    }
  ],
  "keyTakeaways": [
    "High-level takeaway for camp organizers (1-2 sentences)"
  ]
}

Include 3-5 connections and 3-5 key takeaways. Return only the JSON object, no other text.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
  return parseJson<CrossQuestionSynthesisData>(text);
}

function slugify(text: string, maxLen = 40): string {
  return text.slice(0, maxLen).replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-|-$/g, '');
}

// ── Routes ────────────────────────────────────────────────────────────────────

export const adminSynthesisRoutes: FastifyPluginAsync = async (fastify) => {
  // GET — fetch existing synthesis for a session
  fastify.get('/sessions/:id/synthesis', async (request, reply) => {
    const { id } = request.params as { id: string };

    const rows = await db.synthesis.findMany({
      where: { sessionId: id },
      orderBy: { generatedAt: 'desc' },
    });

    // Return the latest synthesis for each questionId (null = cross-question)
    const seen = new Set<string>();
    const latest = rows.filter((s) => {
      const key = s.questionId ?? '__cross__';
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return latest.map((s) => ({ ...s, themes: JSON.parse(s.themes) }));
  });

  // POST — trigger synthesis (all questions + cross-question)
  fastify.post('/sessions/:id/synthesize', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { force } = request.query as { force?: string };

    // Check for existing synthesis and require confirmation to overwrite
    if (force !== 'true') {
      const existing = await db.synthesis.findFirst({
        where: { sessionId: id },
        orderBy: { generatedAt: 'desc' },
      });
      if (existing) {
        return reply.code(409).send({
          confirmRequired: true,
          existingAt: existing.generatedAt.toISOString(),
        });
      }
    }

    const session = await db.session.findUnique({ where: { id } });
    if (!session) return reply.code(404).send({ error: 'Session not found' });

    let questions: ParsedQuestion[];
    try {
      questions = JSON.parse(session.questions) as ParsedQuestion[];
    } catch {
      return reply.code(500).send({ error: 'Could not parse session questions' });
    }

    const questionItems = questions.filter((q) => q.type !== 'info');

    // Gather all redacted transcripts grouped by questionId
    const recordings = await db.recording.findMany({
      where: {
        respondent: { sessionId: id },
        transcriptRedacted: { not: null },
      },
      select: { questionId: true, transcriptRedacted: true },
    });

    const byQuestion = new Map<string, string[]>();
    for (const rec of recordings) {
      if (!rec.transcriptRedacted) continue;
      const arr = byQuestion.get(rec.questionId) ?? [];
      arr.push(rec.transcriptRedacted);
      byQuestion.set(rec.questionId, arr);
    }

    // Delete existing syntheses if overwriting
    if (force === 'true') {
      await db.synthesis.deleteMany({ where: { sessionId: id } });
    }

    const client = getClient();

    // Run all per-question syntheses in parallel
    const questionResults = await Promise.all(
      questionItems.map(async (q) => {
        const transcripts = byQuestion.get(q.id) ?? [];
        if (transcripts.length === 0) return null;
        const data = await synthesizeQuestion(client, q.promptText, transcripts);
        return { q, data, transcriptCount: transcripts.length };
      }),
    );

    const stored: Array<{ questionId: string | null; data: QuestionSynthesisData | CrossQuestionSynthesisData }> = [];

    for (const result of questionResults) {
      if (!result) continue;
      await db.synthesis.create({
        data: {
          sessionId: id,
          questionId: result.q.id,
          type: 'per_question',
          themes: JSON.stringify(result.data),
          rawOutput: JSON.stringify(result.data),
          promptVersion: PROMPT_VERSION,
        },
      });
      stored.push({ questionId: result.q.id, data: result.data });
    }

    // Cross-question synthesis
    const summaries = questionResults
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .map((r) => ({ questionText: r.q.promptText, themes: r.data.themes }));

    if (summaries.length >= 2) {
      const crossData = await synthesizeCrossQuestion(client, summaries);
      await db.synthesis.create({
        data: {
          sessionId: id,
          questionId: null,
          type: 'cross_question',
          themes: JSON.stringify(crossData),
          rawOutput: JSON.stringify(crossData),
          promptVersion: PROMPT_VERSION,
        },
      });
      stored.push({ questionId: null, data: crossData });
    }

    // Return fresh synthesis records
    const rows = await db.synthesis.findMany({
      where: { sessionId: id },
      orderBy: { generatedAt: 'desc' },
    });
    const seen = new Set<string>();
    const latest = rows.filter((s) => {
      const key = s.questionId ?? '__cross__';
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return latest.map((s) => ({ ...s, themes: JSON.parse(s.themes) }));
  });

  // GET — export session as ZIP (transcripts + synthesis Markdown)
  fastify.get('/sessions/:id/export', async (request, reply) => {
    const { id } = request.params as { id: string };

    const session = await db.session.findUnique({
      where: { id },
      include: {
        respondents: {
          orderBy: { createdAt: 'asc' },
          include: { recordings: true },
        },
      },
    });
    if (!session) return reply.code(404).send({ error: 'Session not found' });

    let questions: ParsedQuestion[];
    try { questions = JSON.parse(session.questions) as ParsedQuestion[]; } catch { questions = []; }

    const syntheses = await db.synthesis.findMany({
      where: { sessionId: id },
      orderBy: { generatedAt: 'desc' },
    });
    const seenSynth = new Set<string>();
    const latestSyntheses = syntheses.filter((s) => {
      const key = s.questionId ?? '__cross__';
      if (seenSynth.has(key)) return false;
      seenSynth.add(key);
      return true;
    });

    const qMap = Object.fromEntries(questions.map((q, i) => [q.id, { ...q, num: i + 1 }]));
    const zip = new JSZip();

    // ── Transcripts ──────────────────────────────────────────────────────────
    const txFolder = zip.folder('transcripts')!;
    for (const q of questions.filter((q) => q.type !== 'info')) {
      const meta = qMap[q.id];
      const folderName = `${String(meta.num).padStart(2, '0')}-${slugify(q.promptText)}`;
      const qFolder = txFolder.folder(folderName)!;

      for (const respondent of session.respondents) {
        const recs = respondent.recordings.filter((r) => r.questionId === q.id && r.transcriptRedacted);
        for (const rec of recs) {
          const name = rec.speakerRole === 'A'
            ? (respondent.camperAName ?? 'Camper-A')
            : (respondent.camperBName ?? 'Camper-B');
          const content = `Question: ${q.promptText}\n\nRespondent: ${name}\n\n${rec.transcriptRedacted ?? ''}`;
          qFolder.file(`${slugify(name)}-${rec.speakerRole}.txt`, content);
        }
      }
    }

    // ── Synthesis Markdown ────────────────────────────────────────────────────
    const synthFolder = zip.folder('synthesis')!;

    for (const synth of latestSyntheses.filter((s) => s.type === 'per_question')) {
      const meta = synth.questionId ? qMap[synth.questionId] : null;
      if (!meta) continue;
      const data = JSON.parse(synth.themes) as QuestionSynthesisData;

      let md = `# ${meta.promptText}\n\n`;
      md += `*Generated: ${synth.generatedAt.toISOString().split('T')[0]}*\n\n`;
      for (const theme of data.themes) {
        md += `## ${theme.name} (~${theme.estimatedCount} responses)\n\n`;
        md += `${theme.description}\n\n`;
        if (theme.quotes.length) {
          md += `**Representative quotes:**\n`;
          for (const q of theme.quotes) md += `> "${q}"\n`;
          md += '\n';
        }
      }
      if (data.outliers?.length) {
        md += `## Outliers & Minority Perspectives\n\n`;
        for (const o of data.outliers) md += `- ${o}\n`;
        md += '\n';
      }
      if (data.distressFlags?.length) {
        md += `## ⚠️ Flagged Responses\n\n`;
        for (const f of data.distressFlags) {
          md += `- **"${f.quote}"** — ${f.concern}\n`;
        }
        md += '\n';
      }

      const fileName = `${String(meta.num).padStart(2, '0')}-${slugify(meta.promptText)}-themes.md`;
      synthFolder.file(fileName, md);
    }

    const crossSynth = latestSyntheses.find((s) => s.type === 'cross_question');
    if (crossSynth) {
      const data = JSON.parse(crossSynth.themes) as CrossQuestionSynthesisData;
      let md = `# Cross-Question Synthesis\n\n`;
      md += `*Generated: ${crossSynth.generatedAt.toISOString().split('T')[0]}*\n\n`;
      md += `## Patterns Across Questions\n\n`;
      for (const c of data.connections) {
        md += `### ${c.title}\n\n${c.description}\n\n`;
      }
      md += `## Key Takeaways\n\n`;
      for (const t of data.keyTakeaways) md += `- ${t}\n`;
      synthFolder.file('cross-question-summary.md', md);
    }

    // ── README ────────────────────────────────────────────────────────────────
    zip.file('README.txt', [
      `${session.name} — Feedback Export`,
      `Generated: ${new Date().toISOString().split('T')[0]}`,
      '',
      'Contents:',
      '  transcripts/  Redacted response transcripts organized by question',
      '  synthesis/    Thematic analysis reports (Markdown)',
    ].join('\n'));

    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    const filename = `${slugify(session.name)}-export.zip`;
    reply.header('Content-Type', 'application/zip');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    return reply.send(buffer);
  });
};
