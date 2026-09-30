import { z } from 'zod';
import { createApp } from './app.js';
// Health has no payload; validate startup input rather than inventing business APIs.
const config = z.object({
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001)
}).parse(process.env);
const server = createApp().listen(config.PORT, config.HOST, () => {
  console.log(`Relay API running at http://${config.HOST}:${config.PORT}`);
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
