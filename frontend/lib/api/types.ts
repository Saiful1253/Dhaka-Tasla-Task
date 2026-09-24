export type Role = "passenger" | "driver";

export type RideStatus =
  | "REQUESTED"
  | "MATCHED"
  | "DRIVER_ARRIVED"
  | "STARTED"
  | "COMPLETED"
  | "CANCELLED";

export type PoolStatus = RideStatus;

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface AuthSession {
  user: User;
  token: string;
}

export interface Area {
  id: number;
  name: string;
  lat: number;
  lng: number;
}

export interface Fare {
  id: number;
  requestId: number;
  baseTaka: number;
  distanceTaka: number;
  discountTaka: number;
  totalTaka: number;
  distanceKm: number;
}

export interface RidePool {
  id: number;
  vehicleId: number;
  status: PoolStatus;
  capacity: number;
  seatsTaken: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface Ride {
  id: number;
  passengerId: number;
  pickupAreaId: number;
  destAreaId: number;
  seatsRequested: number;
  status: RideStatus;
  createdAt: string;
  pickupArea: Area;
  destArea: Area;
  fare: Fare | null;
  pool: RidePool | null;
}

export interface FareEstimate {
  pickup: string;
  dest: string;
  seats: number;
  poolSize: number;
  currency: "BDT";
  unit: "Taka";
  baseTaka: number;
  distanceTaka: number;
  discountTaka: number;
  totalTaka: number;
  distanceKm: number;
}

/** A privacy-safe snapshot of another passenger's currently requested ride. */
export interface RideActivity {
  activityId: string;
  pickup: string;
  destination: string;
  seats: number;
  createdAt: string;
}

export interface RideActivityResponse {
  activeCount: number;
  requests: RideActivity[];
  refreshedAt: string;
}

export interface DriverVehicle {
  id: number;
  name: string;
  capacity: number;
  isOnline: boolean;
}

export interface DriverRequest {
  id: number;
  passenger: Pick<User, "id" | "name">;
  pickup: string;
  dest: string;
  seats: number;
  status: RideStatus;
  estimatedFareTaka: number | null;
  createdAt: string;
  compatibility: {
    activePoolId: number | null;
    activePoolStatus: PoolStatus | null;
    fitsActivePool: boolean | null;
    addableToActivePool: boolean;
    compatibleRequestIds: number[];
  };
}

export interface RawDriverPool {
  id: number;
  vehicleId: number;
  status: PoolStatus;
  capacity: number;
  seatsTaken: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  vehicle: {
    id: number;
    driverId: number;
    name: string;
    capacity: number;
    plate: string | null;
    isOnline: boolean;
    createdAt: string;
  };
  members: Array<{
    id: number;
    poolId: number;
    requestId: number;
    seats: number;
    fareTaka: number;
    createdAt: string;
    request: {
      id: number;
      passengerId: number;
      pickupAreaId: number;
      destAreaId: number;
      seatsRequested: number;
      status: RideStatus;
      createdAt: string;
      passenger: Pick<User, "id" | "name">;
      pickupArea: Area;
      destArea: Area;
    };
  }>;
  events: Array<{
    id: number;
    poolId: number;
    actorId: number;
    fromStatus: string;
    toStatus: string;
    note: string | null;
    at: string;
  }>;
}

export interface DriverPoolMember {
  requestId: number;
  passenger: Pick<User, "id" | "name">;
  pickup: string;
  dest: string;
  seats: number;
  fareTaka: number;
  status: RideStatus;
}

export interface DriverPool {
  id: number;
  status: PoolStatus;
  capacity: number;
  seatsTaken: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  vehicle: {
    id: number;
    name: string;
    capacity: number;
    plate: string | null;
    isOnline: boolean;
  };
  members: DriverPoolMember[];
  events: RawDriverPool["events"];
}

export interface PassengerPoolMember {
  requestId: number;
  passenger: Pick<User, "id" | "name">;
  pickup: string;
  dest: string;
  seats: number;
  status: RideStatus;
  isMe: boolean;
  myFareTaka: number | null;
  myFare: Fare | null;
}

export interface PassengerPoolDetails {
  id: number;
  status: PoolStatus;
  capacity: number;
  seatsTaken: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  vehicle: string;
  driver: Pick<User, "id" | "name">;
  members: PassengerPoolMember[];
  events: RawDriverPool["events"];
}

export type OpenPoolCapacityState = "available" | "last-seat" | "full";

/** Privacy-safe open-pool discovery data for a passenger's own request. */
export interface OpenPool {
  id: number;
  status: PoolStatus;
  capacity: number;
  seatsTaken: number;
  remainingSeats: number;
  capacityState: OpenPoolCapacityState;
  vehicle: {
    name: string;
    plate: string | null;
  };
  route: {
    pickup: string;
    destination: string;
  } | null;
  memberCount: number;
  compatibleRequestIds: number[];
  joinableRequestIds: number[];
}

export interface OpenPoolsResponse {
  pools: OpenPool[];
  refreshedAt: string;
}

export interface JoinPoolResponse {
  ok: true;
  poolId: number;
  seatsTaken: number;
}

export type ApiErrorEnvelope = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function isTerminalRide(status: RideStatus): boolean {
  return status === "COMPLETED" || status === "CANCELLED";
}

export function isTerminalPool(status: PoolStatus): boolean {
  return status === "COMPLETED" || status === "CANCELLED";
}

export function normalizeDriverPool(pool: RawDriverPool): DriverPool {
  return {
    id: pool.id,
    status: pool.status,
    capacity: pool.capacity,
    seatsTaken: pool.seatsTaken,
    createdAt: pool.createdAt,
    startedAt: pool.startedAt,
    completedAt: pool.completedAt,
    vehicle: {
      id: pool.vehicle.id,
      name: pool.vehicle.name,
      capacity: pool.vehicle.capacity,
      plate: pool.vehicle.plate,
      isOnline: pool.vehicle.isOnline,
    },
    members: pool.members.map((member) => ({
      requestId: member.requestId,
      passenger: member.request.passenger,
      pickup: member.request.pickupArea.name,
      dest: member.request.destArea.name,
      seats: member.seats,
      fareTaka: member.fareTaka,
      status: member.request.status,
    })),
    events: pool.events,
  };
}
