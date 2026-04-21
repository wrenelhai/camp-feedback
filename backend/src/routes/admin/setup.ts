import type { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { db } from '../../db';

const setupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const adminSetupRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/setup', async (request, reply) => {
    const existing = await db.adminUser.count();
    if (existing > 0) {
      return reply.code(409).send({ error: 'Setup already complete. Use /admin/auth/login instead.' });
    }

    const result = setupSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({ error: result.error.flatten().fieldErrors });
    }

    const { email, password } = result.data;
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await db.adminUser.create({
      data: { email, passwordHash },
    });

    return reply.code(201).send({ id: user.id, email: user.email });
  });

  // Quick health-check used by the Setup UI to decide whether to show the form
  fastify.get('/setup/status', async (_request, reply) => {
    const count = await db.adminUser.count();
    return reply.send({ setupComplete: count > 0 });
  });
};
