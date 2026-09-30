import { createDatabase } from '../apps/api/src/db.js';
import { seedNetwork } from './seed-network.js';
let db;
try {
  db = createDatabase();
  console.log(JSON.stringify(await seedNetwork(db), null, 2));
} catch (error) {
  // Prisma errors can include SQL/parameters. Do not print them or connection URLs.
  console.error(error.name === 'Error' && !error.code ? error.message : 'Database seed failed; verify configuration, migrations and dataset validation.');
  process.exitCode = 1;
} finally { await db?.$disconnect(); }
