import { DataConnection } from "@/data";
import type { AssistantMessage } from "@/shared";
import {
  createLogger,
  extractTextContent,
  type InboundMessageTaskPayload,
} from "@/shared";

import { HonoServer } from "../server";

import { SessionManager } from "./sessioning";
import * as sessioningSchema from "./sessioning/data";
import { TaskDispatcher } from "./tasking";
import * as taskingSchema from "./tasking/data";

/**
 * The kernel is the main entry point for the agentara application.
 * Lazy-creation singleton: the instance is created on first `getInstance()`.
 */
class Kernel {
  private _database!: DataConnection;
  private _sessionManager!: SessionManager;
  private _taskDispatcher!: TaskDispatcher;
  private _honoServer!: HonoServer;
  private _logger = createLogger("kernel");

  constructor() {
    this._initDatabase();
    this._initSessionManager();
    this._initTaskDispatcher();
    this._initServer();
  }

  get database(): DataConnection {
    return this._database;
  }

  get sessionManager(): SessionManager {
    return this._sessionManager;
  }

  get taskDispatcher(): TaskDispatcher {
    return this._taskDispatcher;
  }

  get honoServer(): HonoServer {
    return this._honoServer;
  }

  private _initDatabase(): void {
    this._database = new DataConnection({
      ...taskingSchema,
      ...sessioningSchema,
    });
  }

  private _initSessionManager(): void {
    this._sessionManager = new SessionManager(this._database.db);
  }

  private _initServer(): void {
    this._honoServer = new HonoServer();
  }

  private _initTaskDispatcher(): void {
    this._taskDispatcher = new TaskDispatcher({
      db: this._database.db,
    });
    this._taskDispatcher.route("inbound_message", this._inboundMessageHandler);
  }

  /**
   * Start the kernel.
   */
  async start(): Promise<void> {
    await this._sessionManager.start();
    await this._taskDispatcher.start();
    await this._honoServer.start();
  }

  private _inboundMessageHandler = async (
    taskId: string,
    sessionId: string,
    payload: InboundMessageTaskPayload,
  ) => {
    const inboundMessage = payload.message;
    const session = await this._sessionManager.resolveSession(sessionId, {
      firstMessage: inboundMessage,
    });
    this._logger.info(
      {
        task_id: taskId,
        session_id: sessionId,
        inbound_message: extractTextContent(inboundMessage),
      },
      "inbound_message handler executing",
    );
    const stream = await session.stream(inboundMessage);
    let lastMessage: AssistantMessage | undefined;
    for await (const message of stream) {
      if (message.role === "assistant") {
        lastMessage = message;
      }
    }
    if (!lastMessage) {
      throw new Error("No assistant message received from the agent.");
    }
    const outboundMessage = lastMessage;
    this._logger.info(
      {
        session_id: sessionId,
        inbound_message: extractTextContent(inboundMessage),
        outbound_message: extractTextContent(outboundMessage),
      },
      "inbound_message handler executed",
    );
  };
}

export const kernel = new Kernel();
