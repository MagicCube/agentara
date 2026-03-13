import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AssistantMessage,
  Message,
  Session,
  Skill,
  Task,
  TaskSchedule,
  ToolMessage,
  UserMessage,
} from "agentara";

import { api, apiFetch } from "./client";

/**
 * Fetches all sessions.
 */
export function useSessions() {
  return useQuery({
    queryKey: ["sessions"],
    queryFn: () =>
      api.sessions.$get().then((res) => res.json() as Promise<Session[]>),
  });
}

/**
 * Deletes a session by ID.
 */
export function useSessionDelete() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await api.sessions[":id"].$delete({
        param: { id: sessionId },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Delete failed: ${res.status} ${text}`);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
  });
}

/**
 * Fetches the message history for a given session.
 */
export function useSessionHistory(sessionId: string) {
  return useQuery({
    queryKey: ["sessions", sessionId, "history"],
    queryFn: () =>
      api.sessions[":id"].history
        .$get({ param: { id: sessionId } })
        .then(async (res) => {
          const { messages } = (await res.json()) as { messages: Message[] };
          const groupedMessages: Message[][] = [];
          for (const message of messages) {
            if (message.role === "user") {
              groupedMessages.push([message]);
            } else {
              groupedMessages[groupedMessages.length - 1].push(message);
            }
          }
          const groups: {
            inbound: UserMessage;
            steps: (AssistantMessage | ToolMessage)[];
            outbound?: AssistantMessage;
          }[] = [];
          for (const message of groupedMessages) {
            const lastMessage = message[message.length - 1];
            groups.push({
              inbound: message[0] as UserMessage,
              steps: message.slice(1) as (AssistantMessage | ToolMessage)[],
              outbound:
                lastMessage.role === "assistant"
                  ? (lastMessage as AssistantMessage | undefined)
                  : undefined,
            });
          }
          return { messages, groups };
        }),
    enabled: !!sessionId,
  });
}

/**
 * Fetches all current tasks.
 * @param options.refreshInterval - If set, refetches at this interval (ms) while the query is active.
 */
export function useTasks(options?: { refreshInterval?: number }) {
  return useQuery({
    queryKey: ["tasks"],
    queryFn: () =>
      api.tasks.$get().then((res) => res.json() as Promise<Task[]>),
    ...(options?.refreshInterval != null && {
      refetchInterval: options.refreshInterval,
    }),
  });
}

/**
 * Deletes a task by ID.
 */
export function useTaskDelete() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => {
      const res = await api.tasks[":id"].$delete({
        param: { id: taskId },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Delete failed: ${res.status} ${text}`);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

/**
 * Dispatches a new inbound message task.
 */
export function useTaskDispatch() {}

/** A scheduled task row from the API. */
export interface ScheduledTask {
  id: string;
  session_id: string | null;
  instruction: string;
  schedule: TaskSchedule;
  created_at: number;
  updated_at: number;
}

/**
 * Fetches all scheduled tasks.
 */
export function useScheduledTasks() {
  return useQuery({
    queryKey: ["scheduled-tasks"],
    queryFn: () => apiFetch<ScheduledTask[]>("/cronjobs"),
  });
}

/**
 * Deletes a scheduled task by scheduler ID.
 */
export function useScheduledTaskDelete() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (schedulerId: string) =>
      apiFetch(`/cronjobs/${schedulerId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["scheduled-tasks"] });
    },
  });
}

/** Payload for updating a scheduled task. */
export interface ScheduledTaskUpdatePayload {
  instruction: string;
  schedule: TaskSchedule;
  session_id?: string | null;
}

/**
 * Updates a scheduled task by scheduler ID.
 */
export function useScheduledTaskUpdate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      schedulerId,
      ...body
    }: ScheduledTaskUpdatePayload & { schedulerId: string }) =>
      apiFetch(`/cronjobs/${schedulerId}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["scheduled-tasks"] });
    },
  });
}

// --- Skills ---

/**
 * Fetches all installed Claude Code skills from `~/.claude/skills/`.
 */
export function useSkills() {
  return useQuery({
    queryKey: ["skills"],
    queryFn: () =>
      api.skills.$get().then((res) => res.json() as Promise<Skill[]>),
  });
}

// --- Memory ---

export type MemoryContent = { filename: string; content: string };

/**
 * Fetches USER.md content.
 */
export function useUserMemory() {
  return useQuery({
    queryKey: ["memory", "user"],
    queryFn: () =>
      api.memory.user
        .$get()
        .then((res) => res.json() as Promise<MemoryContent>),
  });
}

/**
 * Fetches SOUL.md content.
 */
export function useSoulMemory() {
  return useQuery({
    queryKey: ["memory", "soul"],
    queryFn: () =>
      api.memory.soul
        .$get()
        .then((res) => res.json() as Promise<MemoryContent>),
  });
}

/**
 * Updates USER.md content.
 */
export function useUserMemoryUpdate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      api.memory.user.$put({ json: { content } }).then((res) => res.json()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["memory", "user"] });
    },
  });
}

/**
 * Updates SOUL.md content.
 */
export function useSoulMemoryUpdate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      api.memory.soul.$put({ json: { content } }).then((res) => res.json()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["memory", "soul"] });
    },
  });
}
