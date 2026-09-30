# Relay data model — Stage 2

The source of truth is `prisma/schema.prisma` plus the SQL check constraints in `prisma/migrations/20261001000200_domain_checks/migration.sql`. This is the persisted domain foundation; the current UI still uses its original localStorage prototype state.

## Network and planning

```mermaid
erDiagram
    Depot ||--o{ Outlet : serves
    Depot ||--o{ Vehicle : homes
    Depot ||--o{ Trip : dispatches
    Outlet |o--o{ User : scopes
    Outlet ||--o{ Order : receives
    User |o--o{ Order : creates
    User |o--o{ Trip : drives
    Vehicle ||--o{ Trip : operates
    Order ||--o{ OrderItem : contains
    Order ||--o| Allocation : has
    Order ||--o{ Deferral : records
    User |o--o{ Deferral : records
    Trip ||--o{ TripStop : visits
    Outlet ||--o{ TripStop : hosts
    Trip ||--o{ Allocation : groups
    TripStop ||--o{ Allocation : delivers
    Depot {
        string id PK
        string name UK
        enum source
    }
    Outlet {
        string id PK
        string depotId FK
        enum brand
        string district
        enum dockType
        enum parkingConstraint
        string mallWindow
        string windowOpenTime
        string windowCloseTime
    }
    Vehicle {
        string id PK
        string depotId FK
        enum type
        enum temperature
        decimal weightCapacityKg
        decimal volumeCapacityM3
        enum fuelType
        decimal kmPerLitre
        decimal weeklyFuelQuotaL
    }
    User {
        string id PK
        string email UK
        enum role
        string outletId FK "Nullable"
    }
    Order {
        string id PK
        string orderNumber UK
        string outletId FK
        date deliveryDate
        enum status
        enum temperatureRequirement
        enum source
    }
    OrderItem {
        string id PK
        string orderId FK
        int lineNumber "Unique within order"
        int cartons
        decimal unitWeightKg
        decimal unitVolumeM3
    }
    Trip {
        string id PK
        string tripNumber UK
        string vehicleId FK
        string depotId FK
        string driverId FK "Nullable"
        date deliveryDate
        int sequence
        enum status
    }
    TripStop {
        string id PK
        string tripId FK
        string outletId FK
        int position "Unique within trip"
        enum status
    }
    Allocation {
        string id PK
        string orderId FK, UK
        string outletId FK
        string tripId FK
        string tripStopId FK
    }
    Deferral {
        string id PK
        string orderId FK
        enum reason
        string explanation
        string impact
        date nextEligibleDate
    }
    CalendarDay {
        date date PK
        int dayOfWeek
        int isoYear
        int isoWeek
        bool isWeekend
        bool isOperating
        string festival
        decimal festivalRamp
    }
```

`CalendarDay` intentionally has no date foreign keys: future orders may be scheduled beyond an imported calendar. The seed explicitly requires its demonstration date to be an operating day in the supplied calendar. Depot names are derived from the union of referenced supplied depot names and checked for agreement between the two network files; no depot locations or coordinates are invented.

## Loading, delivery, receipt and future audit

```mermaid
erDiagram
    Allocation ||--o| LoadingCheck : checks
    Allocation ||--o{ LoadingIssue : reports
    Allocation ||--o{ DeliveryEvent : records
    Allocation ||--o{ DeliveryException : encounters
    Allocation ||--o| ProofOfDelivery : proves
    ProofOfDelivery ||--o| ReceiptConfirmation : confirms
    User |o--o{ LoadingCheck : checks
    User |o--o{ LoadingIssue : reports
    User |o--o{ DeliveryEvent : records
    User |o--o{ DeliveryException : reports
    User ||--o{ ProofOfDelivery : delivers
    User ||--o{ ReceiptConfirmation : confirms
    User ||--o{ SyncMutation : submits
    LoadingCheck {
        string id PK
        string allocationId FK, UK
        enum status
        int loadedCartons
        datetime checkedAt
    }
    LoadingIssue {
        string id PK
        string allocationId FK
        enum type
        enum status
        string details
        string resolution
    }
    DeliveryEvent {
        string id PK
        string allocationId FK
        enum type
        datetime occurredAt
        datetime recordedAt
    }
    DeliveryException {
        string id PK
        string allocationId FK
        enum type
        enum status
        string details
        string resolution
    }
    ProofOfDelivery {
        string id PK
        string allocationId FK, UK
        string driverId FK
        string recipient
        int deliveredCartons
        bool verified
        datetime deliveredAt
    }
    ReceiptConfirmation {
        string id PK
        string proofId FK, UK
        string confirmedById FK
        int receivedCartons
        datetime confirmedAt
    }
    SyncMutation {
        string id PK
        string actorId FK
        string deviceId
        string clientMutationId
        string entityType
        string entityId
        int baseVersion
        json payload
        enum status
    }
```

Diagrams show actual foreign-key cardinality. An order can currently exist without items at the database level; a later order-creation service must enforce at least one item atomically. The audit target `(entityType, entityId)` is polymorphic metadata, not a foreign key or functioning sync engine.

## Identity and invariants

- Orders have independent IDs and unique order numbers. `(outletId, deliveryDate)` is indexed, **not unique**; the seed contains multiple Fresh orders for one outlet/day.
- Trip `(vehicleId, deliveryDate, sequence)` and stop `(tripId, position)` are unique. A stop can deliver multiple orders for its outlet.
- An allocation is the current assignment for one order. Composite foreign keys ensure its order and stop share the same outlet, and its stop belongs to its trip. Later allocation services must handle reassignment/history without rewriting completed delivery evidence.
- Proof and receipt are separate, optional one-to-one records. Deferrals, issues, exceptions and events preserve multiple records. Foreign keys use `RESTRICT` deletion so deleting a parent cannot silently remove delivery evidence.
- Decimal quantities retain capacities and fuel values without floating-point rounding. SQL checks reject nonpositive capacities/items, invalid daily windows, invalid stop/trip positions and negative sync versions. Complete POD quantity verification, role authorization, vehicle/depot compatibility, trip date matching, route feasibility and state transitions are later service responsibilities, not claims made by this schema.
- All event/audit timestamps use PostgreSQL `timestamptz(6)`. Delivery dates use `date`; `HH:mm` windows are local operational times in `Asia/Colombo`. No overnight window is inferred from supplied data. Seed instants include an explicit `+05:30` offset.
- `SUPPLIED` identifies official network/calendar records, `DEMO` identifies Relay-created transactions/users and `APPLICATION` is the future operational default. Demo users have no passwords or authentication mechanism.

## Status vocabulary

| Entity | Values |
| --- | --- |
| Order | `CONFIRMED`, `PLANNED`, `DEFERRED`, `RELEASED`, `IN_DELIVERY`, `DELIVERED`, `RECEIVED`, `CANCELLED` |
| Trip | `DRAFT`, `RELEASED`, `LOADING`, `READY`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED` |
| Stop | `PENDING`, `ARRIVED`, `COMPLETED`, `DEFERRED` |
| Loading check | `PENDING`, `LOADED`, `ISSUE` |
| Issue/exception | `OPEN`, `RESOLVED` |
| Sync mutation | `PENDING`, `APPLIED`, `REJECTED`, `CONFLICT` |

JavaScript constants are centralized in `packages/domain/src/index.js`; tests enforce exact agreement with all Prisma enums. Existing prototype UI labels are deliberately unchanged. `CONFIRMED` corresponds to a submitted order awaiting planning; `IN_DELIVERY` corresponds to the current UI's “In transit”; `RECEIVED` records the Store confirmation after delivery. This stage does not enforce or expose status-transition APIs.
