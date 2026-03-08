import { Link, useLocation } from "@tanstack/react-router";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface BreadcrumbItemConfig {
  label: string;
  href: string;
  isLast: boolean;
}

function buildBreadcrumbs(pathname: string): BreadcrumbItemConfig[] {
  const home = { label: "Home", href: "/", isLast: false };
  if (pathname === "/") {
    return [{ ...home, isLast: true }];
  }
  const segments = pathname.split("/").filter(Boolean);
  const items: BreadcrumbItemConfig[] = [home];

  const pathLabels: Record<string, string> = {
    memory: "Memory",
    sessions: "Sessions",
    skills: "Skills",
    tasks: "Tasks",
  };

  let href = "";
  for (let i = 0; i < segments.length; i++) {
    href += `/${segments[i]}`;
    const segment = segments[i];
    const isLast = i === segments.length - 1;
    const label = i === 0 ? (pathLabels[segment] ?? segment) : segment;
    items.push({ label, href, isLast });
  }
  return items;
}

export function AppBreadcrumb() {
  const { pathname } = useLocation();
  const breadcrumbs = buildBreadcrumbs(pathname);

  if (breadcrumbs.length === 0) {
    return null;
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {breadcrumbs.map((item, i) => (
          <span key={item.href + i} className="contents">
            {i > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem>
              {item.isLast ? (
                <BreadcrumbPage>{item.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link to={item.href}>{item.label}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </span>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
