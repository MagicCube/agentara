import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import type { Session } from "agentara";
import Avatar from "boring-avatars";
import {
  BrainCircuitIcon,
  CalendarClockIcon,
  ListTodoIcon,
  MessagesSquareIcon,
  MoreHorizontal,
  SparklesIcon,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { useSessionDelete, useSessions } from "@/lib/api";
import { cn } from "@/lib/utils";

const navItems = [
  { title: "Sessions", icon: MessagesSquareIcon, to: "/sessions" },
  { title: "Tasks", icon: ListTodoIcon, to: "/tasks" },
  { title: "Cronjobs", icon: CalendarClockIcon, to: "/cronjobs" },
  { title: "Skills", icon: SparklesIcon, to: "/skills" },
  { title: "Memory", icon: BrainCircuitIcon, to: "/memory" },
] as const;

function NavSidebarGroup() {
  const location = useLocation();
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {navItems.map((item) => (
            <SidebarMenuItem key={item.to}>
              <SidebarMenuButton
                asChild
                isActive={location.pathname === item.to}
                tooltip={item.title}
              >
                <Link to={item.to}>
                  <item.icon />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function RecentsSidebarGroup({
  loading,
  sessions,
}: {
  loading: boolean;
  sessions: Session[] | undefined;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const deleteMutation = useSessionDelete();
  const [toDelete, setToDelete] = useState<Session | null>(null);

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteMutation.mutateAsync(toDelete.id);
      if (location.pathname === `/sessions/${toDelete.id}`) {
        navigate({ to: "/sessions" });
      }
      toast.success("Session deleted");
      setToDelete(null);
    } catch {
      toast.error("Failed to delete session");
    }
  };

  if (loading) {
    return (
      <SidebarGroup>
        <SidebarGroupLabel>Recents</SidebarGroupLabel>
        <SidebarGroupContent>
          <ScrollArea className="max-h-64">
            <SidebarMenu>
              {Array.from({ length: 4 }).map((_, i) => (
                <SidebarMenuItem key={i}>
                  <SidebarMenuSkeleton showIcon />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </ScrollArea>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }
  if ((sessions?.length ?? 0) === 0) return null;
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Recents</SidebarGroupLabel>
      <SidebarGroupContent>
        <ScrollArea className="max-h-64">
          <SidebarMenu>
            {sessions!.slice(0, 50).map((session) => (
              <SidebarMenuItem
                key={session.id}
                className="group/menu relative max-w-60"
              >
                <div className="flex w-full items-center gap-0">
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === `/sessions/${session.id}`}
                    tooltip={session.id}
                    className="flex-1 min-w-0 rounded-r-none"
                  >
                    <Link
                      to="/sessions/$sessionId"
                      params={{ sessionId: session.id }}
                    >
                      <span className="truncate">
                        {session.first_message ? (
                          session.first_message
                        ) : (
                          <span className="text-muted-foreground/75">
                            (Empty)
                          </span>
                        )}
                      </span>
                    </Link>
                  </SidebarMenuButton>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        onClick={(e) => e.preventDefault()}
                        className={cn(
                          "absolute right-1 top-1/2 flex size-7 shrink-0 -translate-y-1/2 items-center justify-center rounded-md rounded-l-none border-l border-sidebar-border text-muted-foreground transition-opacity",
                          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                          "opacity-0 group-hover/menu:opacity-100",
                        )}
                        aria-label="Session menu"
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setToDelete(session)}
                      >
                        <Trash2 className="size-4" />
                        Delete session
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </ScrollArea>
      </SidebarGroupContent>
      <AlertDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete session</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The session and its history will be
              permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive! text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarGroup>
  );
}

/**
 * Main application sidebar with navigation, recent sessions, and user info.
 */
export function AppSidebar() {
  const { open } = useSidebar();
  const { data: sessions, isLoading: sessionsLoading } = useSessions();
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/">
                <div className="flex-1 text-left items-center justify-center">
                  <div className="flex font-serif text-lg text-primary">
                    <span className={cn(open ? "" : "translate-x-2")}>📯</span>
                    <span
                      className={cn(
                        "transition-opacity duration-300 font-medium translate-x-2",
                        open ? "" : "opacity-0",
                      )}
                    >
                      Agentara
                    </span>
                  </div>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <NavSidebarGroup />
        <RecentsSidebarGroup loading={sessionsLoading} sessions={sessions} />
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="Henry Li">
              <div className="flex items-center gap-2">
                <Avatar name="Henry Li" variant="beam" size={32} />
                <div className="grid flex-1 text-left leading-tight">
                  <span className="text-sm font-semibold">Henry Li</span>
                  <span className="text-xs text-muted-foreground">
                    Super Individual
                  </span>
                </div>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
