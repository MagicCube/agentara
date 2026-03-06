import { Link, createFileRoute } from "@tanstack/react-router";
import type { Session } from "agentara";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { CopyIcon, MessageSquare, MoreHorizontal, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useSessions } from "@/api";
import { Tooltip } from "@/components/tooltip";
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
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

dayjs.extend(relativeTime);

export const Route = createFileRoute("/sessions/")({
  component: SessionsPage,
});

function filterSessions(sessions: Session[], query: string): Session[] {
  const q = query.trim().toLowerCase();
  if (!q) return sessions;
  return sessions.filter(
    (s) =>
      s.first_message.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q),
  );
}

function SessionsPage() {
  const { data: sessions, isLoading } = useSessions();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSessions = useMemo(() => {
    if (!sessions) return [];
    return filterSessions(sessions, searchQuery);
  }, [sessions, searchQuery]);

  const handleCopySessionId = async (sessionId: string) => {
    await navigator.clipboard.writeText(sessionId);
    toast.info("Session ID copied to clipboard");
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-6 h-full">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search your chats..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="grid gap-3">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-lg border bg-card p-4">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="mt-2 h-3 w-32" />
              </div>
            ))
          ) : sessions?.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MessageSquare />
                </EmptyMedia>
                <EmptyTitle>No sessions yet</EmptyTitle>
                <EmptyDescription>
                  Start a conversation to create your first session.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : filteredSessions.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MessageSquare />
                </EmptyMedia>
                <EmptyTitle>No matches</EmptyTitle>
                <EmptyDescription>
                  No sessions match your search. Try a different query.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            filteredSessions.map((session: Session) => (
              <div
                key={session.id}
                className={cn(
                  "group flex items-center gap-3 rounded-lg border bg-card px-4 py-3 transition-colors",
                  "hover:bg-accent/50",
                )}
              >
                <Link
                  to="/sessions/$sessionId"
                  params={{ sessionId: session.id }}
                  className="min-w-0 flex-1"
                >
                  <div className="flex gap-3">
                    <div className="flex flex-col gap-2">
                      <Tooltip content="Click to copy">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleCopySessionId(session.id);
                          }}
                          className="truncate text-left text-[10px] text-muted-foreground/40 font-medium hover:text-muted-foreground transition-colors cursor-pointer"
                        >
                          {session.id}
                        </button>
                      </Tooltip>
                      <span className="truncate text-sm font-medium">
                        {session.first_message || "(No messages yet)"}
                      </span>
                      <Tooltip
                        content={dayjs(session.updated_at).format(
                          "YYYY-MM-DD HH:mm:ss",
                        )}
                      >
                        <span className="w-fit text-xs text-muted-foreground cursor-default">
                          Last message {dayjs(session.updated_at).fromNow()}
                        </span>
                      </Tooltip>
                    </div>
                  </div>
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => e.preventDefault()}
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors",
                        "hover:bg-accent hover:text-foreground",
                        "opacity-0 group-hover:opacity-100",
                      )}
                      aria-label="Session menu"
                    >
                      <MoreHorizontal className="size-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => handleCopySessionId(session.id)}
                    >
                      <CopyIcon />
                      Copy session ID
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
