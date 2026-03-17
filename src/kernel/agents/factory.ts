import { ClaudeAgentRunner } from "@/community/anthropic";
import { CodexAgentRunner } from "@/community/openai";
import { DummyAgentRunner, MockAgentRunner, type AgentRunner } from "@/shared";

/**
 * Creates an agent runner based on the agent type.
 * @param agentType The type of the agent.
 * @returns The agent runner.
 */
export function createAgentRunner(agentType: string): AgentRunner {
  switch (agentType) {
    case "claude":
      return new ClaudeAgentRunner();
    case "codex":
      return new CodexAgentRunner();
    case "dummy":
      return new DummyAgentRunner();
    case "mock":
      return new MockAgentRunner(
        "user-home/sessions/34681283-bf20-4dc4-8301-a0929104002e.jsonl",
      );
    default:
      throw new Error(`Unknown agent type: ${agentType}`);
  }
}
