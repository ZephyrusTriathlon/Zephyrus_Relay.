import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getDatabase } from '../db.js';
import { orderInput, orderDateError, orderingWindow } from '../../../../packages/domain/src/orders.js';

const include = {
  outlet: true, items: { orderBy: { lineNumber: 'asc' } },
  history: { orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }] },
  deferrals: { orderBy: { deferredAt: 'desc' } },
  allocation: { select: { allocatedAt: true, trip: { select: { tripNumber: true, deliveryDate: true, status: true, vehicleId: true, plannedDepartureAt: true } }, tripStop: { select: { expectedAt: true, status: true } } } }
};
function serialize(order) {
  const items = order.items.map(({ cartons, unitWeightKg, unitVolumeM3, ...item }) => ({ ...item, units: cartons, unitWeightKg: Number(unitWeightKg), unitVolumeM3: Number(unitVolumeM3) }));
  return { ...order, brand: order.outlet.brand, deliveryDate: order.deliveryDate.toISOString().slice(0, 10), items,
    units: items.reduce((n, i) => n + i.units, 0),
    weightKg: Math.round(items.reduce((n, i) => n + i.units * i.unitWeightKg, 0) * 1000) / 1000,
    volumeM3: Math.round(items.reduce((n, i) => n + i.units * i.unitVolumeM3, 0) * 1000) / 1000 };
}
export function orderRoutes({ database = getDatabase, orderClock = () => new Date() } = {}) {
  const router = Router();
  router.use((req, res, next) => {
    if (!req.user) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } });
    if (req.user.role !== 'STORE_MANAGER' || !req.user.outletId) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'An assigned Store Manager account is required.' } });
    next();
  });
  router.get('/context', async (req, res) => {
    const outlet = await database().outlet.findUnique({ where: { id: req.user.outletId }, include: { depot: true } });
    const ordering = orderingWindow(orderClock());
    const nextOperatingDay = await database().calendarDay.findFirst({
      where: { date: { gte: new Date(`${ordering.earliestDeliveryDate}T00:00:00Z`) }, isOperating: true },
      orderBy: { date: 'asc' }, select: { date: true }
    });
    ordering.earliestDeliveryDate = nextOperatingDay?.date.toISOString().slice(0, 10) ?? null;
    res.json({ outlet, ordering });
  });
  router.post('/', async (req, res) => {
    const parsed = orderInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_PAYLOAD', message: 'Invalid order payload', details: parsed.error.issues } });
    const input = parsed.data;
    if (input.outletId && input.outletId !== req.user.outletId) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You can only order for your assigned outlet.' } });
    const outlet = await database().outlet.findUnique({ where: { id: req.user.outletId } });
    if (!outlet) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Outlet assignment is unavailable.' } });
    const deliveryDate = new Date(`${input.deliveryDate}T00:00:00Z`);
    const calendarDay = await database().calendarDay.findUnique({ where: { date: deliveryDate }, select: { isOperating: true } });
    const now = orderClock();
    const error = orderDateError(input.deliveryDate, now);
    if (error) return res.status(error.code === 'ORDER_CUTOFF' ? 409 : 400).json({ error });
    if (!calendarDay?.isOperating) return res.status(400).json({ error: {
      code: 'INVALID_DELIVERY_DATE',
      message: calendarDay ? 'Delivery date is not an operating date in the shared calendar.' : 'Delivery date is not covered by the shared calendar.'
    } });
    const order = await database().order.create({ data: {
      orderNumber: `ORD-${randomUUID()}`, outletId: outlet.id, createdById: req.user.id,
      deliveryDate, temperatureRequirement: input.temperatureRequirement,
      windowOpenTime: outlet.windowOpenTime, windowCloseTime: outlet.windowCloseTime, createdAt: now,
      items: { create: input.items.map(({ units, ...item }, index) => ({ ...item, cartons: units, lineNumber: index + 1, temperatureRequirement: input.temperatureRequirement })) }
    }, include });
    res.status(201).location(`/api/orders/${order.id}`).json({ order: serialize(order) });
  });
  router.get('/', async (req, res) => {
    const parsed = z.strictObject({ limit: z.coerce.number().int().min(1).max(100).default(20), offset: z.coerce.number().int().min(0).max(1000000).default(0), outletId: z.string().optional() }).safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_QUERY', message: 'Invalid pagination or query fields' } });
    if (parsed.data.outletId && parsed.data.outletId !== req.user.outletId) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You can only list your assigned outlet.' } });
    const { limit, offset } = parsed.data;
    const where = { outletId: req.user.outletId };
    const [orders, total] = await database().$transaction([
      database().order.findMany({ where, include, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit, skip: offset }),
      database().order.count({ where })
    ]);
    res.json({ orders: orders.map(serialize), total, limit, offset });
  });
  router.get(['/:id', '/:id/history'], async (req, res) => {
    const order = await database().order.findFirst({ where: { id: req.params.id, outletId: req.user.outletId }, include });
    if (!order) return res.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'Order not found' } });
    res.json(req.path.endsWith('/history') ? { orderId: order.id, status: order.status, history: order.history, deferrals: order.deferrals, allocation: order.allocation } : { order: serialize(order) });
  });
  return router;
}
