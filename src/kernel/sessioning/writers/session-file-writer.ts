import type { AssistantMessage, SystemMessage, UserMessage } from "@/shared";
import { config } from "@/shared";

import type { SessionWriter } from "./session-writer";
import { appendFile, ensureFile } from "./session-writer-utils";

/**
 * Appends message as JSON line to session .jsonl file.
 * Records every message (user, assistant, system) without filtering.
 */
export class SessionFileWriter implements SessionWriter {
  constructor(
    readonly sessionId: string,
    path?: string,
  ) {
    this._path = path ?? config.paths.resolveSessionFilePath(sessionId);
    ensureFile(this._path);
  }

  write(message: AssistantMessage | SystemMessage | UserMessage): void {
    if (message.role !== "system") {
      const line = JSON.stringify(message);
      appendFile(this._path, `${line}\n`);
    }
  }

  private _path: string;
}
