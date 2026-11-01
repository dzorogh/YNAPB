"use client";

import { CalendarRange, LayoutGrid, Table2 } from "lucide-react";
import { type ComponentProps, useEffect, useState } from "react";

import { PlanGoalCards } from "@/components/plan/plan-goal-cards";
import { PlanTable } from "@/components/plan/plan-table";
import { PlanTimeline } from "@/components/plan/plan-timeline";
import { cn } from "@/lib/utils";

type PlanView = "cards" | "timeline" | "monthly";

const VIEW_STORAGE_KEY = "ynapb.plan.view";

const VIEWS: Array<{ id: PlanView; label: string; icon: typeof LayoutGrid }> = [
  { id: "cards", label: "Cards", icon: LayoutGrid },
  { id: "timeline", label: "Timeline", icon: CalendarRange },
  { id: "monthly", label: "Monthly", icon: Table2 },
];

const isPlanView = (value: unknown): value is PlanView =>
  VIEWS.some((view) => view.id === value);

const usePersistedView = (): [PlanView, (view: PlanView) => void] => {
  const [view, setView] = useState<PlanView>("cards");

  useEffect(() => {
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (isPlanView(stored)) {
      setView(stored);
    }
  }, []);

  const updateView = (next: PlanView) => {
    setView(next);
    window.localStorage.setItem(VIEW_STORAGE_KEY, next);
  };

  return [view, updateView];
};

type PlanGoalsSectionProps = {
  cards: ComponentProps<typeof PlanGoalCards>;
  timeline: ComponentProps<typeof PlanTimeline>;
  table: ComponentProps<typeof PlanTable>;
};

export const PlanGoalsSection = ({
  cards,
  timeline,
  table,
}: PlanGoalsSectionProps) => {
  const [view, setView] = usePersistedView();

  return (
    <section aria-labelledby="plan-goals-title" className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="plan-goals-title"
          className="text-lg font-semibold tracking-[-0.01em]"
        >
          Goals
        </h2>
        <div
          role="group"
          aria-label="Goals view"
          className="flex rounded-full bg-muted p-1"
        >
          {VIEWS.map((item) => {
            const Icon = item.icon;
            const isActive = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => setView(item.id)}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
      {view === "cards" ? <PlanGoalCards {...cards} /> : null}
      {view === "timeline" ? <PlanTimeline {...timeline} /> : null}
      {view === "monthly" ? <PlanTable {...table} /> : null}
    </section>
  );
};
