import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { databaseReady } from './config/database.js';
import { authRoutes } from './modules/auth/routes.js';
import { HttpError } from './modules/shared/errors.js';

export function createApp({ clientOrigin = 'http://localhost:5173' } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: clientOrigin }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/ready', async (_req, res) => {
    const ready = await databaseReady();
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'unavailable' });
  });
  app.use('/api/auth', authRoutes());
  app.use((_req, res) => res.status(404).json({ error: { message: 'Route not found.' } }));
  // Express requires four parameters to recognize an error handler.
  app.use((error, _req, res, _next) => {
    const status = error.status >= 400 && error.status < 500 ? error.status : 500;
    const message = status === 500 ? 'An unexpected error occurred.' : error instanceof HttpError ? error.message : 'Invalid request.';
    res.status(status).json({ error: { message } });
  });
  return app;
}
