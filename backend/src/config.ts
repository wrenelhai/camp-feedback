import { z } from 'zod';
import path from 'path';

if (process.env.NODE_ENV !== 'production') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('dotenv').config();
  } catch {
    // dotenv optional in dev
  }
}

const envSchema = z.object({
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string().default('change-me-in-production-use-a-long-random-string'),
  PORT: z.coerce.number().default(3001),
  UPLOAD_DIR: z.string().default('./uploads'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  APP_URL: z.string().default('http://localhost:3001'),

  // Supabase — required in production, optional in local dev (falls back to disk)
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_KEY: z.string().optional(),
  SUPABASE_BUCKET: z.string().default('recordings'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  ...parsed.data,
  UPLOAD_DIR: path.resolve(parsed.data.UPLOAD_DIR),
};
