import { z } from 'zod';
import { AiProvider } from './enums.js';

const hexKey = z
  .string({ error: 'is missing. Run: npm run gen:key' })
  .regex(/^[0-9a-fA-F]{64}$/, 'must be 64 hex characters (32 bytes). Run: npm run gen:key');

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined));

/**
 * AI configuration. Provider and model names are configuration only —
 * no model id is hardcoded anywhere. Per-project overrides live in the
 * `ai_settings` table.
 */
export const aiConfigSchema = z
  .object({
    AI_PROVIDER: z.enum(AiProvider).default('none'),
    AI_API_KEY: optionalString,
    AI_BASE_URL: optionalString,
    AI_TEXT_MODEL: optionalString,
    AI_VISION_MODEL: optionalString,
    AI_FAST_MODEL: optionalString,
    AI_MAX_TOKENS_PER_RUN: z.coerce.number().int().positive().default(500_000),
  })
  .superRefine((c, ctx) => {
    if (c.AI_PROVIDER === 'none') return;
    if (!c.AI_API_KEY && c.AI_PROVIDER !== 'openai-compatible') {
      ctx.addIssue({ code: 'custom', path: ['AI_API_KEY'], message: `required when AI_PROVIDER=${c.AI_PROVIDER}` });
    }
    if (!c.AI_TEXT_MODEL) {
      ctx.addIssue({ code: 'custom', path: ['AI_TEXT_MODEL'], message: 'required when an AI provider is enabled' });
    }
    if (c.AI_PROVIDER === 'openai-compatible' && !c.AI_BASE_URL) {
      ctx.addIssue({ code: 'custom', path: ['AI_BASE_URL'], message: 'required for openai-compatible provider' });
    }
  });

export const serverConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** Optional until PostgreSQL is configured; database-backed features report "not configured" without it. */
  DATABASE_URL: optionalString,
  /** Not used: the job queue runs on PostgreSQL. Kept so an existing .env still validates. */
  REDIS_URL: optionalString,
  /** Jobs one worker process runs at the same time (each test run opens its own browser). */
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
  /** How often an idle worker checks for new jobs. */
  QUEUE_POLL_MS: z.coerce.number().int().min(100).max(60_000).default(1_000),
  /**
   * Development only: exact "host:port" targets that may resolve to private/loopback addresses (comma-separated),
   * e.g. "localhost:4500" for the bundled Acme Store fixture. Empty = every private address is blocked.
   */
  ALLOW_PRIVATE_TARGETS: optionalString,
  /** A RUNNING job whose worker hasn't sent a heartbeat for this long is re-queued (worker crash). */
  QUEUE_LEASE_MS: z.coerce.number().int().min(5_000).max(3_600_000).default(60_000),
  API_PORT: z.coerce.number().int().default(4000),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  JWT_SECRET: hexKey,
  CREDENTIAL_MASTER_KEY: hexKey,
  CREDENTIAL_KEY_VERSION: z.coerce.number().int().positive().default(1),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./storage'),
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;
export type AiConfig = z.infer<typeof aiConfigSchema>;
export type AppConfig = ServerConfig & { ai: AiConfig };

export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);
    this.name = 'ConfigError';
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const server = serverConfigSchema.safeParse(env);
  const ai = aiConfigSchema.safeParse(env);
  const problems: string[] = [];
  if (!server.success) problems.push(...server.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  if (!ai.success) problems.push(...ai.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  if (!server.success || !ai.success) throw new ConfigError(problems);
  return { ...server.data, ai: ai.data };
}
