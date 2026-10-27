"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAmount } from "@/lib/formatting/currency";

export type PushDiffRow = {
  categoryId: string;
  categoryName: string;
  current: number;
  next: number;
  clearsTargetDate?: boolean;
};

export type PushPreview = {
  targets: PushDiffRow[];
  /** Current-month assigned changes between goal categories. */
  assignedMoves: PushDiffRow[];
  /** Current-month assignments funded by Ready to Assign. */
  readyToAssignMoves: PushDiffRow[];
  readyToAssign: {
    available: number;
    remaining: number;
  };
};

type PushDiffDialogProps = {
  isOpen: boolean;
  preview: PushPreview;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
  isApplying: boolean;
};

const PushDiffTable = ({
  diffRows,
  currentLabel,
  nextLabel,
}: {
  diffRows: PushDiffRow[];
  currentLabel: string;
  nextLabel: string;
}) => (
  <div className="max-h-[55vh] overflow-auto rounded-md border">
    <table className="w-full min-w-[560px] text-sm">
      <thead className="sticky top-0 bg-muted/80 backdrop-blur">
        <tr className="border-b text-left">
          <th className="px-3 py-2 font-medium">Category</th>
          <th className="px-3 py-2 font-medium">{currentLabel}</th>
          <th className="px-3 py-2 font-medium">{nextLabel}</th>
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
            <td className="px-3 py-2">{formatAmount(row.current / 1000)}</td>
            <td className="px-3 py-2">
              {formatAmount(row.next / 1000)}
              {row.clearsTargetDate ? (
                <div className="text-xs text-muted-foreground">
                  Removes target date
                </div>
              ) : null}
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
      Current YNAB targets and assigned money already match the calculated plan
      for this month.
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
  preview,
  isApplying,
  onCancel,
  onConfirm,
}: {
  preview: PushPreview;
  isApplying: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) => {
  const hasNoChanges =
    preview.targets.length === 0 &&
    preview.assignedMoves.length === 0 &&
    preview.readyToAssignMoves.length === 0;
  const readyToAssignTotal = preview.readyToAssignMoves.reduce(
    (total, move) => total + move.next - move.current,
    0,
  );

  return (
    <Card className="max-h-[85vh] w-full max-w-3xl overflow-hidden">
      <CardHeader className="space-y-1">
        <CardTitle>Confirm YNAB goal updates</CardTitle>
        <p className="text-sm text-muted-foreground">
          Review targets and assigned money before applying.
        </p>
      </CardHeader>

      <CardContent className="min-h-0 space-y-4 overflow-y-auto">
        {hasNoChanges ? <NoChangesState /> : null}
        {preview.assignedMoves.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Money assigned above plan this month moves to goals that are
              short.
            </p>
            <PushDiffTable
              diffRows={preview.assignedMoves}
              currentLabel="Assigned now"
              nextLabel="Assigned after"
            />
          </div>
        ) : null}
        {preview.readyToAssignMoves.length > 0 ? (
          <div className="space-y-2">
            <div className="rounded-md bg-muted/50 p-3 text-sm">
              <p className="font-medium">
                Ready to Assign:{" "}
                {formatAmount(preview.readyToAssign.available / 1000)}
              </p>
              <p className="text-muted-foreground">
                Assigning to goals: {formatAmount(readyToAssignTotal / 1000)}.
                Remaining Ready to Assign:{" "}
                {formatAmount(preview.readyToAssign.remaining / 1000)}.
              </p>
            </div>
            <PushDiffTable
              diffRows={preview.readyToAssignMoves}
              currentLabel="Assigned now"
              nextLabel="Assigned after"
            />
          </div>
        ) : null}
        {preview.targets.length > 0 ? (
          <PushDiffTable
            diffRows={preview.targets}
            currentLabel="Current target"
            nextLabel="Next target"
          />
        ) : null}
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
            disabled={isApplying || hasNoChanges}
            aria-label="Apply YNAB push changes"
            onClick={() => void onConfirm()}
          >
            {isApplying ? "Applying..." : "Apply changes"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export const PushDiffDialog = ({
  isOpen,
  preview,
  onCancel,
  onConfirm,
  isApplying,
}: PushDiffDialogProps) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="YNAB push confirmation"
    >
      <PushDiffDialogBody
        preview={preview}
        isApplying={isApplying}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    </div>
  );
};
