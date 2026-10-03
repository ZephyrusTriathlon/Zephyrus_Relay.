import { spawn } from 'node:child_process';
const run = (args, env = process.env) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, { stdio: 'inherit', env });
  child.once('error', reject);
  child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Bootstrap step failed (${code})`)));
});
try {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET must contain at least 32 random characters');
  await run(['node_modules/prisma/build/index.js', 'migrate', 'deploy']);
  // Explicitly opted-in judge bootstrap; the web server always runs production.
  // Seed is create-once for operations and never resets passwords or progress.
  if (process.env.RELAY_ALLOW_SEED === 'true') await run(['prisma/seed.js'], { ...process.env, NODE_ENV: 'development' });
  const server = spawn(process.execPath, ['apps/api/src/server.js'], { stdio: 'inherit' });
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.kill(signal));
  server.once('error', () => { console.error('Application failed to start'); process.exitCode = 1; });
  server.once('exit', code => { process.exitCode = code ?? 1; });
} catch (error) { console.error(error.message); process.exitCode = 1; }
