#!/usr/bin/env bun

import { executeCommand } from "./lib/commands.ts";
import { CliError, ExitCode, toErrorMessage } from "./lib/config.ts";
import {
  COMMAND_HELP_MAP,
  COMMAND_ORDER,
  isCommandName,
  validateCommandFlags,
} from "./lib/validators.ts";

function printJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function printGlobalHelp(): void {
  const lines: string[] = [];
  lines.push("AMap Script CLI");
  lines.push("");
  lines.push("Usage:");
  lines.push("  bun scripts/amap.ts <command> [flags]");
  lines.push("");
  lines.push("Commands:");

  for (const command of COMMAND_ORDER) {
    const help = COMMAND_HELP_MAP[command];
    lines.push(`  ${help.usage}`);
  }

  lines.push("");
  lines.push("Tips:");
  lines.push("  - Set AMAP_MAPS_API_KEY before running commands");
  lines.push("  - Use --help after a command for command-specific details");
  process.stdout.write(`${lines.join("\n")}\n`);
}

function printCommandHelp(command: keyof typeof COMMAND_HELP_MAP): void {
  const help = COMMAND_HELP_MAP[command];
  process.stdout.write(`Usage: ${help.usage}\n${help.description}\n`);
}

function parseFlags(tokens: string[]): Record<string, string> {
  const flags: Record<string, string> = {};

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (!token) {
      continue;
    }

    if (!token.startsWith("--")) {
      throw new CliError(`Invalid token: ${token}. Use --key value format.`, ExitCode.PARAM_OR_CONFIG);
    }

    const trimmed = token.slice(2);
    if (trimmed.length === 0) {
      throw new CliError("Empty flag name is not allowed.", ExitCode.PARAM_OR_CONFIG);
    }

    let key = trimmed;
    let value: string | undefined;

    const equalIndex = trimmed.indexOf("=");
    if (equalIndex >= 0) {
      key = trimmed.slice(0, equalIndex);
      value = trimmed.slice(equalIndex + 1);
    } else {
      const next = tokens[index + 1];
      if (!next || next.startsWith("--")) {
        throw new CliError(`Flag --${key} is missing a value.`, ExitCode.PARAM_OR_CONFIG);
      }
      value = next;
      index += 1;
    }

    if (key.length === 0) {
      throw new CliError("Flag name cannot be empty.", ExitCode.PARAM_OR_CONFIG);
    }

    if (Object.hasOwn(flags, key)) {
      throw new CliError(`Duplicate flag: --${key}`, ExitCode.PARAM_OR_CONFIG);
    }

    flags[key] = value;
  }

  return flags;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printGlobalHelp();
    process.exit(ExitCode.OK);
  }

  const commandToken = args[0];
  if (!commandToken || !isCommandName(commandToken)) {
    throw new CliError(`Unknown command: ${commandToken ?? ""}`, ExitCode.PARAM_OR_CONFIG);
  }

  const restArgs = args.slice(1);
  if (restArgs.length === 1 && (restArgs[0] === "--help" || restArgs[0] === "-h")) {
    printCommandHelp(commandToken);
    process.exit(ExitCode.OK);
  }

  const rawFlags = parseFlags(restArgs);
  const validatedFlags = validateCommandFlags(commandToken, rawFlags);
  const response = await executeCommand(commandToken, validatedFlags as Record<string, unknown>);

  printJson(response);
  process.exit(ExitCode.OK);
}

void main().catch((error: unknown) => {
  if (error instanceof CliError) {
    if (error.rawResponse !== undefined) {
      printJson(error.rawResponse);
    } else {
      process.stderr.write(`${error.message}\n`);
    }
    process.exit(error.exitCode);
  }

  process.stderr.write(`Unexpected internal error: ${toErrorMessage(error)}\n`);
  process.exit(ExitCode.INTERNAL);
});
