import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  config,
  createLogger,
  extractTextContent,
  resolveInstructionFile,
  uuid,
  type ToolMessage,
  type AgentRunner,
  type AgentRunOptions,
  type AssistantMessage,
  type SystemMessage,
  type UserMessage,
} from "@/shared";

const logger = createLogger("codex-agent-runner");

/**
 * The agent runner for OpenAI Codex CLI.
 *
 * Spawns `codex exec --json --full-auto` and parses the JSONL event stream
 * produced by the Codex CLI into the Agentara message types.
 */
export class CodexAgentRunner implements AgentRunner {
  readonly type = "codex";

  async *stream(
    message: UserMessage,
    options: AgentRunOptions,
  ): AsyncIterableIterator<SystemMessage | AssistantMessage | ToolMessage> {
    const sessionId = message.session_id;
    const isNew = options?.isNewSession ?? false;
    const textContentOfUserMessage = JSON.stringify(
      extractTextContent(message),
    );

    // Sync CLAUDE.md → AGENTS.md on every invocation so Codex CLI always
    // picks up the latest content (e.g. updated @memory/USER.md).
    this._syncAgentsMd(options.cwd);

    const args = isNew
      ? [
          "codex",
          "exec",
          ...["--model", config.agents.default.model],
          "--json",
          "--full-auto",
          textContentOfUserMessage,
        ]
      : [
          "codex",
          "exec",
          ...["--model", config.agents.default.model],
          "--json",
          "--full-auto",
          "resume",
          sessionId,
          textContentOfUserMessage,
        ];

    const proc = Bun.spawn(args, {
      cwd: options.cwd,
      env: {
        ...Bun.env,
      },
      stderr: "pipe",
    });

    const decoder = new TextDecoder();
    const stderrChunks: Uint8Array[] = [];
    const stderrPipe = proc.stderr.pipeTo(
      new WritableStream({
        write(chunk) {
          stderrChunks.push(chunk);
        },
      }),
    );

    let buffer = "";
    let stdoutRaw = "";
    for await (const chunk of proc.stdout) {
      const decoded = decoder.decode(chunk, { stream: true });
      buffer += decoded;
      stdoutRaw += decoded;
      const lines = buffer.split("\n");
      buffer = lines.pop()!;
      for (const line of lines) {
        if (line.trim()) {
          const messages = this._parseStreamLine(line.trim(), sessionId);
          for (const msg of messages) {
            yield msg;
          }
        }
      }
    }

    if (buffer.trim()) {
      const messages = this._parseStreamLine(buffer.trim(), sessionId);
      for (const msg of messages) {
        yield msg;
      }
    }

    const exitCode = await proc.exited;
    await stderrPipe;
    if (exitCode !== 0) {
      const stderrText =
        stderrChunks.length > 0
          ? decoder.decode(Bun.concatArrayBuffers(stderrChunks))
          : "";
      const parts: string[] = [];
      if (stdoutRaw.trim()) {
        parts.push(`Stdout:\n${stdoutRaw.trim()}`);
      }
      if (stderrText.trim()) {
        parts.push(`Stderr:\n${stderrText.trim()}`);
      }
      const detail = parts.length > 0 ? `\n\n${parts.join("\n\n")}` : "";
      throw new Error(`Codex CLI exited with code ${exitCode}${detail}`);
    }
  }

  /**
   * Parses a single JSONL line from Codex CLI `exec --json` output
   * and maps it to zero or more Agentara messages.
   */
  _parseStreamLine(
    line: string,
    sessionId: string,
  ): Array<AssistantMessage | ToolMessage | SystemMessage> {
    try {
      const obj = JSON.parse(line);
      return this._mapEvent(obj, sessionId);
    } catch {
      return [];
    }
  }

  private _mapEvent(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    event: any,
    sessionId: string,
  ): Array<AssistantMessage | ToolMessage | SystemMessage> {
    const type: string | undefined = event?.type;
    if (!type) return [];

    switch (type) {
      case "thread.started": {
        const threadId: string = event.thread_id ?? sessionId;
        return [
          {
            id: threadId,
            session_id: sessionId,
            role: "system" as const,
            subtype: "init",
          },
        ];
      }

      case "item.started":
      case "item.updated":
      case "item.completed": {
        return this._mapItemEvent(event, sessionId);
      }

      case "turn.failed": {
        const errorMsg = event.error?.message ?? "Unknown turn failure";
        return [
          {
            id: uuid(),
            session_id: sessionId,
            role: "assistant" as const,
            content: [{ type: "text" as const, text: `Error: ${errorMsg}` }],
          },
        ];
      }

      case "error": {
        const errorMsg = event.message ?? "Unknown stream error";
        return [
          {
            id: uuid(),
            session_id: sessionId,
            role: "assistant" as const,
            content: [{ type: "text" as const, text: `Error: ${errorMsg}` }],
          },
        ];
      }

      default:
        return [];
    }
  }

  private _mapItemEvent(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    event: any,
    sessionId: string,
  ): Array<AssistantMessage | ToolMessage | SystemMessage> {
    const item = event.item;
    if (!item) return [];

    const itemId: string = item.id ?? uuid();
    const itemType: string | undefined = item.type;
    const eventType: string = event.type;

    switch (itemType) {
      case "agent_message": {
        if (eventType !== "item.completed") return [];
        return [
          {
            id: itemId,
            session_id: sessionId,
            role: "assistant" as const,
            content: [{ type: "text" as const, text: item.text ?? "" }],
          },
        ];
      }

      case "reasoning": {
        if (eventType !== "item.completed") return [];
        return [
          {
            id: itemId,
            session_id: sessionId,
            role: "assistant" as const,
            content: [
              { type: "thinking" as const, thinking: item.text ?? "" },
            ],
          },
        ];
      }

      case "command_execution": {
        if (eventType === "item.started") {
          return [
            {
              id: itemId,
              session_id: sessionId,
              role: "assistant" as const,
              content: [
                {
                  type: "tool_use" as const,
                  name: "Bash",
                  id: itemId,
                  input: { command: item.command ?? "" },
                },
              ],
            },
          ];
        }
        if (eventType === "item.completed") {
          return [
            {
              id: `${itemId}-result`,
              session_id: sessionId,
              role: "tool" as const,
              content: [
                {
                  type: "tool_result" as const,
                  tool_use_id: itemId,
                  content: item.aggregated_output ?? "",
                },
              ],
            },
          ];
        }
        return [];
      }

      case "file_change": {
        if (eventType !== "item.completed") return [];
        const changes: Array<{ path: string; kind: string }> =
          item.changes ?? [];
        const summary = changes
          .map(
            (c: { path: string; kind: string }) => `${c.kind}: ${c.path}`,
          )
          .join("\n");
        return [
          {
            id: itemId,
            session_id: sessionId,
            role: "assistant" as const,
            content: [
              {
                type: "tool_use" as const,
                name: "Edit",
                id: itemId,
                input: { changes: summary },
              },
            ],
          },
          {
            id: `${itemId}-result`,
            session_id: sessionId,
            role: "tool" as const,
            content: [
              {
                type: "tool_result" as const,
                tool_use_id: itemId,
                content:
                  item.status === "completed"
                    ? "File changes applied successfully"
                    : `File changes ${item.status ?? "unknown"}`,
              },
            ],
          },
        ];
      }

      case "mcp_tool_call": {
        if (eventType === "item.started") {
          return [
            {
              id: itemId,
              session_id: sessionId,
              role: "assistant" as const,
              content: [
                {
                  type: "tool_use" as const,
                  name: `${item.server ?? "mcp"}__${item.tool ?? "unknown"}`,
                  id: itemId,
                  input: item.arguments ?? {},
                },
              ],
            },
          ];
        }
        if (eventType === "item.completed") {
          const resultText = item.result?.content
            ? JSON.stringify(item.result.content)
            : item.error?.message ?? "";
          return [
            {
              id: `${itemId}-result`,
              session_id: sessionId,
              role: "tool" as const,
              content: [
                {
                  type: "tool_result" as const,
                  tool_use_id: itemId,
                  content: resultText,
                },
              ],
            },
          ];
        }
        return [];
      }

      case "web_search": {
        if (eventType !== "item.completed") return [];
        return [
          {
            id: itemId,
            session_id: sessionId,
            role: "assistant" as const,
            content: [
              {
                type: "tool_use" as const,
                name: "WebSearch",
                id: itemId,
                input: { query: item.query ?? "" },
              },
            ],
          },
          {
            id: `${itemId}-result`,
            session_id: sessionId,
            role: "tool" as const,
            content: [
              {
                type: "tool_result" as const,
                tool_use_id: itemId,
                content: `Web search completed for: ${item.query ?? ""}`,
              },
            ],
          },
        ];
      }

      case "error": {
        return [
          {
            id: itemId,
            session_id: sessionId,
            role: "assistant" as const,
            content: [
              {
                type: "text" as const,
                text: `Error: ${item.message ?? "Unknown error"}`,
              },
            ],
          },
        ];
      }

      default:
        return [];
    }
  }

  /**
   * Reads `CLAUDE.md` from `cwd`, resolves any `@path/file` imports, and
   * writes the result as `AGENTS.md` so the Codex CLI can pick it up as its
   * native instruction file.  Skips the write when the content is unchanged
   * to avoid unnecessary filesystem churn.
   */
  private _syncAgentsMd(cwd: string): void {
    try {
      const claudeMdPath = join(cwd, "CLAUDE.md");
      if (!existsSync(claudeMdPath)) {
        return;
      }

      const resolved = resolveInstructionFile(claudeMdPath, cwd);
      if (!resolved) {
        return;
      }

      const agentsMdPath = join(cwd, "AGENTS.md");

      // Skip write when contents are identical to avoid file-watcher churn.
      if (existsSync(agentsMdPath)) {
        const existing = readFileSync(agentsMdPath, "utf-8");
        if (existing === resolved) {
          return;
        }
      }

      writeFileSync(agentsMdPath, resolved, "utf-8");
      logger.info("Synced CLAUDE.md → AGENTS.md (with resolved imports)");
    } catch (err) {
      logger.warn({ err }, "Failed to sync CLAUDE.md → AGENTS.md");
    }
  }
}
