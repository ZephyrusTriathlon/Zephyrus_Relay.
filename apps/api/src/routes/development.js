import { Router } from 'express';
import { z } from 'zod';
import { getDatabase } from '../db.js';
import { RecordSource } from '@relay/domain';

const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(25),
  offset: z.coerce.number().int().min(0).max(10000).default(0)
}).strict();
const loopback = address => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);

export function developmentReads({ enabled = false, database = getDatabase } = {}) {
  const router = Router();
  router.use((req, res, next) => {
    if (!enabled || process.env.NODE_ENV === 'production' || !loopback(req.socket.remoteAddress)) return res.status(404).json({ error: 'Not found' });
    res.set('Cache-Control', 'no-store');
    next();
  });
  function read(model, select) {
    return async (req, res) => {
      const parsed = pageSchema.safeParse(req.query);
      if (!parsed.success) return res.status(400).json({ error: 'Use limit 1–50 and offset 0–10000; no other query parameters are supported' });
      try {
        const db = database();
        const { limit, offset } = parsed.data;
        const [items, total] = await Promise.all([
          db[model].findMany({ select, orderBy: { id: 'asc' }, take: limit, skip: offset }), db[model].count()
        ]);
        res.json({ items, total, limit, offset });
      } catch { res.status(503).json({ error: 'Database unavailable' }); }
    };
  }
  router.get('/outlets', read('outlet', { id: true, brand: true, district: true, depotId: true, dockType: true, parkingConstraint: true, mallWindow: true, windowOpenTime: true, windowCloseTime: true }));
  router.get('/vehicles', read('vehicle', { id: true, type: true, temperature: true, depotId: true, weightCapacityKg: true, volumeCapacityM3: true, fuelType: true, kmPerLitre: true, weeklyFuelQuotaL: true }));
  router.get('/demo-day', async (req, res) => {
    if (Object.keys(req.query).length) return res.status(400).json({ error: 'No query parameters are supported' });
    try {
      const db = database();
      const where = { source: RecordSource.DEMO };
      const [orders, trips] = await Promise.all([
        db.order.findMany({ where, take: 50, orderBy: { id: 'asc' }, select: { id: true, orderNumber: true, deliveryDate: true, outletId: true, status: true, temperatureRequirement: true, demoScenario: true } }),
        db.trip.findMany({ where, take: 50, orderBy: { id: 'asc' }, select: { id: true, tripNumber: true, deliveryDate: true, vehicleId: true, status: true } })
      ]);
      res.json({ source: RecordSource.DEMO, orders, trips });
    } catch { res.status(503).json({ error: 'Database unavailable' }); }
  });
  return router;
}
