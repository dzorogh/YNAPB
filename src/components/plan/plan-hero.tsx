import { formatAmount } from "@/lib/formatting/currency";
import { formatMonthLabel } from "@/lib/formatting/month-label";

type PlanHeroProps = {
  startMonth: string;
  plannedIncome: number;
  obligations: number;
  available: number;
  readyToAssign: number;
  goalsCount: number;
  atRiskCount: number;
};

const chipClassName =
  "inline-flex items-center gap-1.5 rounded-full bg-foreground/[0.07] px-3 py-1.5 text-xs text-accent-foreground/85";

export const PlanHero = ({
  startMonth,
  plannedIncome,
  obligations,
  available,
  readyToAssign,
  goalsCount,
  atRiskCount,
}: PlanHeroProps) => (
  <section
    aria-labelledby="plan-hero-title"
    className="relative overflow-hidden rounded-[24px] border border-primary/20 bg-card p-6 sm:p-7"
  >
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_140%_at_0%_0%,color-mix(in_oklab,var(--primary)_32%,transparent)_0%,color-mix(in_oklab,var(--accent)_70%,transparent)_45%,transparent_100%)]"
    />
    <div className="relative">
      <p className="flex flex-wrap items-center gap-x-2 text-[11px] font-semibold tracking-[0.06em] text-accent-foreground/80 uppercase">
        <span id="plan-hero-title">Plan overview</span>
        <span aria-hidden="true">·</span>
        <span>{formatMonthLabel(startMonth)}</span>
      </p>
      <p className="mt-3 text-sm text-accent-foreground/80">
        Available for goals this month
      </p>
      <p className="mt-1 text-4xl font-semibold tracking-[-0.04em] tabular-nums sm:text-5xl">
        {formatAmount(available)}
      </p>
      <p className="mt-2 text-sm text-accent-foreground/70">
        from planned income{" "}
        <span className="tabular-nums">{formatAmount(plannedIncome)}</span>{" "}
        after obligations{" "}
        <span className="tabular-nums">{formatAmount(obligations)}</span>
      </p>
      <ul className="mt-5 flex flex-wrap gap-2">
        <li className={chipClassName}>
          <span>Ready to Assign</span>
          <span className="font-semibold text-foreground tabular-nums">
            {formatAmount(readyToAssign)}
          </span>
        </li>
        <li className={chipClassName}>
          {goalsCount === 1 ? "1 goal" : `${goalsCount} goals`}
        </li>
        {atRiskCount > 0 ? (
          <li className={`${chipClassName} bg-destructive/15 text-destructive`}>
            {atRiskCount} at risk
          </li>
        ) : null}
      </ul>
    </div>
  </section>
);
