import { AMAP_API_BASE_URL, isRecord } from "./config.ts";

export type SuccessStrategy = "v3-status" | "v4-errcode";

export type DirectCommand =
  | "reverse-geocode"
  | "geocode"
  | "ip-location"
  | "weather"
  | "bike-route-coords"
  | "walk-route-coords"
  | "drive-route-coords"
  | "transit-route-coords"
  | "distance"
  | "poi-text"
  | "poi-around"
  | "poi-detail";

export interface EndpointDefinition {
  path: string;
  strategy: SuccessStrategy;
}

export const DIRECT_ENDPOINTS: Record<DirectCommand, EndpointDefinition> = {
  "reverse-geocode": {
    path: "/v3/geocode/regeo",
    strategy: "v3-status",
  },
  geocode: {
    path: "/v3/geocode/geo",
    strategy: "v3-status",
  },
  "ip-location": {
    path: "/v3/ip",
    strategy: "v3-status",
  },
  weather: {
    path: "/v3/weather/weatherInfo",
    strategy: "v3-status",
  },
  "bike-route-coords": {
    path: "/v4/direction/bicycling",
    strategy: "v4-errcode",
  },
  "walk-route-coords": {
    path: "/v3/direction/walking",
    strategy: "v3-status",
  },
  "drive-route-coords": {
    path: "/v3/direction/driving",
    strategy: "v3-status",
  },
  "transit-route-coords": {
    path: "/v3/direction/transit/integrated",
    strategy: "v3-status",
  },
  distance: {
    path: "/v3/distance",
    strategy: "v3-status",
  },
  "poi-text": {
    path: "/v3/place/text",
    strategy: "v3-status",
  },
  "poi-around": {
    path: "/v3/place/around",
    strategy: "v3-status",
  },
  "poi-detail": {
    path: "/v3/place/detail",
    strategy: "v3-status",
  },
};

export function buildEndpointUrl(command: DirectCommand): string {
  const endpoint = DIRECT_ENDPOINTS[command];
  return `${AMAP_API_BASE_URL}${endpoint.path}`;
}

export function isBusinessSuccess(command: DirectCommand, payload: unknown): boolean {
  const strategy = DIRECT_ENDPOINTS[command].strategy;

  if (!isRecord(payload)) {
    return false;
  }

  if (strategy === "v3-status") {
    return payload.status === "1";
  }

  return payload.errcode === 0 || payload.errcode === "0";
}

export function getBusinessErrorText(payload: unknown): string {
  if (!isRecord(payload)) {
    return "Unknown API response format";
  }

  if (typeof payload.info === "string" && payload.info.length > 0) {
    return payload.info;
  }

  if (typeof payload.errmsg === "string" && payload.errmsg.length > 0) {
    return payload.errmsg;
  }

  if (typeof payload.infocode === "string" && payload.infocode.length > 0) {
    return payload.infocode;
  }

  if ((typeof payload.errcode === "string" || typeof payload.errcode === "number") && payload.errcode !== 0) {
    return String(payload.errcode);
  }

  return "Unknown API business error";
}
