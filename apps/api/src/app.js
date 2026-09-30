import express from 'express';
import helmet from 'helmet';
import { fileURLToPath } from 'node:url';
import { developmentReads } from './routes/development.js';
import { publicPath, containedFile, legacyScripts, notFound } from '../../web/static-policy.js';
const defaultWebRoot = fileURLToPath(new URL('../../web/dist/', import.meta.url));
export function createApp({ webRoot = defaultWebRoot, devReads = false, database } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: { 'upgrade-insecure-requests': null } } }));
  app.use((req, res, next) => publicPath(req.url) === null ? notFound(res) : next());
  app.use('/api', express.json({ limit: '100kb' }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'zephyrus-relay-api' }));
  app.use('/api', developmentReads({ enabled: devReads, database }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((req, res, next) => {
    const file = publicPath(req.url);
    const allowed = file === 'index.html' || legacyScripts.includes(file) || /^assets\/[\w.-]+\.(js|css)$/.test(file);
    if (!['GET', 'HEAD'].includes(req.method) || !allowed || !containedFile(webRoot, file)) return notFound(res);
    res.sendFile(file, { root: webRoot }, error => { if (error) next(error); });
  });
  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status === 400 ? 400 : error.status === 413 ? 413 : 500;
    if (status === 500) console.error(error);
    res.status(status).json({ error: status === 400 ? 'Invalid JSON' : status === 413 ? 'Request body too large' : 'Internal server error' });
  });
  return app;
}
