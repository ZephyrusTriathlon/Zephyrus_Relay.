import { z } from 'zod';
import { createApp } from './app.js';
import { closeDatabase } from './db.js';
import { configuredOrderClock } from './order-clock.js';
// Health has no payload; validate startup input rather than inventing business APIs.
const config = z.object({
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  RELAY_DEV_READS: z.enum(['true', 'false']).default('false')
}).parse(process.env);
if (config.RELAY_DEV_READS === 'true' && process.env.NODE_ENV === 'production') throw new Error('Development read APIs cannot be enabled in production');
let orderClock;
try { orderClock = await configuredOrderClock(); }
catch (error) { await closeDatabase(); throw error; }
if (orderClock) console.warn(`Ordering clock fixed at ${orderClock().toISOString()} (Asia/Colombo business timezone)`);
const app = createApp({ devReads: config.RELAY_DEV_READS === 'true', orderClock });
if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
const server = app.listen(config.PORT, config.HOST, () => {
  console.log(`Relay API running at http://${config.HOST}:${config.PORT}`);
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(async () => { await app.locals.sessionStore.close(); await closeDatabase(); }));
