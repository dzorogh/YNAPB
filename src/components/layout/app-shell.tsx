"use client";

import { CalendarRange, Settings2, WalletCards } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type NavigationItem = {
  href: "/settings" | "/plan";
  label: string;
  icon: typeof CalendarRange;
};

const navigationItems: NavigationItem[] = [
  { href: "/plan", label: "Plan", icon: CalendarRange },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

const authRoutePrefixes = ["/login"];

const isAuthRoute = (pathname: string): boolean =>
  authRoutePrefixes.some((prefix) => pathname.startsWith(prefix));

type AppShellProps = {
  children: React.ReactNode;
};

const Brand = ({ compact = false }: { compact?: boolean }) => (
  <Link
    href="/plan"
    className="flex items-center gap-3 rounded-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
    aria-label="Open plan page"
  >
    <span className="relative flex size-10 items-center justify-center overflow-hidden rounded-[14px] bg-linear-to-br from-primary to-primary/55 text-primary-foreground shadow-[0_6px_20px_-6px] shadow-primary/50">
      <WalletCards className="size-[18px]" aria-hidden="true" />
    </span>
    <span className={cn(compact && "max-sm:sr-only")}>
      <span className="block text-[15px] font-semibold tracking-[-0.01em]">
        YNAPB
      </span>
      <span className="block text-[11px] text-muted-foreground">
        Goal planner for YNAB
      </span>
    </span>
  </Link>
);

const isActivePath = (pathname: string, href: string): boolean =>
  pathname === href || pathname.startsWith(`${href}/`);

const SidebarNavigation = ({ pathname }: { pathname: string }) => (
  <nav aria-label="Main navigation" className="flex flex-col gap-1">
    {navigationItems.map((item) => {
      const isActive = isActivePath(pathname, item.href);
      const Icon = item.icon;
      return (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "group flex h-12 items-center gap-3 rounded-[14px] px-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isActive
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          )}
          aria-current={isActive ? "page" : undefined}
          aria-label={`Open ${item.label} page`}
        >
          <span
            className={cn(
              "flex size-8 items-center justify-center rounded-[10px] transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "bg-muted/70 text-muted-foreground group-hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
          </span>
          {item.label}
        </Link>
      );
    })}
  </nav>
);

const MobileNavigation = ({ pathname }: { pathname: string }) => (
  <nav
    aria-label="Main navigation"
    className="flex items-center gap-1 rounded-full bg-muted p-1"
  >
    {navigationItems.map((item) => {
      const isActive = isActivePath(pathname, item.href);
      const Icon = item.icon;
      return (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isActive
              ? "bg-card text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground",
          )}
          aria-current={isActive ? "page" : undefined}
          aria-label={`Open ${item.label} page`}
        >
          <Icon
            className={cn("size-4", isActive && "text-primary")}
            aria-hidden="true"
          />
          {item.label}
        </Link>
      );
    })}
  </nav>
);

export const AppShell = ({ children }: AppShellProps) => {
  const pathname = usePathname();

  if (isAuthRoute(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="isolate flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 lg:flex">
        <div className="px-2 pt-2">
          <Brand />
        </div>
        <p className="mt-9 mb-2 px-3 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground/70 uppercase">
          Workspace
        </p>
        <SidebarNavigation pathname={pathname} />
        <div className="relative mt-auto overflow-hidden rounded-[18px] border border-primary/20 bg-card p-4">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-hero-glow"
          />
          <p className="relative text-sm font-semibold">Long-term goals.</p>
          <p className="relative mt-1 text-xs leading-5 text-accent-foreground/75">
            One clear month at a time. Plan here, then push targets to YNAB.
          </p>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-50 border-b bg-background/90 backdrop-blur lg:hidden">
          <div className="flex min-h-16 items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <Brand compact />
            <MobileNavigation pathname={pathname} />
          </div>
        </header>
        {children}
      </div>
    </div>
  );
};
