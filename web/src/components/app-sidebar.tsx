import { Link, useLocation } from "@tanstack/react-router";
import type { Session } from "agentara";
import Avatar from "boring-avatars";
import {
  BrainCircuitIcon,
  ListTodoIcon,
  MessagesSquareIcon,
} from "lucide-react";

import { useSessions } from "@/api";
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
import { cn } from "@/lib/utils";

const navItems = [
  { title: "Sessions", icon: MessagesSquareIcon, to: "/sessions" },
  { title: "Tasks", icon: ListTodoIcon, to: "/tasks" },
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
            {sessions!.slice(0, 10).map((session) => (
              <SidebarMenuItem key={session.id} className="max-w-60">
                <SidebarMenuButton
                  asChild
                  isActive={location.pathname === `/sessions/${session.id}`}
                  tooltip={session.id}
                >
                  <Link
                    to="/sessions/$sessionId"
                    params={{ sessionId: session.id }}
                  >
                    <span className="truncate">{session.first_message}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </ScrollArea>
      </SidebarGroupContent>
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
