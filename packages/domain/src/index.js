// Canonical role identifiers shared by the API and domain services.
export const Roles = Object.freeze({
  DISPATCHER: 'DISPATCHER', LOADER: 'LOADER', DRIVER: 'DRIVER', STORE_MANAGER: 'STORE_MANAGER'
});

const enumeration = values => Object.freeze(Object.fromEntries(values.map(value => [value, value])));
export const OrderStatus = enumeration(['CONFIRMED', 'PLANNED', 'DEFERRED', 'RELEASED', 'IN_DELIVERY', 'DELIVERED', 'RECEIVED', 'CANCELLED']);
export const TripStatus = enumeration(['DRAFT', 'RELEASED', 'LOADING', 'READY', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']);
export const RecordSource = enumeration(['SUPPLIED', 'DEMO', 'APPLICATION']);
export const Brand = enumeration(['FRESH', 'STYLE', 'TECH']);
export const VehicleType = enumeration(['VAN', 'TRUCK']);
export const TemperatureCapability = enumeration(['AMBIENT', 'REEFER']);
export const TemperatureRequirement = enumeration(['AMBIENT', 'CHILLED']);
export const FuelType = enumeration(['DIESEL']);
export const DockType = enumeration(['STREET', 'REAR_DOCK', 'MALL_BAY']);
export const ParkingConstraint = enumeration(['NORMAL', 'VAN_ONLY', 'MALL_DOCK']);
export const StopStatus = enumeration(['PENDING', 'ARRIVED', 'COMPLETED', 'DEFERRED']);
export const LoadingStatus = enumeration(['PENDING', 'LOADED', 'ISSUE']);
export const IssueStatus = enumeration(['OPEN', 'RESOLVED']);
export const LoadingIssueType = enumeration(['MISSING', 'DAMAGED', 'QUANTITY_MISMATCH', 'OTHER']);
export const DeliveryEventType = enumeration(['STARTED', 'ARRIVED', 'DEFERRED', 'REATTEMPTED', 'DELIVERED']);
export const DeliveryExceptionType = enumeration(['STORE_CLOSED', 'RECIPIENT_UNAVAILABLE', 'DAMAGED_GOODS', 'PARTIAL_DELIVERY', 'REFUSED', 'ACCESS_DELAYED']);
export const DeferralReason = enumeration(['CAPACITY', 'TEMPERATURE', 'ACCESS', 'DELIVERY_WINDOW', 'FUEL', 'TIME_BUDGET', 'OTHER']);
export const SyncStatus = enumeration(['PENDING', 'APPLIED', 'REJECTED', 'CONFLICT']);
export { validateTrip, allocateOrders, prioritizeOrders, PLANNING_POLICY } from './planning.js';
