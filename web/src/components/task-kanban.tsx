import { useAutoAnimate } from "@formkit/auto-animate/react";
import type { Task } from "agentara";
import dayjs from "dayjs";

import { Tooltip } from "@/components/tooltip";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { firstPartOfUUID } from "@/lib/utils/uuid";

import { Badge } from "./ui/badge";

const LANE_SKELETON_COUNTS = [2, 3, 1] as const;

const lanes = [
  {
    key: "pending",
    label: "Pending",
    color: "var(--kanban-board-circle-gray)",
  },
  {
    key: "running",
    label: "Running",
    color: "var(--kanban-board-circle-blue)",
  },
  {
    key: "done",
    label: "Completed or Failed",
    color: "var(--kanban-board-circle-green)",
  },
] as const;

interface TaskCardProps {
  task: Task;
  lane: (typeof lanes)[number];
  onCopyTaskId: (taskId: string) => void;
}

function TaskCard({ task, lane, onCopyTaskId }: TaskCardProps) {
  return (
    <Card className="bg-sidebar-accent text-white py-2 hover:bg-sidebar-accent/50">
      <CardHeader className="px-4">
        <Tooltip content="Click to copy">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onCopyTaskId(task.id);
            }}
            className="truncate text-left text-[10px] text-muted-foreground/40 font-medium hover:text-muted-foreground transition-colors cursor-pointer"
          >
            # {firstPartOfUUID(task.id)}...
          </button>
        </Tooltip>
        <CardTitle
          className="text-sm font-normal"
          style={{
            color:
              task.status === "failed"
                ? "var(--kanban-board-circle-red)"
                : lane.color,
          }}
        >
          {task.payload.type === "inbound_message" &&
            task.payload.message.content
              .map((content) => content.type === "text" && content.text)
              .join(" ")}
          {task.payload.type === "scheduled_task" && task.payload.instruction}
        </CardTitle>
        <CardDescription className="text-xs">
          {task.payload.type === "inbound_message" && "Inbound message"}
          {task.payload.type === "scheduled_task" && "Scheduled task"}, last
          updated {dayjs(task.updated_at).fromNow()}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

interface TaskKanbanLaneProps {
  lane: (typeof lanes)[number];
  tasks: Task[];
  onCopyTaskId: (taskId: string) => void;
}

function TaskKanbanLaneSkeleton({ cardCount }: { cardCount: number }) {
  return (
    <Card className="flex-1 py-4 bg-sidebar rounded-lg gap-0 pb-0">
      <CardHeader className="px-4">
        <div className="flex items-center gap-2">
          <Skeleton className="size-2 shrink-0 rounded-full" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="size-4 shrink-0 rounded" />
        </div>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 px-0">
        <div className="flex flex-col gap-2 pb-4 px-3">
          {Array.from({ length: cardCount }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-sidebar-accent/30 p-4">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="mt-2 h-4 w-full" />
              <Skeleton className="mt-2 h-3 w-24" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TaskKanbanLane({ lane, tasks, onCopyTaskId }: TaskKanbanLaneProps) {
  const [parent] = useAutoAnimate();
  return (
    <Card className="flex-1 py-4 bg-sidebar rounded-lg gap-0 pb-0">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
          <div
            className={cn("size-2 rounded-full")}
            style={{ backgroundColor: lane.color }}
          ></div>
          <div>{lane.label}</div>
          <Badge className="size-4 bg-muted-foreground">{tasks.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 px-0">
        <ScrollArea className="size-full">
          <div ref={parent} className="flex flex-col gap-2 pb-4 px-3">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                lane={lane}
                onCopyTaskId={onCopyTaskId}
              />
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

export function TaskKanban({
  className,
  tasks,
  isLoading,
  onCopyTaskId,
}: {
  className?: string;
  tasks: Task[];
  isLoading?: boolean;
  onCopyTaskId: (taskId: string) => void;
}) {
  if (isLoading) {
    return (
      <div className={cn("h-full flex justify-center items-center", className)}>
        <div className="flex w-full h-full gap-4 py-6">
          {lanes.map((_, i) => (
            <TaskKanbanLaneSkeleton
              key={lanes[i].key}
              cardCount={LANE_SKELETON_COUNTS[i]}
            />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className={cn("h-full flex justify-center items-center", className)}>
      <div className="flex w-full h-full gap-4 py-6">
        {lanes.map((lane) => {
          const filteredTasks = tasks.filter((task) => {
            if (lane.key === "done") {
              return task.status === "completed" || task.status === "failed";
            }
            return task.status === lane.key;
          });
          return (
            <TaskKanbanLane
              key={lane.key}
              lane={lane}
              tasks={filteredTasks}
              onCopyTaskId={onCopyTaskId}
            />
          );
        })}
      </div>
    </div>
  );
}
