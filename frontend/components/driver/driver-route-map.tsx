"use client";

import { useId, useMemo } from "react";
import { ArrowRight, MapPinned, Route as RouteIcon } from "lucide-react";

import type {
  DriverPool,
  DriverRequest,
  MapLocation,
} from "@/lib/api/types";

export type DriverRouteState = "selected" | "compatible" | "conflict";

export interface DriverRouteMapProps {
  requests: DriverRequest[];
  selectedIds: ReadonlySet<number>;
  activePool: DriverPool | null;
  driverLocation: MapLocation | null;
  className?: string;
}

interface AreaPoint {
  name: string;
  location: MapLocation;
  label: {
    dx: number;
    dy: number;
    anchor: "start" | "middle" | "end";
  };
}

interface PlottedRoute {
  key: string;
  kind: "waiting" | "active";
  requestId: number;
  passengerName: string;
  pickupName: string;
  destName: string;
  pickup: MapLocation;
  dest: MapLocation;
  state: DriverRouteState;
  order: number;
}

interface LabelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MAP_HEIGHT = 430;
const MAP_BOUNDS = {
  minLat: 23.738,
  maxLat: 23.884,
  minLng: 90.36,
  maxLng: 90.435,
} as const;

/**
 * These are the same predefined area centers used by the API. Keeping the
 * small set here makes the schematic useful even while a client is connected
 * to an older board response that has not received its location fields yet.
 */
const AREA_POINTS: AreaPoint[] = [
  {
    name: "Banani",
    location: { lat: 23.7937, lng: 90.4066 },
    label: { dx: -10, dy: -12, anchor: "end" },
  },
  {
    name: "Gulshan 1",
    location: { lat: 23.7925, lng: 90.4078 },
    label: { dx: 10, dy: -12, anchor: "start" },
  },
  {
    name: "Gulshan 2",
    location: { lat: 23.7936, lng: 90.4155 },
    label: { dx: 10, dy: -10, anchor: "start" },
  },
  {
    name: "Mohakhali",
    location: { lat: 23.7806, lng: 90.4074 },
    label: { dx: 10, dy: 17, anchor: "start" },
  },
  {
    name: "Dhanmondi",
    location: { lat: 23.7461, lng: 90.3742 },
    label: { dx: -10, dy: 18, anchor: "end" },
  },
  {
    name: "Mirpur",
    location: { lat: 23.8069, lng: 90.3687 },
    label: { dx: -10, dy: -11, anchor: "end" },
  },
  {
    name: "Uttara",
    location: { lat: 23.8759, lng: 90.3795 },
    label: { dx: 10, dy: -10, anchor: "start" },
  },
  {
    name: "Farmgate",
    location: { lat: 23.7574, lng: 90.3885 },
    label: { dx: 10, dy: 17, anchor: "start" },
  },
  {
    name: "Bashundhara",
    location: { lat: 23.8223, lng: 90.4265 },
    label: { dx: 10, dy: -10, anchor: "start" },
  },
];

const ROUTE_STYLES: Record<
  DriverRouteState,
  {
    stroke: string;
    labelFill: string;
    labelText: string;
    width: number;
    dash: string;
    opacity: number;
  }
> = {
  selected: {
    stroke: "#C7F36B",
    labelFill: "#C7F36B",
    labelText: "#081A1F",
    width: 3.5,
    dash: "",
    opacity: 1,
  },
  compatible: {
    stroke: "#55DDE0",
    labelFill: "#55DDE0",
    labelText: "#081A1F",
    width: 2.25,
    dash: "",
    opacity: 0.9,
  },
  conflict: {
    stroke: "#F26B5E",
    labelFill: "#F26B5E",
    labelText: "#081A1F",
    width: 2.25,
    dash: "6 5",
    opacity: 0.95,
  },
};

const ROUTE_STATE_LABELS: Record<DriverRouteState, string> = {
  selected: "Selected / active",
  compatible: "Compatible waiting",
  conflict: "Does not fit",
};

function isMapLocation(
  value: MapLocation | null | undefined,
): value is MapLocation {
  return (
    Boolean(value) &&
    Number.isFinite(value?.lat) &&
    Number.isFinite(value?.lng)
  );
}

function resolveLocation(
  location: MapLocation | null | undefined,
  areaName: string,
): MapLocation | null {
  if (isMapLocation(location)) return location;
  return AREA_POINTS.find((area) => area.name === areaName)?.location ?? null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function labelsOverlap(first: LabelBox, second: LabelBox): boolean {
  return !(
    first.x + first.width < second.x ||
    second.x + second.width < first.x ||
    first.y + first.height < second.y ||
    second.y + second.height < first.y
  );
}

function project(location: MapLocation, width: number, height: number) {
  const left = width * 0.08;
  const right = width * 0.04;
  const top = height * 0.1;
  const bottom = height * 0.11;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const xRatio =
    (location.lng - MAP_BOUNDS.minLng) /
    (MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng);
  const yRatio =
    (location.lat - MAP_BOUNDS.minLat) /
    (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat);

  return {
    x: clamp(left + xRatio * plotWidth, left, left + plotWidth),
    y: clamp(top + (1 - yRatio) * plotHeight, top, top + plotHeight),
    left,
    right: left + plotWidth,
    top,
    bottom: top + plotHeight,
  };
}

function waitingRouteState(
  request: DriverRequest,
  requests: DriverRequest[],
  selectedIds: ReadonlySet<number>,
  activePool: DriverPool | null,
): DriverRouteState {
  if (selectedIds.has(request.id)) return "selected";

  if (activePool) {
    if (activePool.status !== "MATCHED") return "conflict";

    const remainingSeats = Math.max(
      0,
      activePool.capacity - activePool.seatsTaken,
    );
    const isCurrentPool =
      request.compatibility.activePoolId === activePool.id;
    const fitsPool = request.compatibility.fitsActivePool === true;
    const hasRoom = request.seats <= remainingSeats;

    return isCurrentPool && fitsPool && hasRoom ? "compatible" : "conflict";
  }

  if (selectedIds.size === 0) {
    if (requests.length <= 1) return "compatible";
    const hasCompatiblePeer = requests.some(
      (other) =>
        other.id !== request.id &&
        other.compatibility.compatibleRequestIds.includes(request.id),
    );
    return hasCompatiblePeer ? "compatible" : "conflict";
  }

  const selectedRequests = requests.filter((item) => selectedIds.has(item.id));
  const breaksPairing = selectedRequests.some(
    (selected) =>
      !selected.compatibility.compatibleRequestIds.includes(request.id) ||
      !request.compatibility.compatibleRequestIds.includes(selected.id),
  );

  return breaksPairing ? "conflict" : "compatible";
}

function makeWaitingRoute(
  request: DriverRequest,
  order: number,
  requests: DriverRequest[],
  selectedIds: ReadonlySet<number>,
  activePool: DriverPool | null,
): PlottedRoute | null {
  const pickup = resolveLocation(request.pickupLocation, request.pickup);
  const dest = resolveLocation(request.destLocation, request.dest);
  if (!pickup || !dest) return null;

  return {
    key: `waiting:${request.id}`,
    kind: "waiting",
    requestId: request.id,
    passengerName: request.passenger.name,
    pickupName: request.pickup,
    destName: request.dest,
    pickup,
    dest,
    state: waitingRouteState(request, requests, selectedIds, activePool),
    order,
  };
}

function makeActiveRoute(
  member: DriverPool["members"][number],
  order: number,
): PlottedRoute | null {
  const pickup = resolveLocation(member.pickupLocation, member.pickup);
  const dest = resolveLocation(member.destLocation, member.dest);
  if (!pickup || !dest) return null;

  return {
    key: `active:${member.requestId}`,
    kind: "active",
    requestId: member.requestId,
    passengerName: member.passenger.name,
    pickupName: member.pickup,
    destName: member.dest,
    pickup,
    dest,
    state: "selected",
    order,
  };
}

function routeDescription(route: PlottedRoute): string {
  const prefix = route.kind === "active" ? "Active pool" : "Waiting request";
  return `${prefix} ${route.requestId}, ${route.passengerName}: ${route.pickupName} to ${route.destName}. ${ROUTE_STATE_LABELS[route.state]}.`;
}

export function DriverRouteMap({
  requests,
  selectedIds,
  activePool,
  driverLocation,
  className = "",
}: DriverRouteMapProps) {
  const rawId = useId();
  const id = rawId.replace(/:/g, "");
  const waitingRoutes = useMemo(
    () =>
      requests
        .map((request, index) =>
          makeWaitingRoute(
            request,
            index,
            requests,
            selectedIds,
            activePool,
          ),
        )
        .filter((route): route is PlottedRoute => route !== null),
    [activePool, requests, selectedIds],
  );
  const activeRoutes = useMemo(
    () =>
      (activePool?.members ?? [])
        .map((member, index) => makeActiveRoute(member, index))
        .filter((route): route is PlottedRoute => route !== null),
    [activePool],
  );
  const routes = [...waitingRoutes, ...activeRoutes];
  const unlocatedWaitingCount = requests.length - waitingRoutes.length;
  const unlocatedActiveCount =
    (activePool?.members.length ?? 0) - activeRoutes.length;
  const unlocatedRouteCount = unlocatedWaitingCount + unlocatedActiveCount;
  const hasRoutes = routes.length > 0;
  const canvasHeight = MAP_HEIGHT;
  const emptyStateTitle =
    unlocatedRouteCount > 0
      ? "ROUTE CENTERS PENDING"
      : activePool
        ? "WAITING QUEUE CLEAR"
        : "QUEUE CLEAR";
  const emptyStateMessage =
    unlocatedRouteCount > 0
      ? "Route coordinates are not available yet"
      : "Area centers remain available for dispatch";

  const mapDescription = `${driverLocation ? "Driver GPS location is plotted. " : "Driver GPS location is not shared. "}${
    hasRoutes
      ? `${routes.length} route${routes.length === 1 ? "" : "s"} plotted across ${AREA_POINTS.length} predefined Dhaka area centers. Arrows point from pickup to destination.`
      : unlocatedRouteCount > 0
        ? "Schematic map of the predefined Dhaka area centers. Route coordinates are pending."
        : "Schematic map of the predefined Dhaka area centers. The waiting queue is clear."
  }`;

  function renderCanvas(
    width: number,
    height: number,
    prefix: string,
    classNameForCanvas: string,
  ) {
    const canvas = project(AREA_POINTS[0].location, width, height);
    const gridSize = Math.round(width / 14);
    const compact = width < 700;
    const routeLabelOffset = compact ? 9 : 11;
    const routeLabelHeight = compact ? 16 : 18;
    const routeLabelFontSize = compact ? 8 : 9;
    const nodeRadius = compact ? 3.3 : 4;
    const areaLabelFontSize = compact ? 8.5 : 10;
    const labelScale = compact ? 0.82 : 1;
    const placedLabels: LabelBox[] = [];
    const driverPoint = driverLocation
      ? project(driverLocation, width, height)
      : null;

    function placeRouteLabel(
      preferredX: number,
      preferredY: number,
      width: number,
      height: number,
    ) {
      const horizontalOffset = width + (compact ? 10 : 14);
      const verticalOffset = height + (compact ? 7 : 10);
      const candidates = [
        { x: preferredX, y: preferredY },
        { x: preferredX + horizontalOffset, y: preferredY },
        { x: preferredX - horizontalOffset, y: preferredY },
        { x: preferredX, y: preferredY - verticalOffset },
        { x: preferredX, y: preferredY + verticalOffset },
        { x: preferredX + horizontalOffset, y: preferredY - verticalOffset },
        { x: preferredX - horizontalOffset, y: preferredY + verticalOffset },
        { x: preferredX + horizontalOffset, y: preferredY + verticalOffset },
        { x: preferredX - horizontalOffset, y: preferredY - verticalOffset },
      ].map((candidate) => ({
        x: clamp(candidate.x, canvas.left + 3, canvas.right - width - 3),
        y: clamp(candidate.y, canvas.top + 3, canvas.bottom - height - 3),
      }));
      const selected =
        candidates.find(
          (candidate) =>
            !placedLabels.some((placed) =>
              labelsOverlap({ ...candidate, width, height }, placed),
            ),
        ) ?? candidates[0];
      placedLabels.push({ ...selected, width, height });
      return selected;
    }

    return (
      <svg
        className={classNameForCanvas}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-labelledby={`${prefix}-title ${prefix}-description`}
        focusable="false"
      >
        <title id={`${prefix}-title`}>Driver route signal map</title>
        <desc id={`${prefix}-description`}>{mapDescription}</desc>
        <defs>
          <pattern
            id={`${prefix}-grid`}
            width={gridSize}
            height={gridSize}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`}
              fill="none"
              stroke="#55DDE0"
              strokeOpacity="0.16"
              strokeWidth="1"
            />
          </pattern>
          {(
            ["selected", "compatible", "conflict"] as DriverRouteState[]
          ).map((state) => {
            const style = ROUTE_STYLES[state];
            return (
              <marker
                key={state}
                id={`${prefix}-${state}-arrow`}
                markerWidth="9"
                markerHeight="9"
                refX="8"
                refY="4.5"
                orient="auto"
                markerUnits="userSpaceOnUse"
              >
                <path
                  d="M 0 0 L 9 4.5 L 0 9 z"
                  fill={style.stroke}
                />
              </marker>
            );
          })}
        </defs>

        <rect x="0" y="0" width={width} height={height} fill="#081A1F" />
        <rect
          x={canvas.left}
          y={canvas.top}
          width={canvas.right - canvas.left}
          height={canvas.bottom - canvas.top}
          fill={`url(#${prefix}-grid)`}
        />
        <rect
          x={canvas.left}
          y={canvas.top}
          width={canvas.right - canvas.left}
          height={canvas.bottom - canvas.top}
          fill="none"
          stroke="#55DDE0"
          strokeOpacity="0.3"
          strokeWidth="1"
        />
        <line
          x1={canvas.left}
          y1={(canvas.top + canvas.bottom) / 2}
          x2={canvas.right}
          y2={(canvas.top + canvas.bottom) / 2}
          stroke="#55DDE0"
          strokeOpacity="0.12"
          strokeDasharray="2 8"
        />
        <line
          x1={(canvas.left + canvas.right) / 2}
          y1={canvas.top}
          x2={(canvas.left + canvas.right) / 2}
          y2={canvas.bottom}
          stroke="#55DDE0"
          strokeOpacity="0.12"
          strokeDasharray="2 8"
        />

        <text
          x={canvas.left}
          y={Math.max(16, canvas.top - 18)}
          fill="#55DDE0"
          fillOpacity="0.75"
          fontFamily="IBM Plex Mono, monospace"
          fontSize={compact ? 8 : 9}
          fontWeight="600"
          letterSpacing="1.5"
        >
          DHAKA / AREA CENTERS
        </text>
        <text
          x={canvas.right}
          y={Math.max(16, canvas.top - 18)}
          textAnchor="end"
          fill="#55DDE0"
          fillOpacity="0.55"
          fontFamily="IBM Plex Mono, monospace"
          fontSize={compact ? 8 : 9}
          letterSpacing="1.2"
        >
          N ↑ · SCHEMATIC / NOT TO SCALE
        </text>

        <g aria-hidden="true">
          {AREA_POINTS.map((area) => {
            const point = project(area.location, width, height);
            return (
              <g key={area.name}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={nodeRadius + 1.5}
                  fill="#081A1F"
                  stroke="#55DDE0"
                  strokeOpacity="0.38"
                  strokeDasharray="1.5 2.5"
                />
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={nodeRadius - 1.5}
                  fill="#55DDE0"
                  fillOpacity="0.7"
                />
                <text
                  x={point.x + area.label.dx * labelScale}
                  y={point.y + area.label.dy}
                  textAnchor={area.label.anchor}
                  fill="#B9D2CF"
                  fontFamily="IBM Plex Mono, monospace"
                  fontSize={areaLabelFontSize}
                  fontWeight="500"
                  letterSpacing="0.2"
                >
                  {area.name}
                </text>
              </g>
            );
          })}
        </g>

        {driverPoint ? (
          <g aria-label="Driver live GPS location" data-driver-location="true">
            <title>Driver live GPS location</title>
            <circle
              cx={driverPoint.x}
              cy={driverPoint.y}
              r={nodeRadius + 6}
              fill="none"
              stroke="#C7F36B"
              strokeOpacity="0.35"
              strokeWidth="1.5"
              strokeDasharray="2 3"
            />
            <circle
              cx={driverPoint.x}
              cy={driverPoint.y}
              r={nodeRadius + 1}
              fill="#081A1F"
              stroke="#C7F36B"
              strokeWidth="2"
            />
            <circle
              cx={driverPoint.x}
              cy={driverPoint.y}
              r={nodeRadius - 1.5}
              fill="#C7F36B"
            />
            <path
              d={`M ${driverPoint.x - nodeRadius - 3} ${driverPoint.y} H ${driverPoint.x + nodeRadius + 3} M ${driverPoint.x} ${driverPoint.y - nodeRadius - 3} V ${driverPoint.y + nodeRadius + 3}`}
              stroke="#C7F36B"
              strokeWidth="1"
              strokeOpacity="0.8"
            />
            <text
              x={driverPoint.x + nodeRadius + 7}
              y={driverPoint.y - nodeRadius - 4}
              fill="#C7F36B"
              fontFamily="IBM Plex Mono, monospace"
              fontSize={compact ? 8 : 9}
              fontWeight="700"
              letterSpacing="0.5"
            >
              LIVE GPS
            </text>
          </g>
        ) : null}

        <g>
          {routes.map((route) => {
            const start = project(route.pickup, width, height);
            const end = project(route.dest, width, height);
            const style = ROUTE_STYLES[route.state];
            const label = route.kind === "active" ? `A${route.requestId}` : `Q${route.requestId}`;
            const labelWidth = Math.max(compact ? 28 : 32, label.length * (compact ? 5.2 : 6) + 10);
            const midpointX = (start.x + end.x) / 2;
            const midpointY = (start.y + end.y) / 2;
            const stagger = ((route.order % 3) - 1) * routeLabelOffset;
            const preferredLabelX =
              midpointX - labelWidth / 2 +
              (Math.abs(end.x - start.x) < Math.abs(end.y - start.y)
                ? route.order % 2 === 0
                  ? -routeLabelOffset * 2
                  : routeLabelOffset * 2
                : 0);
            const preferredLabelY =
              midpointY + stagger - routeLabelHeight / 2;
            const labelPosition = placeRouteLabel(
              preferredLabelX,
              preferredLabelY,
              labelWidth,
              routeLabelHeight,
            );

            return (
              <g
                key={route.key}
                data-route-state={route.state}
                data-request-id={route.requestId}
                aria-label={routeDescription(route)}
              >
                <title>{routeDescription(route)}</title>
                <line
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  stroke={style.stroke}
                  strokeOpacity={route.state === "compatible" ? 0.2 : 0.24}
                  strokeWidth={style.width + (compact ? 3 : 5)}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
                <line
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  stroke={style.stroke}
                  strokeOpacity={style.opacity}
                  strokeWidth={style.width}
                  strokeDasharray={style.dash || undefined}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  markerEnd={`url(#${prefix}-${route.state}-arrow)`}
                />
                <circle
                  cx={start.x}
                  cy={start.y}
                  r={nodeRadius}
                  fill="#081A1F"
                  stroke={style.stroke}
                  strokeWidth={style.width}
                />
                <polygon
                  points={`${end.x},${end.y - nodeRadius} ${end.x + nodeRadius},${end.y} ${end.x},${end.y + nodeRadius} ${end.x - nodeRadius},${end.y}`}
                  fill={style.stroke}
                  stroke="#081A1F"
                  strokeWidth="1.5"
                />
                <g aria-hidden="true">
                  <rect
                    x={labelPosition.x}
                    y={labelPosition.y}
                    width={labelWidth}
                    height={routeLabelHeight}
                    rx="1"
                    fill={style.labelFill}
                    fillOpacity={route.state === "compatible" ? 0.88 : 0.95}
                    stroke="#081A1F"
                    strokeOpacity="0.3"
                    strokeWidth="1"
                  />
                  <text
                    x={labelPosition.x + labelWidth / 2}
                    y={labelPosition.y + routeLabelHeight / 2 + 3}
                    textAnchor="middle"
                    fill={style.labelText}
                    fontFamily="IBM Plex Mono, monospace"
                    fontSize={routeLabelFontSize}
                    fontWeight="700"
                    letterSpacing="0.5"
                  >
                    {label}
                  </text>
                </g>
              </g>
            );
          })}
        </g>

        {!hasRoutes ? (
          <g aria-hidden="true">
            <rect
              x={canvas.left + 18}
              y={(canvas.top + canvas.bottom) / 2 - 28}
              width={Math.min(canvas.right - canvas.left - 36, compact ? 300 : 360)}
              height="56"
              fill="#081A1F"
              fillOpacity="0.9"
              stroke="#55DDE0"
              strokeOpacity="0.45"
            />
            <text
              x={(canvas.left + canvas.right) / 2}
              y={(canvas.top + canvas.bottom) / 2 - 3}
              textAnchor="middle"
              fill="#55DDE0"
              fontFamily="IBM Plex Mono, monospace"
              fontSize={compact ? 9 : 10}
              fontWeight="600"
              letterSpacing="1.5"
            >
              {emptyStateTitle}
            </text>
            <text
              x={(canvas.left + canvas.right) / 2}
              y={(canvas.top + canvas.bottom) / 2 + 15}
              textAnchor="middle"
              fill="#B9D2CF"
              fontFamily="IBM Plex Mono, monospace"
              fontSize={compact ? 8 : 9}
              letterSpacing="0.5"
            >
              {emptyStateMessage}
            </text>
          </g>
        ) : null}
      </svg>
    );
  }

  return (
    <section
      className={`section-panel overflow-hidden ${className}`}
      aria-labelledby={`${id}-heading`}
    >
      <div className="flex flex-col gap-4 border-b border-ink/10 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <MapPinned aria-hidden="true" className="h-4 w-4 text-cyan" />
            <p className="eyebrow">02 / Route signal</p>
          </div>
          <h2
            id={`${id}-heading`}
            className="mt-2 font-display text-2xl font-bold tracking-[-0.045em] sm:text-3xl"
          >
            Route signal
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/65">
            Schematic Dhaka corridors · oldest requests first · chained pickup/drop
            routes supported · nothing assigns automatically.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 border border-ink/10 bg-paper px-3 py-2">
          <div className="text-right">
            <p className="font-mono text-[8px] font-semibold uppercase tracking-[0.14em] text-ink/65">
              Waiting queue
            </p>
            <p className="mt-0.5 font-display text-2xl font-bold leading-none tracking-[-0.05em]">
              {requests.length}
            </p>
          </div>
          <RouteIcon aria-hidden="true" className="h-5 w-5 text-cyan" />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/10 bg-paper/70 px-5 py-3 sm:px-6">
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-ink/65">
          {activePool
            ? `Active pool #${activePool.id} · ${activePool.members.length} member route${activePool.members.length === 1 ? "" : "s"}`
            : "No active pool · waiting routes only"}
        </p>
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-ink/55">
          {driverLocation ? "Live GPS plotted" : "Live GPS not shared"} · Pickup{" "}
          <ArrowRight aria-hidden="true" className="mx-1 inline h-3 w-3" />
          destination
        </p>
      </div>

      <div className="bg-ink">
        <div className="relative h-[330px] w-full md:hidden">
          {renderCanvas(480, canvasHeight, `${id}-mobile`, "h-full w-full")}
        </div>
        <div className="relative hidden h-[430px] w-full md:block">
          {renderCanvas(960, canvasHeight, `${id}-desktop`, "h-full w-full")}
        </div>
      </div>

      {routes.length > 0 ? (
        <div className="border-b border-ink/10 bg-paper/70 px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="eyebrow">Plotted route trace</p>
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-ink/55">
              {routes.length} signal{routes.length === 1 ? "" : "s"} plotted
            </p>
          </div>
          <ul
            className="mt-3 flex flex-wrap gap-2"
            aria-label="Plotted route trace"
          >
            {routes.slice(0, 6).map((route) => {
              const style = ROUTE_STYLES[route.state];
              const routeLabel =
                route.kind === "active"
                  ? `A${route.requestId}`
                  : `Q${route.requestId}`;
              return (
                <li
                  key={`trace:${route.key}`}
                  aria-label={`${routeLabel}, ${route.pickupName} to ${route.destName}, ${ROUTE_STATE_LABELS[route.state]}`}
                  className="inline-flex min-w-0 max-w-full items-center gap-2 border border-ink/10 bg-porcelain px-2.5 py-1.5"
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: style.stroke }}
                    aria-hidden="true"
                  />
                  <span className="font-mono text-[9px] font-bold tracking-[0.08em] text-ink">
                    {routeLabel}
                  </span>
                  <span className="min-w-0 truncate text-[11px] font-semibold text-ink/70">
                    {route.pickupName}
                    <ArrowRight aria-hidden="true" className="mx-1 inline h-3 w-3 text-ink/35" />
                    {route.destName}
                  </span>
                  <span className="hidden font-mono text-[8px] font-semibold uppercase tracking-[0.1em] text-ink/55 sm:inline">
                    {ROUTE_STATE_LABELS[route.state]}
                  </span>
                </li>
              );
            })}
          </ul>
          {routes.length > 6 ? (
            <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.1em] text-ink/55">
              + {routes.length - 6} more plotted in the queue
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="border-t border-ink/10 bg-porcelain p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="eyebrow">How to read the signal</p>
            <ul
              className="mt-3 flex flex-wrap gap-x-5 gap-y-2"
              aria-label="Route signal legend"
            >
              <li className="flex items-center gap-2 text-xs font-semibold text-ink/70">
                <span className="h-2 w-2 rounded-full bg-lime ring-2 ring-lime/30" aria-hidden="true" />
                Live GPS
              </li>
              <li className="flex items-center gap-2 text-xs font-semibold text-ink/70">
                <span className="h-0.5 w-8 bg-lime" aria-hidden="true" />
                Selected / active
              </li>
              <li className="flex items-center gap-2 text-xs font-semibold text-ink/70">
                <span className="h-0.5 w-8 bg-cyan" aria-hidden="true" />
                Compatible waiting
              </li>
              <li className="flex items-center gap-2 text-xs font-semibold text-ink/70">
                <span className="h-0 w-8 border-t-2 border-dashed border-coral" aria-hidden="true" />
                Does not fit
              </li>
            </ul>
          </div>
          <div className="max-w-sm lg:text-right">
            <p className="font-mono text-[9px] font-semibold uppercase leading-4 tracking-[0.12em] text-ink/60">
              Arrows show direction · Q = waiting · A = active
            </p>
            {unlocatedRouteCount > 0 ? (
              <p className="mt-1 text-xs font-semibold leading-5 text-[#8A281F]" role="status">
                {unlocatedRouteCount} route{unlocatedRouteCount === 1 ? "" : "s"} will appear when area coordinates are available.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
