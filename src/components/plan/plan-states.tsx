import { CloudOff, PlugZap, RotateCw, Settings2 } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PAGE_CLASS_NAME =
  "mx-auto grid w-full max-w-[1280px] items-start gap-6 p-4 sm:p-6 md:p-8 lg:grid-cols-[minmax(0,1fr)_340px]";

const Bone = ({ className }: { className?: string }) => (
  <div className={cn("rounded-full bg-foreground/[0.07]", className)} />
);

const SkeletonCard = () => (
  <div className="rounded-[20px] border border-border/70 bg-card p-5">
    <div className="flex items-start justify-between">
      <Bone className="size-11 rounded-[14px]" />
      <Bone className="h-6 w-24" />
    </div>
    <Bone className="mt-4 h-4 w-40" />
    <Bone className="mt-2 h-3 w-56" />
    <Bone className="mt-5 h-2 w-full" />
    <div className="mt-3 flex justify-between">
      <Bone className="h-3 w-28" />
      <Bone className="h-3 w-16" />
    </div>
    <Bone className="mt-5 h-10 w-full rounded-[12px]" />
  </div>
);

const SkeletonPanel = ({ rows }: { rows: number }) => (
  <div className="rounded-[20px] border bg-card p-5">
    <Bone className="h-4 w-28" />
    <div className="mt-4 space-y-3">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex justify-between gap-4">
          <Bone className="h-3 w-24" />
          <Bone className="h-3 w-16" />
        </div>
      ))}
    </div>
  </div>
);

export const PlanLoadingState = () => (
  <main className={PAGE_CLASS_NAME} aria-busy="true">
    <p className="sr-only" role="status">
      Loading plan...
    </p>
    <div
      className="flex min-w-0 animate-pulse flex-col gap-6"
      aria-hidden="true"
    >
      <div className="relative overflow-hidden rounded-[24px] border border-primary/20 bg-card p-6 sm:p-7">
        <div className="pointer-events-none absolute inset-0 bg-hero-glow opacity-60" />
        <div className="relative">
          <Bone className="h-3 w-40" />
          <Bone className="mt-5 h-3 w-52" />
          <Bone className="mt-3 h-11 w-56 rounded-[12px]" />
          <Bone className="mt-3 h-3 w-72" />
          <div className="mt-6 flex gap-2">
            <Bone className="h-8 w-40" />
            <Bone className="h-8 w-20" />
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <Bone className="h-5 w-16" />
        <Bone className="h-10 w-64" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
    <div className="flex animate-pulse flex-col gap-4" aria-hidden="true">
      <SkeletonPanel rows={3} />
      <SkeletonPanel rows={2} />
      <Bone className="h-12 w-full rounded-[16px]" />
    </div>
  </main>
);

const PlanMessageState = ({
  icon: Icon,
  eyebrow,
  title,
  description,
  children,
}: {
  icon: typeof CloudOff;
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) => (
  <main className="mx-auto flex w-full max-w-[1280px] p-4 sm:p-6 md:p-8">
    <section className="relative w-full overflow-hidden rounded-[24px] border border-primary/20 bg-card px-6 py-12 sm:px-10 sm:py-16">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-hero-glow"
      />
      <div className="relative mx-auto flex max-w-md flex-col items-center text-center">
        <span className="flex size-14 items-center justify-center rounded-[18px] bg-primary/15 text-primary ring-1 ring-primary/25">
          <Icon className="size-6" aria-hidden="true" />
        </span>
        <p className="mt-5 text-[11px] font-semibold tracking-[0.06em] text-accent-foreground/80 uppercase">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.02em]">
          {title}
        </h1>
        <p className="mt-2 text-sm leading-6 text-accent-foreground/75">
          {description}
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          {children}
        </div>
      </div>
    </section>
  </main>
);

export const PlanUnavailableState = ({
  onRetry,
}: {
  onRetry: () => Promise<void>;
}) => (
  <PlanMessageState
    icon={CloudOff}
    eyebrow="Plan"
    title="Plan data is not available yet"
    description="We could not calculate your plan. Try again, or check the YNAB connection in settings."
  >
    <Button
      type="button"
      size="lg"
      className="rounded-[14px]"
      onClick={() => void onRetry()}
      aria-label="Retry loading plan"
    >
      <RotateCw aria-hidden="true" />
      Retry
    </Button>
    <Button
      variant="secondary"
      size="lg"
      className="rounded-[14px]"
      render={<Link href="/settings" />}
      aria-label="Go to settings"
    >
      <Settings2 aria-hidden="true" />
      Open settings
    </Button>
  </PlanMessageState>
);

export const PlanConnectState = () => (
  <PlanMessageState
    icon={PlugZap}
    eyebrow="Get started"
    title="Connect YNAB first"
    description="Plan requires YNAB connection and synced data before calculation can start."
  >
    <Button
      size="lg"
      className="rounded-[14px]"
      render={<Link href="/settings" />}
      aria-label="Go to settings"
    >
      <Settings2 aria-hidden="true" />
      Open settings
    </Button>
  </PlanMessageState>
);
