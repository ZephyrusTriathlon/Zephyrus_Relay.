import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import bcrypt from 'bcrypt';
import { randomBytes, createHmac } from 'node:crypto';
import { getDatabase } from './db.js';

const safeUser = { id: true, email: true, displayName: true, role: true, outletId: true, depotId: true, active: true };
const cookieName = 'relay.sid';
const developmentSecret = randomBytes(32).toString('hex');
// A valid hash makes unknown-account and wrong-password work comparable.
const dummyHash = await bcrypt.hash(randomBytes(32).toString('hex'), 12);
export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  next();
}
export const requireRole = (...roles) => (req, res, next) => requireAuth(req, res, () => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
  next();
});

// Use these filters in every future operational query, never a client-supplied scope.
export function scopeFor(user) {
  switch (user.role) {
    case 'DISPATCHER': return { orders: {}, trips: {} };
    case 'STORE_MANAGER': return { orders: { outletId: user.outletId ?? '__unassigned__' }, trips: { stops: { some: { outletId: user.outletId ?? '__unassigned__' } } } };
    case 'LOADER': return { trips: { depotId: user.depotId ?? '__unassigned__', status: { in: ['RELEASED', 'LOADING', 'READY'] } } };
    case 'DRIVER': return { trips: { driverId: user.id } };
    default: throw new Error('Unsupported role');
  }
}

export function installAuth(app, { database = getDatabase, sessionStore, sessionSecret = process.env.SESSION_SECRET, production = process.env.NODE_ENV === 'production' } = {}) {
  if (production && (!sessionSecret || sessionSecret.length < 32)) throw new Error('Production requires SESSION_SECRET of at least 32 characters');
  const store = sessionStore ?? new (connectPgSimple(session))({ conObject: { connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 5000 }, errorLog: () => console.error('Session storage unavailable'), tableName: 'Session', createTableIfMissing: false, pruneSessionInterval: false });
  if (process.env.SESSION_COOKIE_SECURE !== undefined && !['true','false'].includes(process.env.SESSION_COOKIE_SECURE)) throw new Error('SESSION_COOKIE_SECURE must be true or false');
  const secure = process.env.SESSION_COOKIE_SECURE === undefined ? production : process.env.SESSION_COOKIE_SECURE === 'true';
  const cookie = { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 8 * 60 * 60 * 1000 };
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  // Same-origin JSON mutations; reject browser cross-origin form/login/logout requests.
  app.use('/api', (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && (req.get('sec-fetch-site') === 'cross-site' || (req.get('origin') && req.get('origin') !== `${req.protocol}://${req.get('host')}`))) return res.status(403).json({ error: 'Forbidden origin' });
    const mutationRoute = /^\/(?:auth\/(?:login|logout)$|orders(?:\/|$)|planning(?:\/|$)|operations(?:\/|$)|sync(?:\/|$))/.test(req.path);
    if (mutationRoute && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !req.is('application/json')) return res.status(415).json({ error: 'JSON content type required' });
    next();
  });
  app.use('/api', session({ name: cookieName, secret: sessionSecret || developmentSecret, store, resave: false, saveUninitialized: false, cookie }));
  app.use('/api', async (req, res, next) => {
    try {
      if (req.session.userId) {
        const user = await database().user.findUnique({ where: { id: req.session.userId }, select: safeUser });
        if (user?.active) req.user = user;
      }
      next();
    } catch { res.status(503).json({ error: 'Authentication unavailable' }); }
  });
  app.post('/api/auth/login', async (req, res, next) => {
    const { identifier, email, password } = req.body ?? {};
    let login = identifier ?? email;
    if (typeof login !== 'string' || typeof password !== 'string' || !login.trim() || !password || Buffer.byteLength(password) > 72 || login.length > 254) return res.status(400).json({ error: 'Valid email and password required' });
    login = login.trim().toLowerCase();
    if (!login.includes('@')) login = `${login}@relay.demo`;
    try {
      const user = await database().user.findUnique({ where: { email: login }, select: { ...safeUser, passwordHash: true } });
      const valid = await bcrypt.compare(password, user?.passwordHash || dummyHash);
      if (!valid || !user?.active || !user.passwordHash) return res.status(401).json({ error: 'Email or password is incorrect.' });
      req.session.regenerate(error => {
        if (error) return next(error);
        req.session.userId = user.id;
        req.session.save(error => error ? next(error) : res.json({ ok: true }));
      });
    } catch { res.status(503).json({ error: 'Authentication unavailable' }); }
  });
  app.post('/api/auth/logout', (req, res, next) => req.session.destroy(error => {
    if (error) return next(error);
    res.clearCookie(cookieName, { httpOnly: true, secure, sameSite: 'lax', path: '/' });
    res.status(204).end();
  }));
  app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: req.user }));
  // Only this authenticated Driver can unlock their encrypted field vault.
  // No credential/session token is persisted in IndexedDB. Keep SESSION_SECRET
  // stable across deployments while unsynchronized field work exists.
  app.get('/api/driver/offline-access',requireRole('DRIVER'),(req,res)=>res.json({userId:req.user.id,key:createHmac('sha256',sessionSecret||developmentSecret).update('relay-field-v1:'+req.user.id).digest('hex')}));
  for (const [path, role] of [['dispatcher', 'DISPATCHER'], ['driver', 'DRIVER'], ['loader', 'LOADER'], ['store', 'STORE_MANAGER']]) {
    app.get(`/api/${path}/scope`, requireRole(role), (req, res) => res.json({ scope: scopeFor(req.user) }));
  }
  return store;
}
