import { Hono } from "hono";

import { kernel } from "@/kernel";
import type { Message } from "@/shared";
import { config } from "@/shared";

/**
 * Session-related route group.
 */
export const sessionRoutes = new Hono()
  .get("/", (c) => {
    const sessions = kernel.sessionManager.querySessions();
    return c.json(sessions);
  })
  .get("/:id/history", async (c) => {
    const id = c.req.param("id");
    let messages: Message[] = [];
    try {
      const file = Bun.file(config.paths.resolveSessionFilePath(id));
      const jsonl = (await file.text()).trim();
      messages = jsonl.split("\n").map((line) => JSON.parse(line));
    } catch (e) {
      return c.json({
        messages: [],
        error: `Failed to read session history: ${e}`,
      });
    }
    return c.json({ messages });
  });
