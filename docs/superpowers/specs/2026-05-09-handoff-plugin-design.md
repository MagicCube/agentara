# Handoff Plugin Design

**Date:** 2026-05-09
**Status:** Draft

## Overview

Handoff is a Claude Code plugin that relays an active Claude Code session to Agentara. The user types `/handoff` to transfer their session; the local session ends, and Agentara takes over by resuming the same Claude session.

## Architecture

```
Claude Code (local)                    Agentara
─────────────────                      ─────────
/handoff invoked
  → hook script extracts
    session_id, cwd
  → POST /api/handoff ──────────────→  sends Feishu notification
  → local session ends                 (with confirm button)

                                       user confirms in Feishu
                                         → dispatch task
                                         → resolveSession(session_id)
                                         → claude --resume <session_id>
```

## Plugin Side

### File Structure

```
handoff/
  .claude-plugin/
    plugin.json
  skills/
    handoff/
      SKILL.md
  hooks/
    hooks.json
  scripts/
    handoff.ts
```

### plugin.json

```json
{
  "name": "handoff",
  "version": "0.1.0",
  "description": "Handoff the current Claude Code session to Agentara",
  "author": { "name": "zhangwei.justin" },
  "userConfig": {
    "agentara_endpoint": {
      "type": "string",
      "title": "Agentara API endpoint",
      "description": "Agentara server base URL, defaults to http://localhost:1984"
    }
  }
}
```

### SKILL.md

Defines the `/handoff` slash command. When invoked, Claude acknowledges the handoff with a brief message and stops.

### hooks.json

Registers a `UserPromptSubmit` hook. On every prompt submission, `handoff.ts` is executed.

### handoff.ts (hook script)

1. Read hook JSON from stdin, extract `session_id`, `cwd`, `prompt`
2. If `prompt` does not start with `/handoff`, output `{"continue":true}` and exit 0
3. If `/handoff`, POST to `${endpoint}/api/handoff` with body `{session_id, cwd}`
4. On success, output `{"continue":false, "stopReason":"Session handed off to Agentara"}` and exit 0
5. On failure (Agentara unreachable), output `{"continue":true, "systemMessage":"Handoff failed: <error>"}` and exit 0 (non-blocking — user can retry)

## Agentara Side

### API Endpoint

`POST /api/handoff`

```
Request:  { session_id: string, cwd?: string }
Response: { status: "notified", session_id: string }
```

### Flow

1. **Receive handoff request** — endpoint validates input, sends Feishu notification with confirm/decline buttons
2. **User confirms** — Feishu callback creates an `InboundMessageTaskPayload` with `session_id` and message `"Please continue where we left off"`
3. **Task dispatched** — TaskDispatcher resolves the session and runs `claude --resume <session_id>` via ClaudeAgentRunner

### SessionManager Changes

`resolveSession` needs a `mode` option to distinguish handoff from normal creation. When `mode: "handoff"`, the session is created with `isNewSession: false` and `runnerSessionId` set to the session_id — signaling the runner to use `--resume` rather than `--session-id`.

### ClaudeAgentRunner Changes

Currently `ClaudeAgentRunner` uses `--session-id <id>` when `isNewSession: true` and `--resume <id>` when `isNewSession: false`. For handoff sessions, `isNewSession` is `false` (the session already exists in Claude's native store), and `runnerSessionId` carries the Claude session ID. The runner already handles this case — the handoff flow just needs SessionManager to pass the right options.

### No Session Pre-creation

The handoff endpoint does not touch the database. It only sends a notification. The session is created by SessionManager only when the user confirms and a task is dispatched — the existing `_handleInboundMessageTask` flow handles this naturally via `sessionManager.resolveSession()`.

## Error Handling

| Scenario | Behavior |
|---|---|
| Agentara unreachable | Hook script returns non-blocking error, local session continues, user can retry |
| Invalid session_id | Agentara returns 400, hook displays error, local session continues |
| Handoff session already exists in Agentara | resolveSession resumes it (idempotent) |
| User declines in Feishu | No task dispatched, session not created |