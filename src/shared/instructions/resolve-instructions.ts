import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createLogger } from "../logging";

const logger = createLogger("instructions");

/**
 * Pattern matching a line that is a static `@path/file` import.
 *
 * The line must consist only of `@<relative-path>` (with optional leading/
 * trailing whitespace).  For example:
 *
 * ```
 * @memory/USER.md
 * @memory/SOUL.md
 * ```
 */
const IMPORT_LINE_RE = /^\s*@([\w./_-]+)\s*$/;

/**
 * Reads a markdown instruction file (e.g. `CLAUDE.md`) and resolves every
 * static `@path/file` import line by replacing it with the referenced file's
 * content.
 *
 * Imports are resolved relative to `baseDir`.  Missing files are replaced
 * with a short notice so the rest of the instructions are still usable.
 *
 * @param filePath  Absolute path to the instruction file.
 * @param baseDir   Base directory for resolving relative `@` imports.
 * @returns The fully-resolved instruction text, or an empty string when the
 *          instruction file does not exist.
 */
export function resolveInstructionFile(
  filePath: string,
  baseDir: string,
): string {
  if (!existsSync(filePath)) {
    return "";
  }

  try {
    const raw = readFileSync(filePath, "utf-8");
    return resolveImports(raw, baseDir);
  } catch (err) {
    logger.warn({ err }, `Failed to read instruction file: ${filePath}`);
    return "";
  }
}

/**
 * Resolves all `@path/file` import lines in the given text.
 *
 * Each matching line is replaced with the file's content.  Non-existent
 * files are replaced with a placeholder comment.  Paths that escape
 * `baseDir` (e.g. `@../../secret`) are rejected for security.
 *
 * @param text     The raw instruction text potentially containing `@` imports.
 * @param baseDir  Base directory for resolving relative paths.
 * @returns The text with all imports inlined.
 */
export function resolveImports(text: string, baseDir: string): string {
  const lines = text.split("\n");
  const resolved: string[] = [];
  const resolvedBaseDir = resolve(baseDir);

  for (const line of lines) {
    const match = IMPORT_LINE_RE.exec(line);
    if (match) {
      const relativePath = match[1]!;
      const absolutePath = resolve(baseDir, relativePath);

      // Reject paths that escape baseDir (path traversal).
      if (!absolutePath.startsWith(resolvedBaseDir + "/")) {
        resolved.push(`<!-- import rejected (outside base dir): ${relativePath} -->`);
        logger.warn(`Import path escapes base dir: @${relativePath}`);
        continue;
      }

      try {
        if (existsSync(absolutePath)) {
          const content = readFileSync(absolutePath, "utf-8");
          resolved.push(content.trimEnd());
          logger.debug(`Resolved import: @${relativePath}`);
        } else {
          resolved.push(`<!-- file not found: ${relativePath} -->`);
          logger.warn(`Import file not found: ${absolutePath}`);
        }
      } catch (err) {
        resolved.push(`<!-- failed to read: ${relativePath} -->`);
        logger.warn({ err }, `Failed to read import file: ${absolutePath}`);
      }
    } else {
      resolved.push(line);
    }
  }

  return resolved.join("\n");
}
