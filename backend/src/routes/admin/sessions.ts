import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import QRCode from 'qrcode';
import fsSync from 'fs';
import { db } from '../../db';
import { config } from '../../config';
import { getAudioSignedUrl, resolveAudioPath, createLocalAudioStream } from '../../storage';

const questionSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().nonnegative(),
  promptText: z.string().min(1),
  promptAudioKey: z.string().optional(),
  sensitive: z.boolean().default(false),
});

const createSessionSchema = z.object({
  name: z.string().min(1),
  questions: z.array(questionSchema).min(1),
});

function parseQuestions(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export const adminSessionsRoutes: FastifyPluginAsync = async (fastify) => {
  // ── Sessions ────────────────────────────────────────────────────────────────

  fastify.get('/sessions', async (_request, reply) => {
    const sessions = await db.session.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { respondents: true } } },
    });
    return sessions.map((s) => ({ ...s, questions: parseQuestions(s.questions) }));
  });

  fastify.post('/sessions', async (request: FastifyRequest, reply) => {
    const user = request.user as { sub: string; email: string };
    const result = createSessionSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({ error: result.error.flatten().fieldErrors });
    }

    const session = await db.session.create({
      data: {
        name: result.data.name,
        questions: JSON.stringify(result.data.questions),
        createdById: user.sub,
      },
    });

    return reply.code(201).send({ ...session, questions: parseQuestions(session.questions) });
  });

  fastify.get('/sessions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = await db.session.findUnique({
      where: { id },
      include: {
        respondents: {
          orderBy: { createdAt: 'desc' },
          include: { _count: { select: { recordings: true } } },
        },
      },
    });
    if (!session) return reply.code(404).send({ error: 'Session not found' });
    return { ...session, questions: parseQuestions(session.questions) };
  });

  // Update session (status, name, or questions)
  fastify.patch('/sessions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { status?: string; name?: string; questions?: unknown[] };

    const data: Record<string, unknown> = {};
    if (body.status !== undefined) data.status = body.status;
    if (body.name !== undefined) data.name = body.name;
    if (body.questions !== undefined) data.questions = JSON.stringify(body.questions);

    const session = await db.session.update({ where: { id }, data });
    return { ...session, questions: parseQuestions(session.questions) };
  });

  // ── QR Code ─────────────────────────────────────────────────────────────────

  fastify.get('/sessions/:id/qr', async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = await db.session.findUnique({ where: { id } });
    if (!session) return reply.code(404).send({ error: 'Session not found' });

    const joinUrl = `${config.APP_URL}/join?session=${id}`;
    const qrBuffer = await QRCode.toBuffer(joinUrl, {
      type: 'png',
      width: 512,
      margin: 2,
      color: { dark: '#1e40af', light: '#ffffff' },
    });

    reply.header('Content-Type', 'image/png');
    reply.header('Content-Disposition', `attachment; filename="qr-${session.name.replace(/\s+/g, '-')}.png"`);
    return reply.send(qrBuffer);
  });

  // ── Responses ────────────────────────────────────────────────────────────────

  fastify.get('/sessions/:id/responses', async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = await db.session.findUnique({ where: { id } });
    if (!session) return reply.code(404).send({ error: 'Session not found' });

    const recordings = await db.recording.findMany({
      where: { respondent: { sessionId: id } },
      include: { respondent: true },
      orderBy: [
        { respondent: { createdAt: 'asc' } },
        { questionId: 'asc' },
        { isFollowup: 'asc' },
      ],
    });

    return recordings;
  });

  // ── Individual recording ──────────────────────────────────────────────────────

  // Serve audio (admin only — authenticated by parent hook)
  fastify.get('/recordings/:id/audio', async (request, reply) => {
    const { id } = request.params as { id: string };
    const recording = await db.recording.findUnique({ where: { id } });

    if (!recording || !recording.audioKey) {
      return reply.code(404).send({ error: 'Recording not found' });
    }

    // In production (Supabase Storage), redirect to a signed URL.
    const signedUrl = await getAudioSignedUrl(recording.audioKey);
    if (signedUrl) {
      return reply.redirect(302, signedUrl);
    }

    // Local dev fallback — stream from disk.
    const audioPath = resolveAudioPath(recording.audioKey);
    if (!fsSync.existsSync(audioPath)) {
      return reply.code(404).send({ error: 'Audio file missing from storage' });
    }

    const ext = audioPath.split('.').pop() ?? 'webm';
    const mimeMap: Record<string, string> = {
      webm: 'audio/webm',
      ogg: 'audio/ogg',
      mp4: 'audio/mp4',
      m4a: 'audio/mp4',
    };
    reply.header('Content-Type', mimeMap[ext] ?? 'application/octet-stream');
    return reply.send(createLocalAudioStream(recording.audioKey));
  });

  // Flag / unflag a recording
  fastify.patch('/recordings/:id/flag', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { flagged, flagReason } = request.body as { flagged: boolean; flagReason?: string };

    const recording = await db.recording.update({
      where: { id },
      data: { flagged, flagReason: flagged ? (flagReason ?? null) : null },
    });
    return recording;
  });

  // Update transcript (manual edit)
  fastify.patch('/recordings/:id/transcript', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { transcript } = request.body as { transcript: string };

    const recording = await db.recording.update({
      where: { id },
      data: { transcript },
    });
    return recording;
  });
};
