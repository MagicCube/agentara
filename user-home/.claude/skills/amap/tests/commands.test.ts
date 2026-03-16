import { beforeAll, describe, expect, it } from "bun:test";

import { executeCommand } from "../scripts/lib/commands.ts";
import { CliError, ExitCode } from "../scripts/lib/config.ts";
import type { HttpGetRequest } from "../scripts/lib/http.ts";
import { validateCommandFlags } from "../scripts/lib/validators.ts";

const fixturePath = (name: string) => new URL(`./fixtures/${name}`, import.meta.url);

async function loadFixture(name: string): Promise<unknown> {
  return JSON.parse(await Bun.file(fixturePath(name)).text());
}

describe("executeCommand", () => {
  let geocodeSuccess: unknown;
  let geocodeEmpty: unknown;
  let geocodeError: unknown;
  let bikeSuccess: unknown;
  let bikeError: unknown;

  beforeAll(async () => {
    geocodeSuccess = await loadFixture("geocode-success.json");
    geocodeEmpty = await loadFixture("geocode-empty.json");
    geocodeError = await loadFixture("geocode-error.json");
    bikeSuccess = await loadFixture("bike-success.json");
    bikeError = await loadFixture("bike-error.json");
  });

  it("returns raw geocode JSON on success", async () => {
    const calls: HttpGetRequest[] = [];

    const result = await executeCommand(
      "geocode",
      validateCommandFlags("geocode", { address: "北京市朝阳区阜通东大街6号" }) as Record<string, unknown>,
      {
        apiKey: "test-key",
        requestJson: async (request) => {
          calls.push(request);
          return geocodeSuccess;
        },
      },
    );

    expect(result).toEqual(geocodeSuccess);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toContain("/v3/geocode/geo");
    expect(calls[0]?.params.key).toBe("test-key");
    expect(calls[0]?.params.address).toBe("北京市朝阳区阜通东大街6号");
  });

  it("fails with exit code 4 when geocode returns status=0", async () => {
    const command = executeCommand(
      "geocode",
      validateCommandFlags("geocode", { address: "invalid" }) as Record<string, unknown>,
      {
        apiKey: "test-key",
        requestJson: async () => geocodeError,
      },
    );

    await expect(command).rejects.toBeInstanceOf(CliError);

    try {
      await command;
    } catch (error) {
      const cliError = error as CliError;
      expect(cliError.exitCode).toBe(ExitCode.API_BUSINESS);
      expect(cliError.rawResponse).toEqual(geocodeError);
    }
  });

  it("fails with exit code 4 when bike route v4 errcode != 0", async () => {
    const command = executeCommand(
      "bike-route-coords",
      validateCommandFlags("bike-route-coords", {
        origin: "116.481488,39.990464",
        destination: "116.315613,39.998935",
      }) as Record<string, unknown>,
      {
        apiKey: "test-key",
        requestJson: async () => bikeError,
      },
    );

    await expect(command).rejects.toBeInstanceOf(CliError);

    try {
      await command;
    } catch (error) {
      const cliError = error as CliError;
      expect(cliError.exitCode).toBe(ExitCode.API_BUSINESS);
      expect(cliError.rawResponse).toEqual(bikeError);
    }
  });

  it("fails early when address route geocode has no results", async () => {
    let callCount = 0;

    const command = executeCommand(
      "bike-route-address",
      validateCommandFlags("bike-route-address", {
        "origin-address": "北京市朝阳区阜通东大街6号",
        "destination-address": "北京市海淀区上地十街10号",
        "origin-city": "北京",
        "destination-city": "北京",
      }) as Record<string, unknown>,
      {
        apiKey: "test-key",
        requestJson: async () => {
          callCount += 1;
          if (callCount === 1) {
            return geocodeSuccess;
          }
          if (callCount === 2) {
            return geocodeEmpty;
          }
          return bikeSuccess;
        },
      },
    );

    await expect(command).rejects.toBeInstanceOf(CliError);

    try {
      await command;
    } catch (error) {
      const cliError = error as CliError;
      expect(cliError.exitCode).toBe(ExitCode.API_BUSINESS);
      expect(cliError.rawResponse).toEqual(geocodeEmpty);
    }

    expect(callCount).toBe(2);
  });

  it("propagates network failures with exit code 3", async () => {
    const command = executeCommand(
      "poi-detail",
      validateCommandFlags("poi-detail", { id: "B000A8URXB" }) as Record<string, unknown>,
      {
        apiKey: "test-key",
        requestJson: async () => {
          throw new CliError("network timeout", ExitCode.NETWORK);
        },
      },
    );

    await expect(command).rejects.toBeInstanceOf(CliError);

    try {
      await command;
    } catch (error) {
      const cliError = error as CliError;
      expect(cliError.exitCode).toBe(ExitCode.NETWORK);
      expect(cliError.message).toContain("network timeout");
    }
  });
});
