import { config } from "@/shared";
import type { Message } from "@/shared";

import { appendFile, ensureFile, formatFileLine } from "./session-writer-utils";

interface QueuedItem {
  message: Message;
  path: string;
}

/**
 * Appends messages to daily log file.
 * Cross-session. Uses internal queue for sequential writes.
 */
export class SessionDailyLogWriter {
  write(message: Message): void {
    const path = config.paths.resolveDailyLogFilePath(new Date());
    this._queue.push({ message, path });
    this._drain();
  }

  private _queue: QueuedItem[] = [];
  private _processing = false;

  private _drain(): void {
    if (this._processing || this._queue.length === 0) {
      return;
    }
    this._processing = true;
    const item = this._queue.shift()!;
    const line = formatFileLine(item.message);
    if (line) {
      ensureFile(item.path);
      const content = `${line}\n\n`;
      appendFile(item.path, content, () => {
        this._processing = false;
        if (this._queue.length > 0) {
          setImmediate(() => this._drain());
        }
      });
    } else {
      this._processing = false;
      if (this._queue.length > 0) {
        setImmediate(() => this._drain());
      }
    }
  }
}
