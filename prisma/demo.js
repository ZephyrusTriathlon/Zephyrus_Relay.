import { Roles, RecordSource, OrderStatus, TripStatus, TemperatureRequirement, TemperatureCapability, VehicleType, ParkingConstraint, Brand, DeferralReason, LoadingStatus } from '../packages/domain/src/index.js';

export const DEMO_DATE = '2025-01-02';
export function makeDemo(network) {
  if (!network.calendar.some(day => day.date.toISOString().slice(0, 10) === DEMO_DATE && day.isOperating)) throw new Error('Demo day must be present and operating in supplied calendar');
  const primary = network.outlets.find(outlet => outlet.brand === Brand.FRESH && outlet.district === 'Colombo' && outlet.parkingConstraint === ParkingConstraint.NORMAL);
  const vehicle = network.vehicles.find(item => item.depotId === primary?.depotId && item.type === VehicleType.TRUCK && item.temperature === TemperatureCapability.REEFER);
  const secondary = network.outlets.find(outlet => outlet.id !== primary?.id && outlet.depotId === primary?.depotId && outlet.brand === Brand.FRESH && outlet.parkingConstraint === ParkingConstraint.NORMAL);
  const constrained = network.outlets.find(outlet => outlet.depotId === primary?.depotId && outlet.brand === Brand.FRESH && outlet.parkingConstraint === ParkingConstraint.VAN_ONLY);
  if (!primary || !secondary || !vehicle || !constrained) throw new Error('Supplied network cannot support the demonstration scenarios');
  const deliveryDate = new Date(`${DEMO_DATE}T00:00:00Z`);
  const createdAt = new Date('2025-01-01T10:00:00+05:30');
  const source = RecordSource.DEMO;
  const users = Object.entries(Roles).map(([name, role]) => ({
    id: `demo-user-${name.toLowerCase()}`, email: `${name.toLowerCase()}@relay.demo`, displayName: `Relay demo ${name.toLowerCase().replace('_', ' ')}`,
    role, source, ...(role === Roles.STORE_MANAGER ? { outletId: primary.id } : {}), createdAt, updatedAt: createdAt
  }));
  const specs = [
    ['chilled', primary, 12, TemperatureRequirement.CHILLED, OrderStatus.PLANNED, 'Chilled replenishment on a reefer truck'],
    ['ambient', primary, 8, TemperatureRequirement.AMBIENT, OrderStatus.PLANNED, 'Second Fresh order for the same outlet and delivery day'],
    ['second-stop', secondary, 10, TemperatureRequirement.AMBIENT, OrderStatus.PLANNED, 'Second stop supports reverse loading demonstration'],
    ['van-only', constrained, 8, TemperatureRequirement.AMBIENT, OrderStatus.CONFIRMED, 'Van-only access: do not allocate to the demonstration truck'],
    ['capacity', primary, Math.floor(Math.max(...network.vehicles.map(item => Number(item.weightCapacityKg))) / 13) + 1, TemperatureRequirement.AMBIENT, OrderStatus.DEFERRED, 'Oversized request exceeds every supplied vehicle weight capacity; dispatcher must defer or reconcile it']
  ];
  const orders = specs.map(([key, outlet, cartons, temperatureRequirement, status, demoScenario]) => ({
    id: `demo-order-${key}`, orderNumber: `DEMO-${DEMO_DATE}-${key.toUpperCase()}`, outletId: outlet.id,
    deliveryDate, status, temperatureRequirement, windowOpenTime: outlet.windowOpenTime, windowCloseTime: outlet.windowCloseTime,
    createdById: outlet.id === primary.id ? 'demo-user-store_manager' : null, source, demoScenario, createdAt, updatedAt: createdAt,
    item: { id: `demo-item-${key}`, lineNumber: 1, productCode: temperatureRequirement === TemperatureRequirement.CHILLED ? 'DEMO-CHILLED' : 'DEMO-AMBIENT',
      description: temperatureRequirement === TemperatureRequirement.CHILLED ? 'Relay demo chilled cartons' : 'Relay demo ambient cartons', cartons,
      unitWeightKg: '13', unitVolumeM3: '0.032', temperatureRequirement }
  }));
  const planned = orders.filter(order => order.status === OrderStatus.PLANNED);
  if (planned.reduce((sum, order) => sum + order.item.cartons * 13, 0) > Number(vehicle.weightCapacityKg) || planned.reduce((sum, order) => sum + order.item.cartons * 0.032, 0) > Number(vehicle.volumeCapacityM3)) throw new Error('Demonstration load exceeds selected vehicle capacity');
  return {
    users, orders,
    trip: { id: 'demo-trip-01', tripNumber: `DEMO-${DEMO_DATE}-01`, deliveryDate, sequence: 1, depotId: vehicle.depotId, vehicleId: vehicle.id,
      driverId: 'demo-user-driver', status: TripStatus.DRAFT, source, plannedDepartureAt: new Date(`${DEMO_DATE}T04:45:00+05:30`), createdAt, updatedAt: createdAt },
    stops: [primary, secondary].map((outlet, index) => ({ id: `demo-stop-${index + 1}`, tripId: 'demo-trip-01', outletId: outlet.id, position: index + 1 })),
    allocations: planned.map(order => ({ id: `demo-allocation-${order.id.slice(11)}`, orderId: order.id, outletId: order.outletId, tripId: 'demo-trip-01',
      tripStopId: order.outletId === primary.id ? 'demo-stop-1' : 'demo-stop-2', allocatedAt: createdAt })),
    deferral: { id: 'demo-deferral-capacity', orderId: 'demo-order-capacity', reason: DeferralReason.CAPACITY,
      explanation: 'Relay-created example: requested cartons exceed the largest supplied vehicle weight capacity.', impact: 'Requires dispatcher reconciliation before a feasible trip can be released.',
      deferredById: 'demo-user-dispatcher', deferredAt: createdAt, nextEligibleDate: new Date('2025-01-03T00:00:00Z') },
    loadingStatus: LoadingStatus.PENDING, createdAt
  };
}
