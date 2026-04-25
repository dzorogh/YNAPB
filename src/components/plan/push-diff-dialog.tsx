"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatting/currency";

export type PushDiffRow = {
  categoryId: string;
  categoryName: string;
  current: number;
  next: number;
};

type PushDiffDialogProps = {
  isOpen: boolean;
  diffRows: PushDiffRow[];
  currencyCode: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
  isApplying: boolean;
};

const PushDiffTable = ({
  diffRows,
  currencyCode,
}: {
  diffRows: PushDiffRow[];
  currencyCode: string;
}) => (
  <div className="max-h-[55vh] overflow-auto rounded-md border">
    <table className="w-full min-w-[560px] text-sm">
      <thead className="sticky top-0 bg-muted/80 backdrop-blur">
        <tr className="border-b text-left">
          <th className="px-3 py-2 font-medium">Category</th>
          <th className="px-3 py-2 font-medium">Current target</th>
          <th className="px-3 py-2 font-medium">Next target</th>
        </tr>
      </thead>
      <tbody>
        {diffRows.map((row) => (
          <tr key={row.categoryId} className="border-b last:border-b-0">
            <td className="px-3 py-2">
              <div className="font-medium">{row.categoryName}</div>
              <div className="font-mono text-xs text-muted-foreground">
                {row.categoryId}
              </div>
            </td>
            <td className="px-3 py-2">
              {formatCurrency(row.current / 1000, currencyCode)}
            </td>
            <td className="px-3 py-2">
              {formatCurrency(row.next / 1000, currencyCode)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const NoChangesState = () => (
  <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm">
    <div className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400">
      <CheckCircle2 className="size-4" />
      No changes to apply
    </div>
    <p className="mt-1 text-muted-foreground">
      Current YNAB monthly funding already matches calculated plan for this
      month.
    </p>
  </div>
);

const PushWarning = () => (
  <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
    <div className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400">
      <AlertCircle className="size-4" />
      This action writes changes to YNAB
    </div>
    <p className="mt-1 text-muted-foreground">
      Re-run preview if your goals or synced YNAB data changed.
    </p>
  </div>
);

const PushDiffDialogBody = ({
  diffRows,
  currencyCode,
  isApplying,
  onCancel,
  onConfirm,
}: {
  diffRows: PushDiffRow[];
  currencyCode: string;
  isApplying: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) => (
  <Card className="max-h-[85vh] w-full max-w-3xl overflow-hidden">
    <CardHeader className="space-y-1">
      <CardTitle>Confirm YNAB goal updates</CardTitle>
      <p className="text-sm text-muted-foreground">
        Review current versus next monthly funding targets before applying.
      </p>
    </CardHeader>

    <CardContent className="space-y-4">
      {diffRows.length === 0 ? (
        <NoChangesState />
      ) : (
        <PushDiffTable diffRows={diffRows} currencyCode={currencyCode} />
      )}
      <PushWarning />

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={isApplying}
          aria-label="Cancel YNAB push"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="button"
          disabled={isApplying}
          aria-label="Apply YNAB push changes"
          onClick={() => void onConfirm()}
        >
          {isApplying ? "Applying..." : "Apply changes"}
        </Button>
      </div>
    </CardContent>
  </Card>
);

export const PushDiffDialog = ({
  isOpen,
  diffRows,
  currencyCode,
  onCancel,
  onConfirm,
  isApplying,
}: PushDiffDialogProps) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="YNAB push confirmation"
    >
      <PushDiffDialogBody
        diffRows={diffRows}
        currencyCode={currencyCode}
        isApplying={isApplying}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    </div>
  );
};
