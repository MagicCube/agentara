import { CliError, ExitCode, getAmapApiKey, isRecord } from "./config.ts";
import {
  buildEndpointUrl,
  type DirectCommand,
  getBusinessErrorText,
  isBusinessSuccess,
} from "./endpoints.ts";
import { getJsonWithRetry, type HttpGetRequest } from "./http.ts";
import type { CommandName } from "./validators.ts";

export interface ExecuteCommandDependencies {
  requestJson?: (request: HttpGetRequest) => Promise<unknown>;
  apiKey?: string;
  timeoutMs?: number;
  retries?: number;
}

interface RuntimeContext {
  requestJson: (request: HttpGetRequest) => Promise<unknown>;
  apiKey: string;
  timeoutMs: number | undefined;
  retries: number | undefined;
}

function getRequiredString(flags: Record<string, unknown>, key: string): string {
  const value = flags[key];
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  throw new CliError(`Missing required argument: --${key}`, ExitCode.INTERNAL);
}

function getOptionalString(flags: Record<string, unknown>, key: string): string | undefined {
  const value = flags[key];
  if (typeof value === "string") {
    return value;
  }
  return undefined;
}

async function runDirectCommand(
  command: DirectCommand,
  params: Record<string, string | undefined>,
  context: RuntimeContext,
): Promise<unknown> {
  const payload = await context.requestJson({
    url: buildEndpointUrl(command),
    params: {
      key: context.apiKey,
      ...params,
    },
    timeoutMs: context.timeoutMs,
    retries: context.retries,
  });

  if (!isBusinessSuccess(command, payload)) {
    throw new CliError(
      `AMap API business error for ${command}: ${getBusinessErrorText(payload)}`,
      ExitCode.API_BUSINESS,
      { rawResponse: payload },
    );
  }

  return payload;
}

async function geocodeAddressToLocation(
  address: string,
  city: string | undefined,
  context: RuntimeContext,
): Promise<string> {
  const geocodeResponse = await runDirectCommand(
    "geocode",
    {
      address,
      city,
    },
    context,
  );

  if (!isRecord(geocodeResponse) || !Array.isArray(geocodeResponse.geocodes)) {
    throw new CliError("Geocode response has invalid structure.", ExitCode.API_BUSINESS, {
      rawResponse: geocodeResponse,
    });
  }

  const firstGeocode = geocodeResponse.geocodes[0];
  if (!isRecord(firstGeocode) || typeof firstGeocode.location !== "string" || firstGeocode.location.length === 0) {
    throw new CliError("Geocode returned no location result.", ExitCode.API_BUSINESS, {
      rawResponse: geocodeResponse,
    });
  }

  return firstGeocode.location;
}

export async function executeCommand(
  command: CommandName,
  flags: Record<string, unknown>,
  dependencies: ExecuteCommandDependencies = {},
): Promise<unknown> {
  const context: RuntimeContext = {
    requestJson: dependencies.requestJson ?? getJsonWithRetry,
    apiKey: dependencies.apiKey ?? getAmapApiKey(),
    timeoutMs: dependencies.timeoutMs,
    retries: dependencies.retries,
  };

  switch (command) {
    case "reverse-geocode":
      return runDirectCommand(
        "reverse-geocode",
        {
          location: getRequiredString(flags, "location"),
        },
        context,
      );
    case "geocode":
      return runDirectCommand(
        "geocode",
        {
          address: getRequiredString(flags, "address"),
          city: getOptionalString(flags, "city"),
        },
        context,
      );
    case "ip-location":
      return runDirectCommand(
        "ip-location",
        {
          ip: getRequiredString(flags, "ip"),
        },
        context,
      );
    case "weather":
      return runDirectCommand(
        "weather",
        {
          city: getRequiredString(flags, "city"),
          extensions: getRequiredString(flags, "extensions"),
        },
        context,
      );
    case "bike-route-coords":
      return runDirectCommand(
        "bike-route-coords",
        {
          origin: getRequiredString(flags, "origin"),
          destination: getRequiredString(flags, "destination"),
        },
        context,
      );
    case "walk-route-coords":
      return runDirectCommand(
        "walk-route-coords",
        {
          origin: getRequiredString(flags, "origin"),
          destination: getRequiredString(flags, "destination"),
        },
        context,
      );
    case "drive-route-coords":
      return runDirectCommand(
        "drive-route-coords",
        {
          origin: getRequiredString(flags, "origin"),
          destination: getRequiredString(flags, "destination"),
        },
        context,
      );
    case "transit-route-coords":
      return runDirectCommand(
        "transit-route-coords",
        {
          origin: getRequiredString(flags, "origin"),
          destination: getRequiredString(flags, "destination"),
          city: getRequiredString(flags, "city"),
          cityd: getRequiredString(flags, "cityd"),
        },
        context,
      );
    case "distance":
      return runDirectCommand(
        "distance",
        {
          origins: getRequiredString(flags, "origins"),
          destination: getRequiredString(flags, "destination"),
          type: getRequiredString(flags, "type"),
        },
        context,
      );
    case "poi-text":
      return runDirectCommand(
        "poi-text",
        {
          keywords: getRequiredString(flags, "keywords"),
          city: getOptionalString(flags, "city"),
          citylimit: getRequiredString(flags, "citylimit"),
        },
        context,
      );
    case "poi-around":
      return runDirectCommand(
        "poi-around",
        {
          location: getRequiredString(flags, "location"),
          radius: getRequiredString(flags, "radius"),
          keywords: getOptionalString(flags, "keywords"),
        },
        context,
      );
    case "poi-detail":
      return runDirectCommand(
        "poi-detail",
        {
          id: getRequiredString(flags, "id"),
        },
        context,
      );
    case "bike-route-address": {
      const origin = await geocodeAddressToLocation(
        getRequiredString(flags, "origin-address"),
        getOptionalString(flags, "origin-city"),
        context,
      );
      const destination = await geocodeAddressToLocation(
        getRequiredString(flags, "destination-address"),
        getOptionalString(flags, "destination-city"),
        context,
      );
      return runDirectCommand(
        "bike-route-coords",
        {
          origin,
          destination,
        },
        context,
      );
    }
    case "walk-route-address": {
      const origin = await geocodeAddressToLocation(
        getRequiredString(flags, "origin-address"),
        getOptionalString(flags, "origin-city"),
        context,
      );
      const destination = await geocodeAddressToLocation(
        getRequiredString(flags, "destination-address"),
        getOptionalString(flags, "destination-city"),
        context,
      );
      return runDirectCommand(
        "walk-route-coords",
        {
          origin,
          destination,
        },
        context,
      );
    }
    case "drive-route-address": {
      const origin = await geocodeAddressToLocation(
        getRequiredString(flags, "origin-address"),
        getOptionalString(flags, "origin-city"),
        context,
      );
      const destination = await geocodeAddressToLocation(
        getRequiredString(flags, "destination-address"),
        getOptionalString(flags, "destination-city"),
        context,
      );
      return runDirectCommand(
        "drive-route-coords",
        {
          origin,
          destination,
        },
        context,
      );
    }
    case "transit-route-address": {
      const origin = await geocodeAddressToLocation(
        getRequiredString(flags, "origin-address"),
        getRequiredString(flags, "origin-city"),
        context,
      );
      const destination = await geocodeAddressToLocation(
        getRequiredString(flags, "destination-address"),
        getRequiredString(flags, "destination-city"),
        context,
      );
      return runDirectCommand(
        "transit-route-coords",
        {
          origin,
          destination,
          city: getRequiredString(flags, "origin-city"),
          cityd: getRequiredString(flags, "destination-city"),
        },
        context,
      );
    }
    default: {
      const unhandledCommand: never = command;
      throw new CliError(`Unsupported command: ${unhandledCommand}`, ExitCode.INTERNAL);
    }
  }
}
