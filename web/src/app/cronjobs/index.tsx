import { createFileRoute } from "@tanstack/react-router";
import cronstrue from "cronstrue";
import dayjs from "dayjs";
import { CalendarClock, MoreHorizontal, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Tooltip } from "@/components/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useScheduledTaskDelete,
  useScheduledTasks,
  type ScheduledTask,
} from "@/lib/api";

export const Route = createFileRoute("/cronjobs/")({
  component: CronjobsPage,
});

function formatSchedule(schedule: ScheduledTask["schedule"]): string {
  if (schedule.at) {
    return "Once at " + dayjs(schedule.at).format("YYYY-MM-DD HH:mm");
  }
  const parts: string[] = [];
  if (schedule.pattern) {
    parts.push(
      "Recurring " +
        cronstrue
          .toString(schedule.pattern)
          .replace(/^At\s/, "at ")
          .replace(/^On\s/, "on ")
          .replace(/^In\s/, "in ")
          .replace(/^From\s/, "from ")
          .replace(/^Every\s/, "every "),
    );
  }
  if (schedule.every) {
    const ms = schedule.every;
    if (ms >= 86400000) parts.push(`every ${Math.round(ms / 86400000)}d`);
    else if (ms >= 3600000) parts.push(`every ${Math.round(ms / 3600000)}h`);
    else if (ms >= 60000) parts.push(`every ${Math.round(ms / 60000)}m`);
    else parts.push(`every ${ms}ms`);
  }
  if (schedule.limit) parts.push(`limit ${schedule.limit}`);
  if (schedule.immediately) parts.push("run immediately");
  const result = parts.length > 0 ? parts.join(", ") : "—";
  return result.charAt(0).toUpperCase() + result.slice(1);
}

function CronjobsPage() {
  const { data: tasks, isLoading } = useScheduledTasks();
  const deleteMutation = useScheduledTaskDelete();
  const [toDelete, setToDelete] = useState<ScheduledTask | null>(null);

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteMutation.mutateAsync(toDelete.id);
      toast.success("Scheduled task deleted");
      setToDelete(null);
    } catch {
      toast.error("Failed to delete scheduled task");
    }
  };

  if (isLoading && !tasks) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-6">
        <div className="container-md mx-auto w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Instruction</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Session</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-40" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  if (!isLoading && (!tasks || tasks.length === 0)) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CalendarClock />
          </EmptyMedia>
          <EmptyTitle>No cronjobs</EmptyTitle>
          <EmptyDescription>
            Create a scheduled task to run agents on a recurring schedule.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="container-md mx-auto w-full">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Instruction</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead>Session</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(tasks ?? []).map((task) => (
              <TableRow key={task.id}>
                <Tooltip content={task.instruction}>
                  <TableCell className="max-w-[640px] truncate font-medium">
                    {task.instruction}
                  </TableCell>
                </Tooltip>
                <TableCell className="text-muted-foreground text-xs">
                  {formatSchedule(task.schedule)}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {task.session_id ?? "Independent"}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {dayjs(task.created_at).format("YYYY-MM-DD HH:mm")}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        aria-label="Task menu"
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setToDelete(task)}
                      >
                        <Trash2 />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <AlertDialog
          open={!!toDelete}
          onOpenChange={(open) => !open && setToDelete(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete scheduled task?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the scheduled task &quot;
                {toDelete?.instruction}
                &quot;. It cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={(e) => {
                  e.preventDefault();
                  void handleDelete();
                }}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Deleting…" : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
