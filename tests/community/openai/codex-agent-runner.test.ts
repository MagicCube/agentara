import { describe, expect, test } from "bun:test";

import { CodexAgentRunner } from "@/community/openai";

const SESSION_ID = "test-session-1";

function parse(line: string) {
  const runner = new CodexAgentRunner();
  return runner._parseStreamLine(line, SESSION_ID);
}

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
          input: { changes: "update: src/index.ts\nadd: src/utils.ts" },
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
});
