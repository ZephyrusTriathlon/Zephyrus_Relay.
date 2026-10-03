import { installAuth } from './auth.js';
import { orderRoutes } from './routes/orders.js';
import { planningRoutes } from './routes/planning.js';
import { operationRoutes } from './routes/operations.js';
import { syncRoutes } from './routes/sync.js';
import express from 'express';
import { getDatabase } from './db.js';
import helmet from 'helmet';
import { fileURLToPath } from 'node:url';
import { developmentReads } from './routes/development.js';
import { publicPath, containedFile, legacyScripts, notFound } from '../../web/static-policy.js';
const defaultWebRoot = fileURLToPath(new URL('../../web/dist/', import.meta.url));
export function createApp({ webRoot = defaultWebRoot, devReads = false, database, orderClock, ...authOptions } = {}) {
  const app = express();
  app.disable('x-powered-by');
  // Keep the Stage 1–3 response contract; all order errors use one structured envelope,
  // including JSON parsing, origin, session, and unexpected database failures.
  app.use(['/api/orders', '/api/planning', '/api/operations', '/api/sync'], (_req, res, next) => {
    const json = res.json.bind(res);
    res.json = body => json(typeof body?.error === 'string' ? { error: { code: ({400:'INVALID_JSON',401:'UNAUTHENTICATED',403:'FORBIDDEN',404:'NOT_FOUND',413:'PAYLOAD_TOO_LARGE',415:'UNSUPPORTED_MEDIA_TYPE',503:'SERVICE_UNAVAILABLE'})[res.statusCode] || 'INTERNAL_ERROR', message: body.error } } : body);
    next();
  });
  app.use(helmet({ contentSecurityPolicy: { directives: { 'upgrade-insecure-requests': null } } }));
  app.use((req, res, next) => publicPath(req.url) === null ? notFound(res) : next());
  app.use('/api', express.json({ limit: '100kb' }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'zephyrus-relay-api' }));
  app.get('/api/ready', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    try { await (database || getDatabase)().user.count(); res.json({ status: 'ready' }); }
    catch { res.status(503).json({ status: 'unavailable' }); }
  });
  app.locals.sessionStore = installAuth(app, { database, ...authOptions });
  app.use('/api/orders', orderRoutes({ database, orderClock }));
  app.use('/api/planning', planningRoutes({ database }));
  app.use('/api/operations', operationRoutes({ database }));
  app.use('/api/sync', syncRoutes({ database }));
  app.use('/api', developmentReads({ enabled: devReads, database }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((req, res, next) => {
    const file = publicPath(req.url);
    const allowed = file === 'index.html' || file === 'sw.js' || legacyScripts.includes(file) || /^assets\/[\w.-]+\.(js|css)$/.test(file);
    if (!['GET', 'HEAD'].includes(req.method) || !allowed || !containedFile(webRoot, file)) return notFound(res);
    if(file==='sw.js')res.set('Cache-Control','no-cache');
    res.sendFile(file, { root: webRoot }, error => { if (error) next(error); });
  });
  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status === 400 ? 400 : error.status === 413 ? 413 : 500;
    if (status === 500) console.error('API request failed');
    res.status(status).json({ error: status === 400 ? 'Invalid JSON' : status === 413 ? 'Request body too large' : 'Internal server error' });
  });
  return app;
}
