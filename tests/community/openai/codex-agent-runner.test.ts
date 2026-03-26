import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, mock, test } from "bun:test";

// Mock config module before importing CodexAgentRunner
void mock.module("@/shared", () => ({
  config: {
    agents: {
      default: { type: "codex", model: "o3" },
    },
  },
  createLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  }),
  extractTextContent: (msg: { content: Array<{ type: string; text?: string }> }) =>
    msg.content
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n"),
  resolveInstructionFile: (path: string) => {
    try {
      return readFileSync(path, "utf-8");
    } catch {
      return null;
    }
  },
  uuid: () => "test-uuid",
}));

import { CodexAgentRunner } from "@/community/openai";

const SESSION_ID = "test-session-1";
const tempDirs: string[] = [];

function parse(line: string) {
  const runner = new CodexAgentRunner();
  return runner._parseStreamLine(line, SESSION_ID);
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("CodexAgentRunner._parseStreamLine", () => {
  test("returns SystemMessage for thread.started", () => {
    const line = JSON.stringify({
      type: "thread.started",
      thread_id: "thread-abc",
    });
    const msgs = parse(line);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({
      id: "thread-abc",
      session_id: SESSION_ID,
      role: "system",
      subtype: "init",
    });
  });

  test("returns AssistantMessage for agent_message item.completed", () => {
    const line = JSON.stringify({
      type: "item.completed",
      item: { id: "msg-1", type: "agent_message", text: "Hello world" },
    });
    const msgs = parse(line);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({
      id: "msg-1",
      session_id: SESSION_ID,
      role: "assistant",
      content: [{ type: "text", text: "Hello world" }],
    });
  });

  test("skips agent_message on item.started", () => {
    const line = JSON.stringify({
      type: "item.started",
      item: { id: "msg-1", type: "agent_message", text: "" },
    });
    const msgs = parse(line);
    expect(msgs).toHaveLength(0);
  });

  test("returns AssistantMessage with thinking for reasoning item.completed", () => {
    const line = JSON.stringify({
      type: "item.completed",
      item: { id: "r-1", type: "reasoning", text: "Let me think about this..." },
    });
    const msgs = parse(line);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({
      id: "r-1",
      session_id: SESSION_ID,
      role: "assistant",
      content: [{ type: "thinking", thinking: "Let me think about this..." }],
    });
  });

  test("returns AssistantMessage with tool_use for command_execution item.started", () => {
    const line = JSON.stringify({
      type: "item.started",
      item: {
        id: "cmd-1",
        type: "command_execution",
        command: "ls -la",
        aggregated_output: "",
        exit_code: null,
        status: "in_progress",
      },
    });
    const msgs = parse(line);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({
      id: "cmd-1",
      session_id: SESSION_ID,
      role: "assistant",
      content: [
        {
          type: "tool_use",
          name: "Bash",
          id: "cmd-1",
          input: { command: "ls -la" },
        },
      ],
    });
  });

  test("returns ToolMessage with tool_result for command_execution item.completed", () => {
    const line = JSON.stringify({
      type: "item.completed",
      item: {
        id: "cmd-1",
        type: "command_execution",
        command: "ls -la",
        aggregated_output: "file1.txt\nfile2.txt",
        exit_code: 0,
        status: "completed",
      },
    });
    const msgs = parse(line);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({
      id: "cmd-1-result",
      session_id: SESSION_ID,
      role: "tool",
      content: [
        {
          type: "tool_result",
          tool_use_id: "cmd-1",
          content: "file1.txt\nfile2.txt",
        },
      ],
    });
  });

  test("returns AssistantMessage and ToolMessage for file_change item.completed", () => {
    const line = JSON.stringify({
      type: "item.completed",
      item: {
        id: "fc-1",
        type: "file_change",
        changes: [
          { path: "src/index.ts", kind: "update" },
          { path: "src/utils.ts", kind: "add" },
        ],
        status: "completed",
      },
    });
    const msgs = parse(line);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toMatchObject({
      id: "fc-1",
      session_id: SESSION_ID,
      role: "assistant",
      content: [
        {
          type: "tool_use",
          name: "Edit",
          id: "fc-1",
          input: { file_path: "src/index.ts (+1 more)" },
        },
      ],
    });
    expect(msgs[1]).toMatchObject({
      id: "fc-1-result",
      session_id: SESSION_ID,
      role: "tool",
      content: [
        {
          type: "tool_result",
          tool_use_id: "fc-1",
          content: "File changes applied successfully",
        },
      ],
    });
  });

  test("returns AssistantMessage with tool_use for mcp_tool_call item.started", () => {
    const line = JSON.stringify({
      type: "item.started",
      item: {
        id: "mcp-1",
        type: "mcp_tool_call",
        server: "github",
        tool: "search_code",
        arguments: { query: "test" },
        status: "in_progress",
      },
    });
    const msgs = parse(line);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({
      id: "mcp-1",
      session_id: SESSION_ID,
      role: "assistant",
      content: [
        {
          type: "tool_use",
          name: "github__search_code",
          id: "mcp-1",
          input: { query: "test" },
        },
      ],
    });
  });

  test("returns ToolMessage for mcp_tool_call item.completed", () => {
    const line = JSON.stringify({
      type: "item.completed",
      item: {
        id: "mcp-1",
        type: "mcp_tool_call",
        server: "github",
        tool: "search_code",
        arguments: { query: "test" },
        result: { content: [{ type: "text", text: "found 5 results" }] },
        status: "completed",
      },
    });
    const msgs = parse(line);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({
      id: "mcp-1-result",
      session_id: SESSION_ID,
      role: "tool",
      content: [
        {
          type: "tool_result",
          tool_use_id: "mcp-1",
        },
      ],
    });
    // Verify content is serialized JSON
    const toolResult = msgs[0] as { content: Array<{ content: string }> };
    expect(toolResult.content[0]!.content).toContain("found 5 results");
  });

  test("returns AssistantMessage for web_search item.completed", () => {
    const line = JSON.stringify({
      type: "item.completed",
      item: {
        id: "ws-1",
        type: "web_search",
        query: "TypeScript best practices",
        action: "search",
      },
    });
    const msgs = parse(line);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toMatchObject({
      id: "ws-1",
      session_id: SESSION_ID,
      role: "assistant",
      content: [
        {
          type: "tool_use",
          name: "WebSearch",
          id: "ws-1",
          input: { query: "TypeScript best practices" },
        },
      ],
    });
    expect(msgs[1]).toMatchObject({
      id: "ws-1-result",
      session_id: SESSION_ID,
      role: "tool",
      content: [
        {
          type: "tool_result",
          tool_use_id: "ws-1",
          content: "Web search completed for: TypeScript best practices",
        },
      ],
    });
  });

  test("uses alternate query fields for web_search item.completed", () => {
    const line = JSON.stringify({
      type: "item.completed",
      item: {
        id: "ws-2",
        type: "web_search",
        search_query: "OpenAI API docs",
      },
    });
    const msgs = parse(line);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toMatchObject({
      id: "ws-2",
      session_id: SESSION_ID,
      role: "assistant",
      content: [
        {
          type: "tool_use",
          name: "WebSearch",
          id: "ws-2",
          input: { query: "OpenAI API docs" },
        },
      ],
    });
  });

  test("skips web_search without a usable query", () => {
    const line = JSON.stringify({
      type: "item.completed",
      item: {
        id: "ws-3",
        type: "web_search",
        query: "",
      },
    });
    const msgs = parse(line);
    expect(msgs).toHaveLength(0);
  });

  test("returns AssistantMessage for turn.failed", () => {
    const line = JSON.stringify({
      type: "turn.failed",
      error: { message: "Rate limit exceeded" },
    });
    const msgs = parse(line);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({
      session_id: SESSION_ID,
      role: "assistant",
      content: [{ type: "text", text: "Error: Rate limit exceeded" }],
    });
  });

  test("returns AssistantMessage for error event", () => {
    const line = JSON.stringify({
      type: "error",
      message: "Connection lost",
    });
    const msgs = parse(line);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({
      session_id: SESSION_ID,
      role: "assistant",
      content: [{ type: "text", text: "Error: Connection lost" }],
    });
  });

  test("returns empty array for turn.started", () => {
    const line = JSON.stringify({ type: "turn.started" });
    const msgs = parse(line);
    expect(msgs).toHaveLength(0);
  });

  test("returns empty array for turn.completed", () => {
    const line = JSON.stringify({
      type: "turn.completed",
      usage: { input_tokens: 100, cached_input_tokens: 0, output_tokens: 50 },
    });
    const msgs = parse(line);
    expect(msgs).toHaveLength(0);
  });

  test("returns empty array for invalid JSON", () => {
    const msgs = parse("not json at all");
    expect(msgs).toHaveLength(0);
  });

  test("returns empty array for unknown event type", () => {
    const line = JSON.stringify({ type: "custom.unknown" });
    const msgs = parse(line);
    expect(msgs).toHaveLength(0);
  });

  test("returns empty array for unknown item type", () => {
    const line = JSON.stringify({
      type: "item.completed",
      item: { id: "x-1", type: "unknown_type" },
    });
    const msgs = parse(line);
    expect(msgs).toHaveLength(0);
  });

  test("returns error item as assistant text message", () => {
    const line = JSON.stringify({
      type: "item.completed",
      item: { id: "err-1", type: "error", message: "Something went wrong" },
    });
    const msgs = parse(line);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({
      id: "err-1",
      session_id: SESSION_ID,
      role: "assistant",
      content: [{ type: "text", text: "Error: Something went wrong" }],
    });
  });

  test("runner type is codex", () => {
    const runner = new CodexAgentRunner();
    expect(runner.type).toBe("codex");
  });

  test("syncing AGENTS.md replaces Claude Code with Codex", () => {
    const cwd = mkdtempSync(join(tmpdir(), "agentara-codex-runner-"));
    tempDirs.push(cwd);
    writeFileSync(
      join(cwd, "CLAUDE.md"),
      "# Title\n\nAs Claude Code, you are the smartest coding agent.\n",
      "utf-8",
    );

    const runner = new CodexAgentRunner() as unknown as Record<
      string,
      CallableFunction
    >;
    runner["_syncAgentsMd"]!(cwd);

    const agents = readFileSync(join(cwd, "AGENTS.md"), "utf-8");
    expect(agents).toContain("As Codex, you are the smartest coding agent.");
    expect(agents).not.toContain("Claude Code");
  });

  test("builds resume args with runnerSessionId when available", () => {
    const runner = new CodexAgentRunner() as unknown as Record<
      string,
      CallableFunction
    >;
    const args = runner["_buildExecArgs"]!({
      isNew: false,
      resumeId: "codex-thread-123",
      prompt: "\"hello\"",
    }) as string[];

    expect(args).toContain("resume");
    expect(args).toContain("codex-thread-123");
    expect(args).toContain("--dangerously-bypass-approvals-and-sandbox");
    expect(args).not.toContain("--full-auto");
  });
});
