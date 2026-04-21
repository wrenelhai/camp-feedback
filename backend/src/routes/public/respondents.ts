import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../../db';

const createSchema = z.object({
  sessionId: z.string().min(1),
  camperAName: z.string().min(1).max(80),
  solo: z.boolean().default(true),
});

const updateSchema = z.object({
  camperBName: z.string().min(1).max(80).optional(),
  status: z.enum(['in_progress', 'completed', 'partially_complete', 'abandoned']).optional(),
  completedAt: z.string().datetime().optional(),
});

export const publicRespondentsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/', async (request, reply) => {
    const result = createSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({ error: result.error.flatten().fieldErrors });
    }

    const { sessionId, camperAName, solo } = result.data;

    // Verify session exists and is active
    const session = await db.session.findUnique({ where: { id: sessionId } });
    if (!session || session.status !== 'active') {
      return reply.code(404).send({ error: 'Session not found or not accepting responses' });
    }

    const respondent = await db.respondent.create({
      data: { sessionId, camperAName, solo },
    });

    return reply.code(201).send(respondent);
  });

  fastify.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const result = updateSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({ error: result.error.flatten().fieldErrors });
    }

    const data: Record<string, unknown> = { ...result.data };
    if (result.data.completedAt) {
      data.completedAt = new Date(result.data.completedAt);
    }

    const respondent = await db.respondent.update({ where: { id }, data });
    return respondent;
  });
};
