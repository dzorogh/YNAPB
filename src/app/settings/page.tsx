import { BudgetSettingsForm } from "@/components/settings/budget-settings-form";

export default function SettingsPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 md:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Connect your YNAB budget, save income settings, and run manual sync.
        </p>
      </header>
      <BudgetSettingsForm />
    </main>
  );
}
