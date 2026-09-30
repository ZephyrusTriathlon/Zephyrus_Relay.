import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

export function createDatabase(url = process.env.DATABASE_URL) {
  if (!url) throw new Error('DATABASE_URL is required');
  const parsed = new URL(url);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error('DATABASE_URL must use PostgreSQL');
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, max: 5, connectionTimeoutMillis: 5000 }),
    errorFormat: 'minimal'
  });
}
let database;
export function getDatabase() { return database ??= createDatabase(); }
export async function closeDatabase() { if (database) { await database.$disconnect(); database = undefined; } }
