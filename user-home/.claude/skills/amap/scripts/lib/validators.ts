import { CliError, ExitCode } from "./config.ts";

export type CommandName =
  | "reverse-geocode"
  | "geocode"
  | "ip-location"
  | "weather"
  | "bike-route-coords"
  | "bike-route-address"
  | "walk-route-coords"
  | "walk-route-address"
  | "drive-route-coords"
  | "drive-route-address"
  | "transit-route-coords"
  | "transit-route-address"
  | "distance"
  | "poi-text"
  | "poi-around"
  | "poi-detail";

interface CommandFlagMap {
  "reverse-geocode": {
    location: string;
  };
  geocode: {
    address: string;
    city?: string;
  };
  "ip-location": {
    ip: string;
  };
  weather: {
    city: string;
    extensions: "base" | "all";
  };
  "bike-route-coords": {
    origin: string;
    destination: string;
  };
  "bike-route-address": {
    "origin-address": string;
    "destination-address": string;
    "origin-city"?: string;
    "destination-city"?: string;
  };
  "walk-route-coords": {
    origin: string;
    destination: string;
  };
  "walk-route-address": {
    "origin-address": string;
    "destination-address": string;
    "origin-city"?: string;
    "destination-city"?: string;
  };
  "drive-route-coords": {
    origin: string;
    destination: string;
  };
  "drive-route-address": {
    "origin-address": string;
    "destination-address": string;
    "origin-city"?: string;
    "destination-city"?: string;
  };
  "transit-route-coords": {
    origin: string;
    destination: string;
    city: string;
    cityd: string;
  };
  "transit-route-address": {
    "origin-address": string;
    "destination-address": string;
    "origin-city": string;
    "destination-city": string;
  };
  distance: {
    origins: string;
    destination: string;
    type: "0" | "1" | "3";
  };
  "poi-text": {
    keywords: string;
    city?: string;
    citylimit: "true" | "false";
  };
  "poi-around": {
    location: string;
    radius: string;
    keywords?: string;
  };
  "poi-detail": {
    id: string;
  };
}

export type ValidatedFlags<K extends CommandName> = CommandFlagMap[K];

export interface CommandHelp {
  usage: string;
  description: string;
}

export const COMMAND_HELP_MAP: Record<CommandName, CommandHelp> = {
  "reverse-geocode": {
    usage: "reverse-geocode --location <lon,lat>",
    description: "Convert coordinates to administrative address fields.",
  },
  geocode: {
    usage: "geocode --address <text> [--city <text>]",
    description: "Convert structured address to coordinates.",
  },
  "ip-location": {
    usage: "ip-location --ip <ipv4>",
    description: "Resolve an IPv4 address to location info.",
  },
  weather: {
    usage: "weather --city <name|adcode> [--extensions <base|all>]",
    description: "Query weather by city name or adcode.",
  },
  "bike-route-coords": {
    usage: "bike-route-coords --origin <lon,lat> --destination <lon,lat>",
    description: "Plan bicycle route by coordinates.",
  },
  "bike-route-address": {
    usage:
      "bike-route-address --origin-address <text> --destination-address <text> [--origin-city <text>] [--destination-city <text>]",
    description: "Plan bicycle route by addresses (internally geocode first).",
  },
  "walk-route-coords": {
    usage: "walk-route-coords --origin <lon,lat> --destination <lon,lat>",
    description: "Plan walking route by coordinates.",
  },
  "walk-route-address": {
    usage:
      "walk-route-address --origin-address <text> --destination-address <text> [--origin-city <text>] [--destination-city <text>]",
    description: "Plan walking route by addresses (internally geocode first).",
  },
  "drive-route-coords": {
    usage: "drive-route-coords --origin <lon,lat> --destination <lon,lat>",
    description: "Plan driving route by coordinates.",
  },
  "drive-route-address": {
    usage:
      "drive-route-address --origin-address <text> --destination-address <text> [--origin-city <text>] [--destination-city <text>]",
    description: "Plan driving route by addresses (internally geocode first).",
  },
  "transit-route-coords": {
    usage: "transit-route-coords --origin <lon,lat> --destination <lon,lat> --city <text> --cityd <text>",
    description: "Plan integrated transit route by coordinates.",
  },
  "transit-route-address": {
    usage:
      "transit-route-address --origin-address <text> --destination-address <text> --origin-city <text> --destination-city <text>",
    description: "Plan integrated transit route by addresses (internally geocode first).",
  },
  distance: {
    usage: "distance --origins <lon,lat|lon,lat...> --destination <lon,lat> [--type <0|1|3>]",
    description: "Measure distance between origins and destination.",
  },
  "poi-text": {
    usage: "poi-text --keywords <text> [--city <text>] [--citylimit <true|false>]",
    description: "Search POI by keyword.",
  },
  "poi-around": {
    usage: "poi-around --location <lon,lat> [--radius <int>] [--keywords <text>]",
    description: "Search POI around a center point.",
  },
  "poi-detail": {
    usage: "poi-detail --id <poi-id>",
    description: "Query POI details by id.",
  },
};

export const COMMAND_ORDER: CommandName[] = [
  "reverse-geocode",
  "geocode",
  "ip-location",
  "weather",
  "bike-route-coords",
  "bike-route-address",
  "walk-route-coords",
  "walk-route-address",
  "drive-route-coords",
  "drive-route-address",
  "transit-route-coords",
  "transit-route-address",
  "distance",
  "poi-text",
  "poi-around",
  "poi-detail",
];

const COMMAND_NAME_SET = new Set<string>(COMMAND_ORDER);

const ALLOWED_FLAG_NAMES: Record<CommandName, readonly string[]> = {
  "reverse-geocode": ["location"],
  geocode: ["address", "city"],
  "ip-location": ["ip"],
  weather: ["city", "extensions"],
  "bike-route-coords": ["origin", "destination"],
  "bike-route-address": ["origin-address", "destination-address", "origin-city", "destination-city"],
  "walk-route-coords": ["origin", "destination"],
  "walk-route-address": ["origin-address", "destination-address", "origin-city", "destination-city"],
  "drive-route-coords": ["origin", "destination"],
  "drive-route-address": ["origin-address", "destination-address", "origin-city", "destination-city"],
  "transit-route-coords": ["origin", "destination", "city", "cityd"],
  "transit-route-address": ["origin-address", "destination-address", "origin-city", "destination-city"],
  distance: ["origins", "destination", "type"],
  "poi-text": ["keywords", "city", "citylimit"],
  "poi-around": ["location", "radius", "keywords"],
  "poi-detail": ["id"],
};

function throwInvalidFlags(command: CommandName, message: string): never {
  throw new CliError(`Invalid flags for ${command}: ${message}`, ExitCode.PARAM_OR_CONFIG);
}

function ensureNoUnknownFlags(command: CommandName, rawFlags: Record<string, string>): void {
  const allowed = new Set(ALLOWED_FLAG_NAMES[command]);
  const unknownFlags: string[] = [];

  for (const key of Object.keys(rawFlags)) {
    if (!allowed.has(key)) {
      unknownFlags.push(`--${key}`);
    }
  }

  if (unknownFlags.length > 0) {
    throwInvalidFlags(command, `unknown flags: ${unknownFlags.join(", ")}`);
  }
}

function normalizeOptionalString(command: CommandName, rawFlags: Record<string, string>, key: string): string | undefined {
  const value = rawFlags[key];
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    throwInvalidFlags(command, `${key}: must be a non-empty string`);
  }

  return normalized;
}

function normalizeRequiredString(command: CommandName, rawFlags: Record<string, string>, key: string): string {
  const normalized = normalizeOptionalString(command, rawFlags, key);
  if (!normalized) {
    throwInvalidFlags(command, `${key}: is required`);
  }
  return normalized;
}

function isValidCoordinate(value: string): boolean {
  const parts = value.split(",");
  if (parts.length !== 2) {
    return false;
  }

  const longitude = Number(parts[0]?.trim());
  const latitude = Number(parts[1]?.trim());

  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return false;
  }

  return longitude >= -180 && longitude <= 180 && latitude >= -90 && latitude <= 90;
}

function validateCoordinate(command: CommandName, key: string, value: string): string {
  if (!isValidCoordinate(value)) {
    throwInvalidFlags(command, `${key}: must be in <longitude,latitude> format with valid numeric ranges`);
  }

  return value;
}

function validateIPv4(command: CommandName, key: string, value: string): string {
  const parts = value.split(".");
  if (parts.length !== 4) {
    throwInvalidFlags(command, `${key}: must be a valid IPv4 address`);
  }

  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      throwInvalidFlags(command, `${key}: must be a valid IPv4 address`);
    }

    const number = Number(part);
    if (!Number.isInteger(number) || number < 0 || number > 255) {
      throwInvalidFlags(command, `${key}: must be a valid IPv4 address`);
    }
  }

  return value;
}

function validateOrigins(command: CommandName, key: string, value: string): string {
  const coordinates = value.split("|").map((item) => item.trim());
  if (coordinates.length === 0) {
    throwInvalidFlags(command, `${key}: must be in <lon,lat|lon,lat...> format`);
  }

  for (const coordinate of coordinates) {
    if (!isValidCoordinate(coordinate)) {
      throwInvalidFlags(command, `${key}: must be in <lon,lat|lon,lat...> format`);
    }
  }

  return value;
}

function validateEnum<T extends string>(
  command: CommandName,
  key: string,
  value: string,
  allowed: readonly T[],
): T {
  if (!allowed.includes(value as T)) {
    throwInvalidFlags(command, `${key}: must be one of ${allowed.join(", ")}`);
  }

  return value as T;
}

function validateRadius(command: CommandName, key: string, value: string): string {
  if (!/^\d+$/.test(value)) {
    throwInvalidFlags(command, `${key}: must be a positive integer`);
  }

  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throwInvalidFlags(command, `${key}: must be a positive integer`);
  }

  return value;
}

function validateCoordsRoute<K extends "bike-route-coords" | "walk-route-coords" | "drive-route-coords">(
  command: K,
  rawFlags: Record<string, string>,
): ValidatedFlags<K> {
  const origin = validateCoordinate(command, "origin", normalizeRequiredString(command, rawFlags, "origin"));
  const destination = validateCoordinate(
    command,
    "destination",
    normalizeRequiredString(command, rawFlags, "destination"),
  );

  return {
    origin,
    destination,
  } as ValidatedFlags<K>;
}

function validateAddressRoute<K extends "bike-route-address" | "walk-route-address" | "drive-route-address">(
  command: K,
  rawFlags: Record<string, string>,
): ValidatedFlags<K> {
  return {
    "origin-address": normalizeRequiredString(command, rawFlags, "origin-address"),
    "destination-address": normalizeRequiredString(command, rawFlags, "destination-address"),
    "origin-city": normalizeOptionalString(command, rawFlags, "origin-city"),
    "destination-city": normalizeOptionalString(command, rawFlags, "destination-city"),
  } as ValidatedFlags<K>;
}

export function isCommandName(value: string): value is CommandName {
  return COMMAND_NAME_SET.has(value);
}

export function validateCommandFlags<K extends CommandName>(
  command: K,
  rawFlags: Record<string, string>,
): ValidatedFlags<K> {
  ensureNoUnknownFlags(command, rawFlags);

  switch (command) {
    case "reverse-geocode": {
      const location = validateCoordinate(
        command,
        "location",
        normalizeRequiredString(command, rawFlags, "location"),
      );
      return { location } as ValidatedFlags<K>;
    }
    case "geocode": {
      return {
        address: normalizeRequiredString(command, rawFlags, "address"),
        city: normalizeOptionalString(command, rawFlags, "city"),
      } as ValidatedFlags<K>;
    }
    case "ip-location": {
      const ip = validateIPv4(command, "ip", normalizeRequiredString(command, rawFlags, "ip"));
      return { ip } as ValidatedFlags<K>;
    }
    case "weather": {
      const extensionsRaw = normalizeOptionalString(command, rawFlags, "extensions") ?? "all";
      const extensions = validateEnum(command, "extensions", extensionsRaw, ["base", "all"]);
      return {
        city: normalizeRequiredString(command, rawFlags, "city"),
        extensions,
      } as ValidatedFlags<K>;
    }
    case "bike-route-coords":
    case "walk-route-coords":
    case "drive-route-coords": {
      return validateCoordsRoute(command, rawFlags) as ValidatedFlags<K>;
    }
    case "bike-route-address":
    case "walk-route-address":
    case "drive-route-address": {
      return validateAddressRoute(command, rawFlags) as ValidatedFlags<K>;
    }
    case "transit-route-coords": {
      return {
        origin: validateCoordinate(command, "origin", normalizeRequiredString(command, rawFlags, "origin")),
        destination: validateCoordinate(
          command,
          "destination",
          normalizeRequiredString(command, rawFlags, "destination"),
        ),
        city: normalizeRequiredString(command, rawFlags, "city"),
        cityd: normalizeRequiredString(command, rawFlags, "cityd"),
      } as ValidatedFlags<K>;
    }
    case "transit-route-address": {
      return {
        "origin-address": normalizeRequiredString(command, rawFlags, "origin-address"),
        "destination-address": normalizeRequiredString(command, rawFlags, "destination-address"),
        "origin-city": normalizeRequiredString(command, rawFlags, "origin-city"),
        "destination-city": normalizeRequiredString(command, rawFlags, "destination-city"),
      } as ValidatedFlags<K>;
    }
    case "distance": {
      const origins = validateOrigins(command, "origins", normalizeRequiredString(command, rawFlags, "origins"));
      const destination = validateCoordinate(
        command,
        "destination",
        normalizeRequiredString(command, rawFlags, "destination"),
      );
      const typeRaw = normalizeOptionalString(command, rawFlags, "type") ?? "1";
      const type = validateEnum(command, "type", typeRaw, ["0", "1", "3"]);

      return {
        origins,
        destination,
        type,
      } as ValidatedFlags<K>;
    }
    case "poi-text": {
      const citylimitRaw = normalizeOptionalString(command, rawFlags, "citylimit") ?? "false";
      const citylimit = validateEnum(command, "citylimit", citylimitRaw, ["true", "false"]);

      return {
        keywords: normalizeRequiredString(command, rawFlags, "keywords"),
        city: normalizeOptionalString(command, rawFlags, "city"),
        citylimit,
      } as ValidatedFlags<K>;
    }
    case "poi-around": {
      const location = validateCoordinate(
        command,
        "location",
        normalizeRequiredString(command, rawFlags, "location"),
      );
      const radiusRaw = normalizeOptionalString(command, rawFlags, "radius") ?? "1000";
      const radius = validateRadius(command, "radius", radiusRaw);

      return {
        location,
        radius,
        keywords: normalizeOptionalString(command, rawFlags, "keywords"),
      } as ValidatedFlags<K>;
    }
    case "poi-detail": {
      return {
        id: normalizeRequiredString(command, rawFlags, "id"),
      } as ValidatedFlags<K>;
    }
    default: {
      const unhandled: never = command;
      throwInvalidFlags(command, `unsupported command: ${String(unhandled)}`);
    }
  }
}
