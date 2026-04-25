"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type NavigationItem = {
  href: "/settings" | "/goals" | "/plan";
  label: string;
};

const navigationItems: NavigationItem[] = [
  { href: "/settings", label: "Settings" },
  { href: "/goals", label: "Goals" },
  { href: "/plan", label: "Plan" },
];

const authRoutePrefixes = ["/login"];

const isAuthRoute = (pathname: string): boolean =>
  authRoutePrefixes.some((prefix) => pathname.startsWith(prefix));

type AppShellProps = {
  children: React.ReactNode;
};

export const AppShell = ({ children }: AppShellProps) => {
  const pathname = usePathname();
  const isAuthPage = isAuthRoute(pathname);

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-full bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3 md:px-8">
          <Link href="/plan" className="text-sm font-semibold tracking-wide" aria-label="Open plan page">
            YNAPB
          </Link>
          <nav aria-label="Main navigation" className="flex items-center gap-2">
            {navigationItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={`Open ${item.label} page`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
};
