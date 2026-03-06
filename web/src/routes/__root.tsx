import { createRootRoute, Outlet } from "@tanstack/react-router";

import { AppBreadcrumb } from "@/components/app-breadcrumb";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";

import "@/global.css";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="h-screen">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <AppBreadcrumb />
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        <div className="flex flex-1 min-h-0 flex-col">
          <Outlet />
        </div>
      </SidebarInset>
      <Toaster position="top-center" />
    </SidebarProvider>
  );
}
