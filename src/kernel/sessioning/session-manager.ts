import { and, desc, eq } from "drizzle-orm";

import type { DrizzleDB } from "@/data";
import { config, createLogger, extractTextContent, uuid } from "@/shared";
import type { Session as SessionEntity, UserMessage } from "@/shared";

import { sessions } from "./data";
import { Session } from "./session";
import {
  SessionDailyLogWriter,
  SessionJSONLWriter,
  SessionLogWriter,
} from "./writers";

/**
 * Options for resolving, creating, or resuming a session.
 * Defaults come from config where applicable.
 */
export interface SessionResolveOptions {
  /**
   * The type of agent runner (e.g. "claude-code").
   * Defaults to `config.agents.default.type`.
   */
  agentType?: string;

  /**
   * The current working directory for the session.
   * Defaults to `config.paths.home`.
   */
  cwd?: string;

  /**
   * The first message of the session.
   */
  firstMessage?: UserMessage;
}

/**
 * Creates or resumes Session instances. Session metadata is stored in the
 * database; message content is still appended to `.jsonl` files on disk.
 */
export class SessionManager {
  private readonly _diaryWriter = new SessionDailyLogWriter();
  private readonly _logger = createLogger("session-manager");
  private readonly _db: DrizzleDB;

  constructor(db: DrizzleDB) {
    this._db = db;
  }

  /**
   * Start the session manager.
   */
  async start() {
    this._logger.info("Session manager started");
  }

  /**
   * Returns whether a session with the given id exists in the database.
   * @param sessionId - The session identifier.
   * @returns true if a row exists, false otherwise.
   */
  existsSession(sessionId: string): boolean {
    const row = this._db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .get();
    return row !== undefined;
  }

  /**
   * Resolves session by database existence: creates if missing, resumes if exists.
   * @param sessionId - The session identifier.
   * @param options - Optional agent_type and cwd (default from config).
   * @returns A Session instance.
   */
  async resolveSession(
    sessionId: string,
    options?: SessionResolveOptions,
  ): Promise<Session> {
    if (this.existsSession(sessionId)) {
      return this.resumeSession(sessionId, options);
    }
    return this.createSession(sessionId, options);
  }

  /**
   * Creates a new session and inserts a row into the database.
   * @param sessionId - The session identifier.
   * @param options - Optional agent_type and cwd (default from config).
   * @returns A Session instance with isNewSession: true.
   * @throws SessionAlreadyExistsError if the session already exists.
   */
  async createSession(
    sessionId = uuid(),
    options?: SessionResolveOptions,
  ): Promise<Session> {
    if (this.existsSession(sessionId)) {
      throw new SessionAlreadyExistsError(sessionId);
    }

    const agentType = options?.agentType ?? config.agents.default.type;
    const cwd = options?.cwd ?? config.paths.home;
    const now = Date.now();

    this._db
      .insert(sessions)
      .values({
        id: sessionId,
        agent_type: agentType,
        cwd,
        last_message_created_at: null,
        created_at: now,
        updated_at: now,
      })
      .run();

    if (options?.firstMessage) {
      this._updateFirstMessage(
        sessionId,
        extractTextContent(options.firstMessage),
      );
    }

    this._logger.info(`Creating session: ${sessionId}`);
    const session = new Session(sessionId, agentType, {
      isNewSession: true,
      cwd,
    });
    this._attachWriter(session, sessionId);

    return session;
  }

  /**
   * Resumes an existing session by reading its metadata from the database.
   * @param sessionId - The session identifier.
   * @param options - Optional overrides for agent_type and cwd.
   * @returns A Session instance with isNewSession: false.
   * @throws SessionNotFoundError if the session does not exist.
   */
  async resumeSession(
    sessionId: string,
    options?: Omit<SessionResolveOptions, "firstMessage">,
  ): Promise<Session> {
    const row = this._db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .get();

    if (!row) {
      throw new SessionNotFoundError(sessionId);
    }

    this._logger.info(`Resuming session: ${sessionId}`);
    const session = new Session(
      sessionId,
      options?.agentType ?? row.agent_type,
      {
        isNewSession: false,
        cwd: options?.cwd ?? row.cwd,
      },
    );
    this._attachWriter(session, sessionId);
    return session;
  }

  /**
   * Returns sessions ordered by `updated_at` descending.
   * @param limit - Maximum number of sessions to return (default 50).
   * @returns An array of session entities.
   */
  querySessions({ limit = 50 }: { limit?: number } = {}): SessionEntity[] {
    return this._db
      .select()
      .from(sessions)
      .orderBy(desc(sessions.updated_at))
      .limit(limit)
      .all();
  }

  /**
   * Updates the `last_message_created_at` and `updated_at` timestamps for a session.
   * @param sessionId - The session identifier.
   */
  private _updateLastMessageCreatedAt(sessionId: string): void {
    const now = Date.now();
    this._db
      .update(sessions)
      .set({ last_message_created_at: now, updated_at: now })
      .where(eq(sessions.id, sessionId))
      .run();
  }

  /**
   * Sets the `first_message` for a session if it is still empty (write-once semantics).
   * @param sessionId - The session identifier.
   * @param firstMessage - The text content of the first inbound message.
   */
  private _updateFirstMessage(sessionId: string, firstMessage: string): void {
    this._db
      .update(sessions)
      .set({
        first_message: firstMessage,
        last_message_created_at: Date.now(),
        updated_at: Date.now(),
      })
      .where(and(eq(sessions.id, sessionId), eq(sessions.first_message, "")))
      .run();
  }

  private _attachWriter(session: Session, sessionId: string): void {
    const fileWriter = new SessionJSONLWriter(sessionId);
    const logWriter = new SessionLogWriter(sessionId);
    session.on("message", (message) => {
      logWriter.write(message);
      fileWriter.write(message);
      this._diaryWriter.write(message);
      this._updateLastMessageCreatedAt(sessionId);
    });
  }
}

/**
 * Error thrown when attempting to create a session that already exists.
 */
export class SessionAlreadyExistsError extends Error {
  constructor(
    public readonly sessionId: string,
    message?: string,
  ) {
    super(message ?? `Session already exists: ${sessionId}`);
    this.name = "SessionAlreadyExistsError";
  }
}

/**
 * Error thrown when attempting to resume a session that does not exist.
 */
export class SessionNotFoundError extends Error {
  constructor(
    public readonly sessionId: string,
    message?: string,
  ) {
    super(message ?? `Session not found: ${sessionId}`);
    this.name = "SessionNotFoundError";
  }
}
