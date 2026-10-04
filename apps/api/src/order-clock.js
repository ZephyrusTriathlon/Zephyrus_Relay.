import { z } from 'zod';
import { getDatabase } from './db.js';
import { orderingWindow } from '../../../packages/domain/src/orders.js';

// Adapt explicit startup configuration to the existing orderClock dependency.
// No request input is involved; ordinary startup keeps the real server clock.
export async function configuredOrderClock({ env = process.env, database = getDatabase } = {}) {
  if (env.RELAY_JUDGE_MODE !== undefined && !['true','false'].includes(env.RELAY_JUDGE_MODE)) throw new Error('RELAY_JUDGE_MODE must be true or false');
  if (env.RELAY_JUDGE_MODE === 'true') {
    if (env.RELAY_DEMO_ORDER_NOW !== undefined) throw new Error('Use only one business-clock mode');
    const timestamp = z.iso.datetime({ offset: true }).parse(env.RELAY_JUDGE_ORDER_NOW || '2025-01-01T15:00:00+05:30');
    const instant = new Date(timestamp), window = orderingWindow(instant), db = database();
    const [day, next, realUsers] = await Promise.all([
      db.calendarDay.findUnique({where:{date:new Date(`${window.today}T00:00:00Z`)}}),
      db.calendarDay.findFirst({where:{date:{gte:new Date(`${window.earliestDeliveryDate}T00:00:00Z`)},isOperating:true}}),
      db.user.count({where:{source:{not:'DEMO'}}})
    ]);
    if (!day || day.source !== 'SUPPLIED' || !next) throw new Error('Judge clock requires supplied calendar coverage and an upcoming operating day');
    if (realUsers) throw new Error('Judge mode is restricted to an isolated database containing only demo accounts');
    const clock = () => new Date(instant.getTime());
    clock.scenario = {mode:'judge',businessDate:window.today,orderingTime:timestamp,message:`Ordering date: ${window.today} (Asia/Colombo). Delivery events use actual time.`};
    return clock;
  }
  if (env.RELAY_DEMO_ORDER_NOW === undefined) return undefined;
  if (env.NODE_ENV === 'production') throw new Error('RELAY_DEMO_ORDER_NOW is forbidden in production');
  const timestamp = z.iso.datetime({ offset: true }).parse(env.RELAY_DEMO_ORDER_NOW);
  const instant = new Date(timestamp);
  const { today } = orderingWindow(instant);
  const day = await database().calendarDay.findUnique({ where: { date: new Date(`${today}T00:00:00Z`) }, select: { source: true } });
  if (day?.source !== 'SUPPLIED') throw new Error('Demo business date must exist in the supplied CalendarDay data');
  return () => new Date(instant.getTime());
}
