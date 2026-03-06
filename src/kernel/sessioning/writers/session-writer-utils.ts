import {
  appendFile as fsAppendFile,
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

import {
  logger,
  extractTextContent,
  isPureTextMessage,
  type Message,
} from "@/shared";

/**
 * Ensures the file and its parent directory exist.
 * Creates empty file if missing.
 */
export function ensureFile(path: string): void {
  if (!existsSync(path)) {
    const dir = dirname(path);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, "", "utf-8");
  }
}

/**
 * Appends content to file asynchronously.
 * On failure: logs error, does not throw.
 * If onDone is provided, calls it after append completes (success or failure).
 */
export function appendFile(
  path: string,
  content: string,
  // eslint-disable-next-line no-unused-vars
  onDone?: (err: NodeJS.ErrnoException | null) => void,
): void {
  fsAppendFile(path, content, "utf-8", (err) => {
    if (err) {
      logger.error({ err, path }, "Failed to append to file");
    }
    onDone?.(err ?? null);
  });
}

/**
 * Formats message as `ROLE:\ntext` for pure-text messages.
 * Returns null for non-pure-text messages.
 */
export function formatFileLine(message: Message): string | null {
  if (!isPureTextMessage(message)) {
    return null;
  }
  const text = extractTextContent(message);
  return `${message.role.toUpperCase()}:\n${text}`;
}
