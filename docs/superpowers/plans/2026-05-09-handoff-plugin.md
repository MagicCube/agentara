# Handoff Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Claude Code plugin that relays the current session to Agentara via `/handoff`, and the Agentara-side API + session logic to receive and resume the session.

**Architecture:** A Claude Code plugin (hook + skill) captures `/handoff` and POSTs the session_id to a new `POST /api/handoff` endpoint on Agentara. Agentara pre-creates a session record with `runner_session_id` set, sends a Feishu notification via `postMessage` (which auto-creates a thread and maps it to the session_id), and waits for the user to reply in the Feishu thread to trigger `claude --resume`.

**Tech Stack:** TypeScript, Bun, Hono, Zod, Claude Code plugin system (hooks + skills)

---

### File Map

| File | Action | Responsibility |
|---|---|---|
| `src/shared/tasking/types/payload.ts` | Modify | Add `HandoffPayload` type |
| `src/shared/sessioning/types/session.ts` | Modify | Add `handoff` field to Session entity |
| `src/kernel/sessioning/data/schema.ts` | Modify | Add `handoff` column to sessions table |
| `src/kernel/sessioning/session-manager.ts` | Modify | Add `createHandoffSession()` method |
| `src/kernel/kernel.ts` | Modify | Expose `messageGateway` getter |
| `src/server/routes/handoff.ts` | Create | `POST /api/handoff` endpoint |
| `src/server/routes/index.ts` | Modify | Export handoffRoutes |
| `src/server/server.ts` | Modify | Mount handoff routes |
| `plugins/handoff/` | Create | Claude Code plugin (manifest, skill, hook, script) |

### Task 1: Add HandoffPayload type

**Files:**
- Modify: `src/shared/tasking/types/payload.ts`

- [ ] **Step 1: Add HandoffPayload schema**

Add this after the `ScheduledTaskPayload` definition:

```typescript
/**
 * Payload for a handoff request from a Claude Code plugin.
 */
export const HandoffPayload = z.object({
  type: z.literal("handoff"),
  session_id: z.string(),
  cwd: z.string().optional(),
});
export interface HandoffPayload extends z.infer<typeof HandoffPayload> {}
```

- [ ] **Step 2: Export HandoffPayload from the shared barrel**

Read `src/shared/index.ts` and verify `export * from "./tasking/types/payload"` already re-exports it. If the file re-exports from `./tasking`, the new type is automatically available.

- [ ] **Step 3: Commit**

```bash
git add src/shared/tasking/types/payload.ts
git commit -m "feat: add HandoffPayload type for handoff plugin integration"
```

### Task 2: Add `handoff` field to Session entity and DB schema

**Files:**
- Modify: `src/shared/sessioning/types/session.ts`
- Modify: `src/kernel/sessioning/data/schema.ts`

- [ ] **Step 1: Add `handoff` to the shared Session zod schema**

Read `src/shared/sessioning/types/session.ts`. Add `handoff` to the object:

```typescript
handoff: z.boolean().default(false),
```

after `runner_session_id`.

- [ ] **Step 2: Add `handoff` column to the Drizzle schema**

Read `src/kernel/sessioning/data/schema.ts`. Add to the `sessions` table definition:

```typescript
handoff: integer("handoff").default(0),
```

after `runner_session_id`.

- [ ] **Step 3: Commit**

```bash
git add src/shared/sessioning/types/session.ts src/kernel/sessioning/data/schema.ts
git commit -m "feat: add handoff flag to Session entity and DB schema"
```

### Task 3: Add `createHandoffSession()` to SessionManager

**Files:**
- Modify: `src/kernel/sessioning/session-manager.ts`

- [ ] **Step 1: Add `createHandoffSession` method**

Add this method after `createSession`:

```typescript
/**
 * Creates a session for a handoff from an external Claude Code instance.
 * The session already exists in Claude's native store, so it is created
 * with isNewSession: false and runnerSessionId set to signal --resume.
 *
 * @param sessionId - The Claude Code session identifier.
 * @param options - Optional agent_type, cwd, and channel_id.
 * @returns A Session instance with isNewSession: false.
 * @throws SessionAlreadyExistsError if the session already exists.
 */
async createHandoffSession(
  sessionId: string,
  options?: SessionResolveOptions,
): Promise<Session> {
  if (this.existsSession(sessionId)) {
    throw new SessionAlreadyExistsError(sessionId);
  }

  const agentType = options?.agentType ?? config.agents.default.type;
  const cwd = options?.cwd ?? config.paths.home;
  const channelId = options?.channelId ?? config.messaging.default_channel_id;
  const now = Date.now();

  this._db
    .insert(sessions)
    .values({
      id: sessionId,
      agent_type: agentType,
      cwd,
      channel_id: channelId,
      runner_session_id: sessionId,
      first_message: "Session handed off from Claude Code",
      handoff: 1,
      last_message_created_at: null,
      created_at: now,
      updated_at: now,
    })
    .run();

  this._logger.info(`Creating handoff session: ${sessionId}`);
  const session = new Session(sessionId, agentType, {
    isNewSession: false,
    cwd,
    runnerSessionId: sessionId,
  });
  this._attachWriter(session, sessionId);

  return session;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/kernel/sessioning/session-manager.ts
git commit -m "feat: add createHandoffSession for external Claude Code session relay"
```

### Task 4: Expose messageGateway on Kernel

**Files:**
- Modify: `src/kernel/kernel.ts`

- [ ] **Step 1: Add messageGateway getter**

After the `taskDispatcher` getter, add:

```typescript
get messageGateway(): MultiChannelMessageGateway {
  return this._messageGateway;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/kernel/kernel.ts
git commit -m "feat: expose messageGateway on Kernel for handoff route access"
```

### Task 5: Create POST /api/handoff endpoint

**Files:**
- Create: `src/server/routes/handoff.ts`
- Modify: `src/server/routes/index.ts`
- Modify: `src/server/server.ts`

- [ ] **Step 1: Create `src/server/routes/handoff.ts`**

```typescript
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import { kernel } from "@/kernel";
import { HandoffPayload, createLogger } from "@/shared";

const logger = createLogger("handoff-routes");

/**
 * Handoff-related route group.
 * Receives session relay requests from the Claude Code handoff plugin.
 */
export const handoffRoutes = new Hono().post(
  "/",
  zValidator("json", HandoffPayload),
  async (c) => {
    const body = c.req.valid("json");

    try {
      const session = await kernel.sessionManager.createHandoffSession(
        body.session_id,
        { cwd: body.cwd },
      );

      await kernel.messageGateway.postMessage({
        role: "assistant",
        session_id: session.id,
        content: [
          {
            type: "text",
            text: `Session \`${body.session_id}\` has been handed off from Claude Code. Reply to this message to continue.`,
          },
        ],
      });

      return c.json({ status: "notified", session_id: session.id });
    } catch (err) {
      if (
        err instanceof Error &&
        err.name === "SessionAlreadyExistsError"
      ) {
        return c.json(
          { error: "Session already exists", session_id: body.session_id },
          409,
        );
      }
      logger.error({ err }, "Failed to create handoff session");
      return c.json({ error: "Internal server error" }, 500);
    }
  },
);
```

- [ ] **Step 2: Export and mount the route**

Add to `src/server/routes/index.ts`:
```typescript
export { handoffRoutes } from "./handoff";
```

Add to imports in `src/server/server.ts`:
```typescript
import {
  cronjobsRoutes,
  handoffRoutes,
  healthRoutes,
  memoryRoutes,
  sessionRoutes,
  skillsRoutes,
  taskRoutes,
  usageRoutes,
} from "./routes";
```

Mount in `createApp()` after the existing routes:
```typescript
.route("/api/handoff", handoffRoutes)
```

- [ ] **Step 3: Commit**

```bash
git add src/server/routes/handoff.ts src/server/routes/index.ts src/server/server.ts
git commit -m "feat: add POST /api/handoff endpoint"
```

### Task 6: Create the handoff Claude Code plugin

**Files:**
- Create: `plugins/handoff/.claude-plugin/plugin.json`
- Create: `plugins/handoff/skills/handoff/SKILL.md`
- Create: `plugins/handoff/hooks/hooks.json`
- Create: `plugins/handoff/scripts/handoff.ts`

- [ ] **Step 1: Create plugin.json**

```json
{
  "name": "handoff",
  "version": "0.1.0",
  "description": "Handoff the current Claude Code session to Agentara for continued execution",
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

- [ ] **Step 2: Create SKILL.md**

```markdown
---
name: handoff
description: Relay the current Claude Code session to Agentara for continued execution
---

# Handoff

When invoked via `/handoff`, acknowledge the handoff with a brief message:

> Handing off this session to Agentara. Your local session will end now, and Agentara will continue where we left off.
```

- [ ] **Step 3: Create hooks.json**

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun ${CLAUDE_PLUGIN_ROOT}/scripts/handoff.ts"
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 4: Create handoff.ts**

```typescript
/**
 * Hook script for the handoff plugin.
 *
 * Reads hook JSON from stdin. If the user typed /handoff, extracts
 * session_id and cwd, posts them to Agentara, and signals Claude
 * Code to stop. Otherwise passes through.
 */

interface HookInput {
  session_id: string;
  cwd: string;
  prompt: string;
}

async function main(): Promise<void> {
  let input: HookInput;
  try {
    const raw = await Bun.stdin.text();
    input = JSON.parse(raw);
  } catch {
    process.stdout.write(JSON.stringify({ continue: true }) + "\n");
    process.exit(0);
  }

  if (!input.prompt.startsWith("/handoff")) {
    process.stdout.write(JSON.stringify({ continue: true }) + "\n");
    process.exit(0);
  }

  const endpoint =
    Bun.env.CLAUDE_PLUGIN_OPTION_AGENTARA_ENDPOINT || "http://localhost:1984";

  try {
    const res = await fetch(`${endpoint}/api/handoff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "handoff",
        session_id: input.session_id,
        cwd: input.cwd,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      process.stdout.write(
        JSON.stringify({
          continue: true,
          systemMessage:
            "Handoff failed: " + (err.error || res.statusText),
        }) + "\n",
      );
      process.exit(0);
    }

    process.stdout.write(
      JSON.stringify({
        continue: false,
        stopReason: "Session handed off to Agentara",
      }) + "\n",
    );
  } catch {
    process.stdout.write(
      JSON.stringify({
        continue: true,
        systemMessage:
          "Handoff failed: Agentara unreachable. Is the server running?",
      }) + "\n",
    );
  }
  process.exit(0);
}

main();
```

- [ ] **Step 5: Commit**

```bash
git add plugins/
git commit -m "feat: add handoff Claude Code plugin"
```

### Task 7: Verify end-to-end

- [ ] **Step 1: Run full type check**

Run: `bun check`
Expected: Clean output, no type errors.

- [ ] **Step 2: Start Agentara and test the handoff endpoint**

Run: `bun run dev` (in one terminal)

Test the endpoint directly:
```bash
curl -X POST http://localhost:1984/api/handoff \
  -H "Content-Type: application/json" \
  -d '{"type":"handoff","session_id":"test-123","cwd":"/tmp"}'
```
Expected: `{"status":"notified","session_id":"test-123"}`

Test idempotency:
```bash
curl -X POST http://localhost:1984/api/handoff \
  -H "Content-Type: application/json" \
  -d '{"type":"handoff","session_id":"test-123","cwd":"/tmp"}'
```
Expected: 409 `{"error":"Session already exists","session_id":"test-123"}`

- [ ] **Step 3: Install the plugin and test /handoff**

Install the plugin: `/plugin install directory:plugins/handoff`

In a Claude Code session, type `/handoff`. Verify:
- Local session ends with "Session handed off to Agentara"
- Feishu notification received (reply thread with "Reply here to continue")
- Reply to the Feishu notification
- Agentara dispatches the task and runs `claude --resume <session_id>`

- [ ] **Step 4: Commit any remaining changes**

```bash
git add -A
git commit -m "chore: finalize handoff integration"
```