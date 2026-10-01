import { z } from 'zod';

const measurement = z.number().min(0.001).max(999999).refine(n => Math.abs(n * 1000 - Math.round(n * 1000)) < 0.000001, 'Use at most three decimal places');
export const orderInput = z.strictObject({
  outletId: z.string().min(1).max(100).optional(),
  deliveryDate: z.iso.date(),
  temperatureRequirement: z.enum(['AMBIENT', 'CHILLED']),
  items: z.array(z.strictObject({
    productCode: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(200),
    units: z.number().int().positive().max(100000),
    unitWeightKg: measurement,
    unitVolumeM3: measurement
  })).min(1).max(100)
});

// Explicit IANA zone: neither OS timezone nor browser clock controls acceptance.
export function orderingWindow(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).map(p => [p.type, p.value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const tomorrow = new Date(`${today}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const nextDay = tomorrow.toISOString().slice(0, 10);
  const nextDayOpen = Number(parts.hour) < 16;
  if (!nextDayOpen) tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return { today, nextDay, nextDayOpen, earliestDeliveryDate: tomorrow.toISOString().slice(0, 10), cutoff: `${today}T16:00:00+05:30`, timeZone: 'Asia/Colombo' };
}

export function orderDateError(date, now) {
  const window = orderingWindow(now);
  if (date <= window.today) return { code: 'INVALID_DELIVERY_DATE', message: 'Delivery date must be after today in Asia/Colombo.' };
  if (date === window.nextDay && !window.nextDayOpen) return { code: 'ORDER_CUTOFF', message: 'Next-day orders close at 16:00 Asia/Colombo. Choose a later delivery date.' };
  return null;
}
