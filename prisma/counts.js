import { createDatabase } from '../apps/api/src/db.js';
import { counts } from './seed-network.js';
let db;
try {
  db = createDatabase();
  console.log(JSON.stringify(await counts(db), null, 2));
} catch {
  console.error('Unable to read database counts; check DATABASE_URL and migrations.');
  process.exitCode = 1;
} finally { await db?.$disconnect(); }
