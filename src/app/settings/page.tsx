import { BudgetSettingsForm } from "@/components/settings/budget-settings-form";

export default function SettingsPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6 md:p-8">
      <header className="space-y-2">
        <p className="text-xs font-medium text-primary">Workspace</p>
        <h1 className="text-3xl font-semibold tracking-[-0.03em]">Settings</h1>
        <p className="max-w-xl text-sm leading-6 text-muted-foreground">
          Connect your YNAB budget, save income settings, and run manual sync.
        </p>
      </header>
      <BudgetSettingsForm />
    </main>
  );
}
