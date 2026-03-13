import type { Job } from "bunqueue/client";
import { Queue, Worker } from "bunqueue/client";
import { desc, eq } from "drizzle-orm";

import type { DrizzleDB } from "@/data";
import type {
  ScheduledTaskPayload,
  Task,
  TaskPayload,
  TaskSchedule,
  Logger,
} from "@/shared";
import { config, createLogger, uuid } from "@/shared";

import { scheduledTasks, tasks } from "./data";

const QUEUE_NAME = "agentara:tasks";

/**
 * Internal wrapper that pairs a session ID with the task payload
 * for transport through the bunqueue job queue.
 */
interface TaskJobData {
  session_id: string | null;
  payload: TaskPayload;
  /** Scheduler ID for scheduled tasks; used to clean up one-shot rows after execution. */
  scheduler_id?: string;
}

/**
 * A function that processes a task payload of a specific type.
 * Errors thrown inside are caught by {@link TaskDispatcher}.
 * @param taskId - The bunqueue job ID for this task.
 * @param sessionId - The session that owns this task.
 * @param payload - The task payload.
 */
export type TaskHandler<P extends TaskPayload = TaskPayload> = (
  // eslint-disable-next-line no-unused-vars
  taskId: string,
  // eslint-disable-next-line no-unused-vars
  sessionId: string,
  // eslint-disable-next-line no-unused-vars
  payload: P,
) => Promise<void>;

/**
 * Options for creating a {@link TaskDispatcher}.
 */
export interface TaskDispatcherOptions {
  /**
   * Number of concurrent job slots in the bunqueue Worker.
   * Controls cross-session parallelism. Defaults to 4.
   */
  concurrency?: number;

  /**
   * The Drizzle database instance used to persist task lifecycle.
   */
  db: DrizzleDB;
}

/**
 * A persisted scheduled task row from the `scheduled_tasks` table.
 */
interface ScheduledTaskRow {
  id: string;
  session_id: string | null;
  instruction: string;
  schedule: TaskSchedule;
  created_at: number;
  updated_at: number;
}

/**
 * Manages task queuing, routing, and execution via bunqueue.
 *
 * Provides handler registration via {@link route}, per-session serial
 * execution (FIFO), and scheduled task management. The dispatcher itself does
 * not know about sessions or agents — execution logic is injected via
 * {@link route}.
 */
export class TaskDispatcher {
  private _concurrency: number;
  private _db: DrizzleDB;
  private _queue: Queue<TaskJobData>;
  private _worker: Worker<TaskJobData> | undefined;
  private _handlers: Map<string, TaskHandler>;
  /** Per-session promise chain for serial execution. */
  private _sessionLocks: Map<string, Promise<void>>;
  private _logger: Logger;

  constructor(options: TaskDispatcherOptions) {
    this._concurrency = options.concurrency ?? 4;
    this._db = options.db;
    this._handlers = new Map();
    this._sessionLocks = new Map();
    this._logger = createLogger("task-dispatcher");
    this._queue = new Queue<TaskJobData>(QUEUE_NAME, {
      embedded: true,
      defaultJobOptions: { attempts: config.tasking.max_retries },
    });
    // Stall detection is designed for distributed worker crash recovery.
    // In embedded (single-process) mode it is counterproductive: jobs waiting
    // in the _sessionLocks chain have a stale lastHeartbeat even though they
    // are actively queued, so the detector wrongly removes them from the
    // processing shard and causes "Job not found" errors on ack/fail.
    this._queue.setStallConfig({ enabled: false });
  }

  /**
   * Register a handler for a specific task type.
   * Must be called before {@link start}.
   * Throws if a handler for the given type is already registered.
   * @param type - The task payload type to handle.
   * @param handler - The async function that processes the payload.
   */
  route<T extends TaskPayload["type"]>(
    type: T,
    handler: TaskHandler<Extract<TaskPayload, { type: T }>>,
  ): this {
    if (this._handlers.has(type)) {
      throw new Error(`Handler already registered for task type: ${type}`);
    }
    this._handlers.set(type, handler as TaskHandler);
    return this;
  }

  /**
   * Dispatch a task for processing.
   * @param sessionId - The session that owns this task.
   * @param payload - The task payload to enqueue.
   * @returns The bunqueue job ID.
   */
  async dispatch(sessionId: string, payload: TaskPayload): Promise<string> {
    const jobData: TaskJobData = { session_id: sessionId, payload };
    const job = await this._queue.add(payload.type, jobData);
    const now = Date.now();
    this._db
      .insert(tasks)
      .values({
        id: job.id,
        session_id: sessionId,
        type: payload.type,
        status: "pending",
        payload,
        created_at: now,
        updated_at: now,
      })
      .run();
    return job.id;
  }

  /**
   * Register or update a scheduled task.
   * Persists the definition to the `scheduled_tasks` table and registers
   * a bunqueue job scheduler. Calling this again with the same
   * {@link sessionId} updates both the DB row and the scheduler.
   * @param sessionId - The session ID. When `null`, each trigger creates a fresh session (independent mode).
   * @param payload - The scheduled task payload describing what to do.
   * @param schedule - The schedule configuration describing when to do it.
   * @returns The scheduler ID for this scheduled task.
   */
  async scheduleTask(
    sessionId: string | null,
    payload: ScheduledTaskPayload,
    schedule: TaskSchedule,
  ): Promise<string> {
    const schedulerId = sessionId ?? uuid();
    const jobData: TaskJobData = {
      session_id: sessionId,
      payload,
      scheduler_id: schedulerId,
    };
    const now = Date.now();

    const at =
      schedule.at ??
      (schedule.delay !== undefined ? now + schedule.delay : undefined);
    if (at !== undefined) {
      if (at <= now) {
        throw new Error(
          `Schedule 'at' must be in the future (got ${at}, now ${now})`,
        );
      }
      const delayMs = at - now;
      const job = await this._queue.add("scheduled_task", jobData, {
        delay: delayMs,
        jobId: schedulerId,
      });
      const scheduleWithJobId = { at, _job_id: job.id };
      this._db
        .insert(scheduledTasks)
        .values({
          id: schedulerId,
          session_id: sessionId,
          instruction: payload.instruction,
          schedule: scheduleWithJobId,
          created_at: now,
          updated_at: now,
        })
        .onConflictDoUpdate({
          target: scheduledTasks.id,
          set: {
            instruction: payload.instruction,
            schedule: scheduleWithJobId,
            updated_at: now,
          },
        })
        .run();
      this._db
        .insert(tasks)
        .values({
          id: job.id,
          session_id: sessionId ?? schedulerId,
          type: "scheduled_task",
          status: "pending",
          payload,
          created_at: now,
          updated_at: now,
        })
        .run();
      this._logger.info(
        { scheduler_id: schedulerId, session_id: sessionId, at },
        "one-shot scheduled task registered",
      );
      return schedulerId;
    }

    this._db
      .insert(scheduledTasks)
      .values({
        id: schedulerId,
        session_id: sessionId,
        instruction: payload.instruction,
        schedule,
        created_at: now,
        updated_at: now,
      })
      .onConflictDoUpdate({
        target: scheduledTasks.id,
        set: {
          instruction: payload.instruction,
          schedule,
          updated_at: now,
        },
      })
      .run();

    await this._queue.upsertJobScheduler(
      schedulerId,
      {
        pattern: schedule.pattern,
        every: schedule.every,
        limit: schedule.limit,
        immediately: schedule.immediately,
      },
      { name: "scheduled_task", data: jobData },
    );
    this._logger.info(
      { scheduler_id: schedulerId, session_id: sessionId, schedule },
      "scheduled task registered",
    );
    return schedulerId;
  }

  /**
   * Update an existing scheduled task by its scheduler ID.
   * Updates the DB row and re-registers the bunqueue scheduler.
   * @param schedulerId - The scheduler ID (primary key) to update.
   * @param payload - The new scheduled task payload.
   * @param schedule - The new schedule configuration.
   * @param sessionId - Optional. When provided, updates the session ID.
   * @throws Error if no scheduled task exists with the given ID.
   */
  async updateScheduledTask(
    schedulerId: string,
    payload: ScheduledTaskPayload,
    schedule: TaskSchedule,
    sessionId?: string | null,
  ): Promise<void> {
    const row = this._db
      .select()
      .from(scheduledTasks)
      .where(eq(scheduledTasks.id, schedulerId))
      .get() as ScheduledTaskRow | undefined;
    if (!row) {
      throw new Error(`Scheduled task not found: ${schedulerId}`);
    }
    const newSessionId = sessionId !== undefined ? sessionId : row.session_id;
    const now = Date.now();
    const wasOneShot = row.schedule.at !== undefined;
    const sched = row.schedule;

    if (sched._job_id) {
      try {
        await this._queue.removeAsync(sched._job_id);
      } catch {
        // Job may have run or been removed
      }
    }

    if (!wasOneShot) {
      await this._queue.removeJobScheduler(schedulerId);
    }

    const at =
      schedule.at ??
      (schedule.delay !== undefined ? now + schedule.delay : undefined);
    if (at !== undefined) {
      if (at <= now) {
        throw new Error(
          `Schedule 'at' must be in the future (got ${at}, now ${now})`,
        );
      }
      const delayMs = at - now;
      const jobData: TaskJobData = {
        session_id: newSessionId,
        payload,
        scheduler_id: schedulerId,
      };
      const job = await this._queue.add("scheduled_task", jobData, {
        delay: delayMs,
        jobId: schedulerId,
      });
      const scheduleWithJobId = { at, _job_id: job.id };
      this._db
        .update(scheduledTasks)
        .set({
          session_id: newSessionId,
          instruction: payload.instruction,
          schedule: scheduleWithJobId,
          updated_at: now,
        })
        .where(eq(scheduledTasks.id, schedulerId))
        .run();
      this._db
        .insert(tasks)
        .values({
          id: job.id,
          session_id: newSessionId ?? schedulerId,
          type: "scheduled_task",
          status: "pending",
          payload,
          created_at: now,
          updated_at: now,
        })
        .run();
    } else {
      this._db
        .update(scheduledTasks)
        .set({
          session_id: newSessionId,
          instruction: payload.instruction,
          schedule,
          updated_at: now,
        })
        .where(eq(scheduledTasks.id, schedulerId))
        .run();
      const jobData: TaskJobData = {
        session_id: newSessionId,
        payload,
        scheduler_id: schedulerId,
      };
      await this._queue.upsertJobScheduler(
        schedulerId,
        {
          pattern: schedule.pattern,
          every: schedule.every,
          limit: schedule.limit,
          immediately: schedule.immediately,
        },
        { name: "scheduled_task", data: jobData },
      );
    }
    this._logger.info(
      { scheduler_id: schedulerId, schedule },
      "scheduled task updated",
    );
  }

  /**
   * Remove a scheduled task by its scheduler ID.
   * Deletes from the `scheduled_tasks` table and removes the bunqueue scheduler.
   * @param schedulerId - The scheduler ID (primary key) to remove.
   */
  async removeScheduledTask(schedulerId: string): Promise<void> {
    const row = this._db
      .select()
      .from(scheduledTasks)
      .where(eq(scheduledTasks.id, schedulerId))
      .get() as ScheduledTaskRow | undefined;
    const sched = row?.schedule;
    if (sched?._job_id) {
      try {
        await this._queue.removeAsync(sched._job_id);
      } catch {
        // Job may have run or been removed
      }
    }
    if (row && sched?.at === undefined) {
      await this._queue.removeJobScheduler(schedulerId);
    }
    this._db
      .delete(scheduledTasks)
      .where(eq(scheduledTasks.id, schedulerId))
      .run();
    this._logger.info({ scheduler_id: schedulerId }, "scheduled task deleted");
  }

  /**
   * Delete a task by ID. For pending jobs, removes from the queue.
   * Always deletes the persisted task row. For one-shot scheduled tasks,
   * also removes the scheduler row.
   * @param taskId - The task (job) ID to remove.
   * @throws Error if no task exists with the given ID.
   */
  async deleteTask(taskId: string): Promise<void> {
    const row = this._db.select().from(tasks).where(eq(tasks.id, taskId)).get();
    if (!row) {
      throw new Error(`Task not found: ${taskId}`);
    }
    try {
      await this._queue.removeAsync(taskId);
    } catch {
      // Job may have run or been removed
    }
    this._db.delete(tasks).where(eq(tasks.id, taskId)).run();

    // Clean up one-shot scheduled task row if this job was its delayed job
    const oneShot = this._db
      .select()
      .from(scheduledTasks)
      .all()
      .find((r) => (r.schedule as { _job_id?: string })?._job_id === taskId) as
      | ScheduledTaskRow
      | undefined;
    if (oneShot) {
      this._db
        .delete(scheduledTasks)
        .where(eq(scheduledTasks.id, oneShot.id))
        .run();
      this._logger.info(
        { scheduler_id: oneShot.id },
        "one-shot scheduled task deleted with task",
      );
    }
    this._logger.info({ task_id: taskId }, "task deleted");
  }

  /**
   * Query tasks across every state, sorted by creation time descending.
   * Unlike bunqueue's in-memory query, this reads from the persisted
   * `tasks` table and survives process restarts.
   * @param limit - Maximum number of tasks to return. Defaults to 50.
   * @returns An array of tasks in reverse chronological order.
   */
  queryTasks({ limit = 50 }: { limit?: number } = {}): Task[] {
    return this._db
      .select()
      .from(tasks)
      .orderBy(desc(tasks.created_at))
      .limit(limit)
      .all() as Task[];
  }

  /**
   * Get all persisted scheduled tasks from the database.
   * @returns An array of scheduled task rows.
   */
  getScheduledTasks(): ScheduledTaskRow[] {
    return this._db.select().from(scheduledTasks).all() as ScheduledTaskRow[];
  }

  /**
   * Start the worker. Must be called once during app startup.
   * Re-registers all persisted scheduled tasks with bunqueue.
   */
  async start() {
    await this._reloadScheduledTasks();

    this._worker = new Worker<TaskJobData>(
      QUEUE_NAME,
      (job) => this._processJob(job),
      {
        embedded: true,
        concurrency: this._concurrency,
        // Locks are TCP-mode only; embedded mode has no heartbeat to renew
        // them. With _sessionLocks chaining, hold time = wait + processing,
        // which easily exceeds DEFAULT_LOCK_TTL (30 s). Disable locks since
        // embedded mode uses subscription-based stall detection instead.
        useLocks: false,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    );
    this._worker.on("error", (err) => {
      this._logger.error({ err }, "worker error");
    });
    this._logger.info(
      "Task dispatcher started with concurrency: " + this._concurrency,
    );
  }

  /**
   * Gracefully shut down the worker and queue.
   */
  async stop(): Promise<void> {
    if (this._worker) {
      await this._worker.close();
    }
    this._queue.close();
    this._logger.info("task dispatcher stopped");
  }

  /**
   * Reload all scheduled tasks from the database and re-register them
   * with bunqueue's job scheduler.
   */
  private async _reloadScheduledTasks(): Promise<void> {
    const rows = this.getScheduledTasks();
    const now = Date.now();
    for (const row of rows) {
      const r = row as ScheduledTaskRow;
      const sched = r.schedule;
      const payload: ScheduledTaskPayload = {
        type: "scheduled_task",
        instruction: r.instruction,
      };
      const jobData: TaskJobData = {
        session_id: r.session_id,
        payload,
        scheduler_id: r.id,
      };

      if (sched.at !== undefined && sched.at > now) {
        const existing = await this._queue.getJob(sched._job_id ?? "");
        if (!existing) {
          const delay = sched.at - now;
          const job = await this._queue.add("scheduled_task", jobData, {
            delay,
            jobId: r.id,
          });
          const scheduleWithJobId = { ...sched, _job_id: job.id };
          this._db
            .update(scheduledTasks)
            .set({ schedule: scheduleWithJobId, updated_at: now })
            .where(eq(scheduledTasks.id, r.id))
            .run();
        }
      } else if (sched.at === undefined) {
        await this._queue.upsertJobScheduler(
          r.id,
          {
            pattern: sched.pattern,
            every: sched.every,
            limit: sched.limit,
            immediately: sched.immediately,
          },
          { name: "scheduled_task", data: jobData },
        );
      }
      // One-shot with at <= now: job ran or expired, leave row for display/cleanup
    }
    if (rows.length > 0) {
      this._logger.info(
        { count: rows.length },
        "reloaded scheduled tasks from database",
      );
    }
  }

  /**
   * Process a job from the queue. Acquires a per-session lock so that
   * tasks for the same session_id execute serially in FIFO order.
   */
  private async _processJob(job: Job<TaskJobData>): Promise<void> {
    const { payload } = job.data;
    const sessionId = job.data.session_id ?? uuid();

    const previous = this._sessionLocks.get(sessionId) ?? Promise.resolve();

    const current = previous.then(async () => {
      const handler = this._handlers.get(payload.type);
      if (!handler) {
        this._logger.warn(
          { session_id: sessionId, type: payload.type },
          "no handler registered for task type",
        );
        return;
      }
      this._updateTaskStatus(job.id, "running");
      try {
        const taskId = job.id;
        await handler(taskId, sessionId, payload);
        await job.updateProgress(100);
        this._updateTaskStatus(job.id, "completed");
        const schedulerId = job.data.scheduler_id;
        if (schedulerId) {
          const scheduled = this.getScheduledTasks().find(
            (r) => r.id === schedulerId,
          );
          if (scheduled?.schedule.at !== undefined) {
            await this.removeScheduledTask(schedulerId);
          }
        }
      } catch (err) {
        this._updateTaskStatus(job.id, "failed");
        this._logger.error(
          { session_id: sessionId, type: payload.type, err },
          "task failed",
        );
        throw err;
      }
    });

    this._sessionLocks.set(sessionId, current);
    await current;

    if (this._sessionLocks.get(sessionId) === current) {
      this._sessionLocks.delete(sessionId);
    }
  }

  /**
   * Update the status of a task in the database.
   */
  private _updateTaskStatus(id: string, status: string): void {
    this._db
      .update(tasks)
      .set({ status, updated_at: Date.now() })
      .where(eq(tasks.id, id))
      .run();
  }
}
