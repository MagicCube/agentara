import { z } from "zod";

/**
 * Configuration for a single agent.
 */
export const AgentConfig = z.object({
  type: z.string(),
  model: z.string().default("claude-sonnet-4-6"),
});
export interface AgentConfig extends z.infer<typeof AgentConfig> {}

/**
 * Configuration for all agents.
 */
export const AgentsConfig = z.object({
  default: AgentConfig,
});
export interface AgentsConfig extends z.infer<typeof AgentsConfig> {}

/**
 * Configuration for task dispatching.
 */
export const TaskingConfig = z.object({
  max_retries: z.number().int().positive(),
});
export interface TaskingConfig extends z.infer<typeof TaskingConfig> {}

/**
 * Key-value parameters for a messaging channel.
 */
export const ChannelParams = z.record(z.string(), z.string());
export type ChannelParams = z.infer<typeof ChannelParams>;

/**
 * Configuration for a single messaging channel.
 */
export const ChannelConfig = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  description: z.string(),
  params: ChannelParams,
});
export interface ChannelConfig extends z.infer<typeof ChannelConfig> {}

/**
 * Configuration for the messaging subsystem.
 */
export const MessagingConfig = z.object({
  default_channel_id: z.string(),
  channels: z.array(ChannelConfig),
});
export interface MessagingConfig extends z.infer<typeof MessagingConfig> {}

/**
 * Top-level application configuration loaded from config.yaml.
 */
export const AppConfig = z.object({
  /** IANA timezone identifier, e.g. `"Asia/Shanghai"`. Defaults to the system timezone. */
  timezone: z
    .string()
    .default(Intl.DateTimeFormat().resolvedOptions().timeZone),
  agents: AgentsConfig,
  tasking: TaskingConfig,
  messaging: MessagingConfig,
});
export interface AppConfig extends z.infer<typeof AppConfig> {}
