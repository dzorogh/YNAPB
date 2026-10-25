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

const Brand = () => (
  <Link
    href="/plan"
    className="flex items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
    aria-label="Open plan page"
  >
    <span className="flex size-9 items-center justify-center rounded-[10px] bg-primary text-primary-foreground">
      <WalletCards className="size-[18px]" aria-hidden="true" />
    </span>
    <span>
      <span className="block text-sm font-semibold tracking-[-0.01em]">
        YNAPB
      </span>
      <span className="block text-[11px] text-muted-foreground">
        Financial planner
      </span>
    </span>
  </Link>
);

export const AppShell = ({ children }: AppShellProps) => {
  const pathname = usePathname();
  const isAuthPage = isAuthRoute(pathname);

  if (isAuthPage) {
    return <>{children}</>;
  }

  const navigation = (mobile = false) => (
    <nav
      aria-label="Main navigation"
      className={cn(
        "flex items-center gap-1",
        !mobile && "flex-col items-stretch",
      )}
    >
      {navigationItems.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "relative flex items-center gap-3 rounded-[10px] px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              mobile ? "h-10" : "h-11",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
            )}
            aria-current={isActive ? "page" : undefined}
            aria-label={`Open ${item.label} page`}
          >
            {!mobile && isActive ? (
              <span className="absolute top-1/2 -left-3 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
            ) : null}
            <Icon className="size-4" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="isolate flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-5 py-6 lg:flex">
        <div className="px-2">
          <Brand />
        </div>
        <div className="mt-10">{navigation()}</div>
        <div className="mt-auto border-t border-sidebar-border px-2 pt-5">
          <p className="text-xs leading-5 text-muted-foreground">
            Long-term goals.
            <br />
            One clear month at a time.
          </p>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur lg:hidden">
          <div className="flex min-h-16 items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <Brand />
            {navigation(true)}
          </div>
        </header>
        {children}
      </div>
    </div>
  );
};
