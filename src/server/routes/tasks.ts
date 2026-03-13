import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { kernel } from "@/kernel";
import { InboundMessageTaskPayload } from "@/shared";

/**
 * Task-related route group.
 */
export const taskRoutes = new Hono()
  .get("/", (c) => {
    const tasks = kernel.taskDispatcher.queryTasks();
    return c.json(tasks);
  })
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    try {
      await kernel.taskDispatcher.deleteTask(id);
      return c.body(null, 204);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Task not found:")) {
        throw new HTTPException(404, { message: err.message });
      }
      throw err;
    }
  })
  .post(
    "/dispatch",
    zValidator("json", InboundMessageTaskPayload),
    async (c) => {
      const body = await c.req.json().catch(() => null);
      const parsed = InboundMessageTaskPayload.safeParse(body);
      if (!parsed.success) {
        return c.json({ error: parsed.error.flatten() }, 400);
      }
      const jobId = await kernel.taskDispatcher.dispatch(
        parsed.data.message.session_id,
        parsed.data,
      );
      return c.json({ job_id: jobId });
    },
  );
