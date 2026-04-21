import type { FastifyPluginAsync } from 'fastify';
import { db } from '../../db';

export const publicSessionsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const session = await db.session.findUnique({ where: { id } });
    if (!session) return reply.code(404).send({ error: 'Session not found' });
    if (session.status === 'draft') return reply.code(404).send({ error: 'Session not available' });

    // Return only the fields campers need — don't expose admin metadata
    return {
      id: session.id,
      name: session.name,
      status: session.status,
      questions: (() => {
        try {
          return JSON.parse(session.questions);
        } catch {
          return [];
        }
      })(),
    };
  });
};
