import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import type { AppConfig } from '@awt/shared';
import { collectHealth } from './health.js';
import { errorHandler } from './http.js';
import { dataRouter } from './routes/data.js';
import { jobsRouter } from './routes/jobs.js';
import { runsRouter } from './routes/runs.js';
import { targetsRouter } from './routes/targets.js';

export function createApp(config: AppConfig) {
  const app = express();
  app.disable('x-powered-by');
  // Prisma returns BigInt for RunEvent ids; JSON cannot encode BigInt natively.
  app.set('json replacer', (_key: string, value: unknown) => (typeof value === 'bigint' ? value.toString() : value));
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cors({ origin: config.WEB_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', async (_req, res) => {
    // The API itself answered, so it is up; database and queue are checked live on every call.
    const api = {
      ok: true,
      pid: process.pid,
      uptimeSec: Math.round(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    };
    const ai = { provider: config.ai.AI_PROVIDER, configured: config.ai.AI_PROVIDER !== 'none' };
    try {
      const health = await collectHealth();
      res.status(health.status === 'ok' ? 200 : 503).json({ ...health, api, ai });
    } catch (err) {
      console.error('[api] health check failed:', err);
      res.status(503).json({
        status: 'degraded',
        failing: ['health'],
        notConfigured: [],
        services: {},
        api,
        ai,
        error: (err as Error).message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  app.use('/api', runsRouter(config));
  app.use('/api', jobsRouter());
  app.use('/api', targetsRouter(config));
  app.use('/api', dataRouter(config));

  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found', message: 'Not found' });
  });
  app.use(errorHandler);
  return app;
}
