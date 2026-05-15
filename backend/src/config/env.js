import 'dotenv/config'
import { z } from 'zod'

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SUPABASE_BUCKET: z.string().min(1).default('uploads'),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  MAX_FILE_BYTES: z.coerce.number().int().positive().default(52_428_800),
  DEFAULT_EXPIRY_DAYS: z.coerce.number().int().positive().default(7),
  MAX_EXPIRY_DAYS: z.coerce.number().int().positive().default(30),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  PUBLIC_SHARE_BASE_URL: z.string().url().default('http://localhost:5173/s'),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  console.error('Invalid environment configuration:')
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
