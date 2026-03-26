import { z } from "zod";

import type {
  AssistantMessage,
  SystemMessage,
  ToolMessage,
  UserMessage,
} from "../messaging";

/**
 * The options for the agent runner.
 */
export const AgentRunOptions = z.object({
  /**
   * Whether to start a new session.
   */
  isNewSession: z.boolean(),

  /**
   * The current working directory.
   */
  cwd: z.string(),

  /**
   * Runner-specific session/thread id used by some providers for true resume.
   */
  runnerSessionId: z.string().optional(),

  /**
   * Abort signal for cancelling the running task.
   * When aborted, the agent runner should kill any spawned subprocesses.
   */
  signal: z.instanceof(AbortSignal).optional(),
});
export interface AgentRunOptions extends z.infer<typeof AgentRunOptions> {}

/**
 * A wrapper of the real agent behind.
 * Used to interact with Agent, supporting streaming output
 */
export interface AgentRunner {
  /**
   * The type of the agent runner.
   */
  readonly type: string;

  /**
   * Streams the chunking messages from the agent.
   */
  stream(
    // eslint-disable-next-line no-unused-vars
    userMessage: UserMessage,
    // eslint-disable-next-line no-unused-vars
    options: AgentRunOptions,
  ): AsyncIterableIterator<SystemMessage | AssistantMessage | ToolMessage>;
}
