import type { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { db } from '../../db';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const adminAuthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/auth/login', async (request, reply) => {
    const result = loginSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({ error: 'Invalid request body' });
    }

    const { email, password } = result.data;

    const user = await db.adminUser.findUnique({ where: { email } });
    if (!user) {
      // Constant-time response to prevent user enumeration
      await bcrypt.hash('dummy', 12);
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const token = fastify.jwt.sign(
      { sub: user.id, email: user.email },
      { expiresIn: '7d' },
    );

    return reply.send({ token, email: user.email });
  });
};
