import { z } from 'zod';
import { getDatabase } from './db.js';
import { orderingWindow } from '../../../packages/domain/src/orders.js';

// Adapt explicit startup configuration to the existing orderClock dependency.
// No request input is involved; ordinary startup keeps the real server clock.
export async function configuredOrderClock({ env = process.env, database = getDatabase } = {}) {
  if (env.RELAY_DEMO_ORDER_NOW === undefined) return undefined;
  if (env.NODE_ENV === 'production') throw new Error('RELAY_DEMO_ORDER_NOW is forbidden in production');
  const timestamp = z.iso.datetime({ offset: true }).parse(env.RELAY_DEMO_ORDER_NOW);
  const instant = new Date(timestamp);
  const { today } = orderingWindow(instant);
  const day = await database().calendarDay.findUnique({ where: { date: new Date(`${today}T00:00:00Z`) }, select: { source: true } });
  if (day?.source !== 'SUPPLIED') throw new Error('Demo business date must exist in the supplied CalendarDay data');
  return () => new Date(instant.getTime());
}
