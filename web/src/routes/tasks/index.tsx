import { createFileRoute } from "@tanstack/react-router";
import { ListTodo } from "lucide-react";

import { useTasks } from "@/api";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/tasks/")({
  component: TasksPage,
});

const statusColors: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-500",
  running: "bg-blue-500/20 text-blue-500",
  completed: "bg-green-500/20 text-green-500",
  failed: "bg-red-500/20 text-red-500",
};

function TasksPage() {
  const { data: tasks, isLoading } = useTasks();

  return (
    <div className="flex flex-1 flex-col gap-4 p-6 h-full">
      <ScrollArea className="flex-1 h-full">
        <div className="grid gap-3">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </CardHeader>
              </Card>
            ))
          ) : tasks?.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ListTodo />
                </EmptyMedia>
                <EmptyTitle>No tasks yet</EmptyTitle>
                <EmptyDescription>
                  Tasks will appear here when agents run.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            tasks?.map((task) => (
              <Card key={task.id}>
                <CardHeader className="flex-row items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <span className="truncate">{task.id}</span>
                      <span
                        className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColors[task.status] ?? ""}`}
                      >
                        {task.status}
                      </span>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {task.type} &middot;{" "}
                      {new Date(task.created_at).toLocaleString()}
                    </CardDescription>
                  </div>
                </CardHeader>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
