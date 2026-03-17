# AgentRunner Design

## Overview

AgentRunner wraps underlying AI agents. Callers interact via streaming only. Session unifies different implementations; callers use Session, not AgentRunner directly.

Dependency flow: `community` → `shared`; `kernel` → `shared` + `community`. `shared` does not depend on `kernel` or `community`.

---

## shared/agents

### Purpose

Defines AgentRunner interface and AgentStreamOptions. No business logic or external calls.

### AgentStreamOptions

```ts
export const AgentStreamOptions = z.object({
  isNewSession: z.boolean(),
  cwd: z.string(),
});
```

- `isNewSession` — whether to start a new session
- `cwd` — current working directory

### AgentRunner Interface

```ts
export interface AgentRunner {
  readonly type: string;

  stream(
    message: UserMessage,
    options: AgentStreamOptions,
  ): AsyncIterableIterator<AssistantMessage | SystemMessage>;
}
```

- `type` — readonly string identifying the runner (e.g. `"claude"`)
- `stream(message, options)` — yields `AssistantMessage | SystemMessage`

### shared/agents Files

```
src/shared/agents/
├── agent-runner.ts   # AgentStreamOptions, AgentRunner interface
└── index.ts          # re-exports
```

---

## kernel/agents

### Scope

Provides `createAgentRunner(agentType)` factory. Returns the right AgentRunner per config. No hardcoded community modules; dispatches via switch on `agentType`.

### createAgentRunner

```ts
export function createAgentRunner(agentType: string): AgentRunner {
  switch (agentType) {
    case "claude":
      return new ClaudeAgentRunner();
    case "codex":
      return new CodexAgentRunner();
    default:
      throw new Error(`Unknown agent type: ${agentType}`);
  }
}
```

- Input: `agentType` (from config.yaml `default_agent` or Session)
- Output: AgentRunner instance
- Unknown type: throws `Error`

### kernel/agents Files

```
src/kernel/agents/
├── factory.ts   # createAgentRunner
└── index.ts     # re-exports
```

---

## Session (kernel/sessioning)

Session holds `id`, `agentType`, `cwd`. On `stream()` or `run()`, it uses `createAgentRunner(agentType)` and calls `runner.stream()`.

- `stream()` — returns `AsyncIterableIterator<AssistantMessage | UserMessage | SystemMessage>`
- `run()` — iterates until done, returns last `AssistantMessage`

Runner can be swapped without changing callers.

---

## community (implementation layer)

### ClaudeAgentRunner

Implements AgentRunner via spawn of `claude` CLI (Anthropic Claude Code).

- `type`: `"claude"`
- `stream`:
  - Uses `extractTextContent(message)` to convert UserMessage to text
  - Passes `--resume` or `--session-id` based on `isNewSession`
  - Uses `--output-format stream-json` to parse JSON lines
  - Maps parsed output to `SystemMessage` (subtype `init`) or `AssistantMessage`
- On non-zero exit: throws `Error`

### CodexAgentRunner

Implements AgentRunner via spawn of `codex exec --json --full-auto` (OpenAI Codex CLI).

- `type`: `"codex"`
- `stream`:
  - Uses `extractTextContent(message)` to convert UserMessage to text
  - Passes `resume <sessionId>` when resuming an existing session
  - Uses `--json` to parse JSONL event stream
  - Maps `thread.started` → `SystemMessage` (subtype `init`)
  - Maps `item.completed` with `agent_message` → `AssistantMessage` (text)
  - Maps `item.completed` with `reasoning` → `AssistantMessage` (thinking)
  - Maps `item.started` with `command_execution` → `AssistantMessage` (tool_use)
  - Maps `item.completed` with `command_execution` → `ToolMessage` (tool_result)
  - Maps `item.completed` with `file_change` → `AssistantMessage` (tool_use) + `ToolMessage` (tool_result)
  - Maps `item.started/completed` with `mcp_tool_call` → `AssistantMessage`/`ToolMessage`
  - Maps `item.completed` with `web_search` → `AssistantMessage` (tool_use)
- On non-zero exit: throws `Error`

### community Files

```
src/community/anthropic/
├── claude-agent-runner.ts
└── index.ts

src/community/openai/
├── codex-agent-runner.ts
└── index.ts
```

---

## Message Type Dependencies

From `shared/messaging`:

- `UserMessage` — input, `content` array (text, image_url, tool_result, etc.)
- `AssistantMessage` — output, `content` array
- `SystemMessage` — output, `subtype: "init"` (e.g. Claude Code startup)

Community implementations may use `extractTextContent()` to serialize UserMessage for CLI input.

---

## Adding a New Agent

1. Keep using existing interface in `shared/agents` (no changes)
2. Add `*AgentRunner` under `community/{provider}/`, implement AgentRunner
3. Add a case in `kernel/agents/factory.ts` → `createAgentRunner`
