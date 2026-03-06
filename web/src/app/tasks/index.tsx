import { createFileRoute } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";
import { toast } from "sonner";

import {
  Empty,
  EmptyMedia,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { useTasks } from "@/lib/api";

import { TaskKanban } from "../../components/task-kanban";

export const Route = createFileRoute("/tasks/")({
  component: TasksPage,
});

function TasksPage() {
  const { data: tasks, isLoading } = useTasks({ refreshInterval: 3000 });
  const handleCopyTaskId = async (taskId: string) => {
    await navigator.clipboard.writeText(taskId);
    toast.info("Task ID copied to clipboard");
  };
  if (isLoading) return <div>Loading...</div>;
  if (!tasks || tasks.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MessageSquare />
          </EmptyMedia>
          <EmptyTitle>No tasks yet</EmptyTitle>
          <EmptyDescription>
            Start a task to create your first task.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <TaskKanban
      className="container mx-auto"
      tasks={tasks}
      onCopyTaskId={handleCopyTaskId}
    />
  );
}
