import EventEmitter from "eventemitter3";

import type {
  AgentRunOptions,
  AssistantMessage,
  Message,
  SystemMessage,
  ToolMessage,
  UserMessage,
} from "@/shared";

import { createAgentRunner } from "../agents";

export interface SessionEventTypes {
  // eslint-disable-next-line no-unused-vars
  message: (message: Message) => void;
}

/**
 * Represent a session context of the agent.
 */
export class Session extends EventEmitter {
  /**
   * Internal use only.
   * Initialize a session.
   * @param id The id of the session.
   * @param agentType The type of the agent.
   * @param options Run options (isNewSession, cwd).
   */
  constructor(
    // eslint-disable-next-line no-unused-vars
    readonly id: string,
    // eslint-disable-next-line no-unused-vars
    readonly agentType: string,
    // eslint-disable-next-line no-unused-vars
    readonly options: AgentRunOptions,
  ) {
    super();
  }

  /**
   * Return a stream of messages from the agent.
   * @param userMessage - The message to send to the agent.
   * @returns The stream of messages from the agent.
   */
  async stream(
    userMessage: UserMessage,
  ): Promise<
    AsyncIterableIterator<SystemMessage | AssistantMessage | ToolMessage>
  > {
    this.emit("message", userMessage);
    const runner = createAgentRunner(this.agentType);
    const rawStream = runner.stream(userMessage, {
      ...this.options,
    });
    this.options.isNewSession = false;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    async function* wrappedStream() {
      for await (const message of await rawStream) {
        self.emit("message", message);
        yield message;
      }
    }
    return wrappedStream();
  }

  /**
   * Send a message to the agent and return the last message.
   * @param userMessage - The message to send to the agent.
   * @returns The last message from the agent.
   */
  async run(userMessage: UserMessage): Promise<AssistantMessage> {
    const stream = await this.stream(userMessage);
    let lastMessage: AssistantMessage | undefined;
    for await (const message of stream) {
      if (message.role === "assistant") {
        lastMessage = message;
      }
    }
    if (lastMessage) {
      return lastMessage;
    }
    throw new Error("No message received from the agent.");
  }
}
