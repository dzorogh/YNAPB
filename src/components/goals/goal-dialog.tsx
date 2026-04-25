"use client";

import { useEffect } from "react";

import { GoalForm, type GoalFormValues } from "@/components/goals/goal-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type GoalDialogMode = "create" | "edit";

type GoalDialogProps = {
  mode: GoalDialogMode;
  isOpen: boolean;
  isSubmitting: boolean;
  initialValues?: GoalFormValues;
  disabled?: boolean;
  onClose: () => void;
  onSubmit: (values: GoalFormValues) => Promise<void>;
};

const titleByMode: Record<GoalDialogMode, string> = {
  create: "Create goal",
  edit: "Edit goal",
};

const submitLabelByMode: Record<GoalDialogMode, string> = {
  create: "Create goal",
  edit: "Save changes",
};

export const GoalDialog = ({
  mode,
  isOpen,
  isSubmitting,
  initialValues,
  disabled = false,
  onClose,
  onSubmit,
}: GoalDialogProps) => {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const timeout = window.setTimeout(() => {
      const firstField = document.getElementById("goal-dialog-name");
      firstField?.focus();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={titleByMode[mode]}
      tabIndex={-1}
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onClose();
        }
      }}
    >
      <Card
        className="w-full max-w-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <CardHeader className="space-y-1">
          <CardTitle>{titleByMode[mode]}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {mode === "create"
              ? "Create a new savings goal and sync it to YNAB."
              : "Update goal fields and sync changes to YNAB."}
          </p>
        </CardHeader>
        <CardContent>
          <GoalForm
            title={titleByMode[mode]}
            formIdPrefix="goal-dialog"
            submitLabel={submitLabelByMode[mode]}
            isSubmitting={isSubmitting}
            initialValues={initialValues}
            onSubmit={onSubmit}
            onCancel={onClose}
            disabled={disabled}
            variant="plain"
          />
        </CardContent>
      </Card>
    </div>
  );
};
