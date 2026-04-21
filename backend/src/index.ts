import Fastify, { type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fs from 'fs';
import { config } from './config';
import { adminSetupRoutes } from './routes/admin/setup';
import { adminAuthRoutes } from './routes/admin/auth';
import { adminSessionsRoutes } from './routes/admin/sessions';
import { publicSessionsRoutes } from './routes/public/sessions';
import { publicRespondentsRoutes } from './routes/public/respondents';
import { publicRecordingsRoutes } from './routes/public/recordings';

// Extend @fastify/jwt types
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; email: string };
    user: { sub: string; email: string };
  }
}

async function buildApp() {
  const app = Fastify({ logger: { level: 'info' } });

  // Ensure upload directory exists
  fs.mkdirSync(config.UPLOAD_DIR, { recursive: true });

  await app.register(cors, {
    origin: (origin, cb) => {
      if (
        !origin ||
        origin === config.FRONTEND_URL ||
        /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
        /^https:\/\/[^.]+\.vercel\.app$/.test(origin)
      ) {
        cb(null, true);
      } else {
        cb(new Error('Not allowed by CORS'), false);
      }
    },
    credentials: true,
  });

  await app.register(jwt, { secret: config.JWT_SECRET });

  await app.register(multipart, {
    limits: {
      fileSize: 100 * 1024 * 1024, // 100 MB per upload (3-min WebM is ~3 MB; headroom for future)
    },
  });

  // Rate limit all endpoints (60 req/min per IP — low enough to not bother real users)
  await app.register(rateLimit, {
    max: 60,
    timeWindow: '1 minute',
    keyGenerator: (req: FastifyRequest) => req.ip,
  });

  // ── Public camper routes (no auth) ──────────────────────────────────────────
  await app.register(publicSessionsRoutes, { prefix: '/sessions' });
  await app.register(publicRespondentsRoutes, { prefix: '/respondents' });
  await app.register(publicRecordingsRoutes, { prefix: '/recordings' });

  // ── Admin unauthenticated routes ─────────────────────────────────────────────
  await app.register(adminSetupRoutes, { prefix: '/admin' });
  await app.register(adminAuthRoutes, { prefix: '/admin' });

  // ── Admin authenticated routes (JWT required) ────────────────────────────────
  await app.register(
    async (authApp) => {
      authApp.addHook('onRequest', async (request, reply) => {
        try {
          await request.jwtVerify();
        } catch {
          reply.code(401).send({ error: 'Unauthorized' });
        }
      });
      await authApp.register(adminSessionsRoutes);
    },
    { prefix: '/admin' },
  );

  return app;
}

async function main() {
  const app = await buildApp();
  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
    console.log(`\n🎵 Camp Feedback API running on http://localhost:${config.PORT}\n`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
