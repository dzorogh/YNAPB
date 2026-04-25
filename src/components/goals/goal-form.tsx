"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type GoalStatus = "active" | "frozen" | "completed";

export type GoalFormValues = {
  name: string;
  targetAmount: string;
  deadline: string;
  status: GoalStatus;
  notes: string;
  ynabCategoryId: string;
};

type GoalFormProps = {
  title: string;
  submitLabel: string;
  isSubmitting: boolean;
  initialValues?: GoalFormValues;
  onSubmit: (values: GoalFormValues) => Promise<void>;
  onCancel?: () => void;
  disabled?: boolean;
};

const defaultValues: GoalFormValues = {
  name: "",
  targetAmount: "",
  deadline: "",
  status: "active",
  notes: "",
  ynabCategoryId: "",
};

export const GoalForm = ({
  title,
  submitLabel,
  isSubmitting,
  initialValues,
  onSubmit,
  onCancel,
  disabled = false,
}: GoalFormProps) => {
  const [values, setValues] = useState<GoalFormValues>(initialValues ?? defaultValues);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    setValues(initialValues ?? defaultValues);
    setValidationError(null);
  }, [initialValues]);

  const isDisabled = disabled || isSubmitting;

  const handleChange = <TKey extends keyof GoalFormValues>(
    key: TKey,
    value: GoalFormValues[TKey],
  ) => {
    setValues((currentValues) => ({ ...currentValues, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationError(null);

    if (!values.name.trim()) {
      setValidationError("Goal name is required.");
      return;
    }

    const parsedTargetAmount = Number(values.targetAmount);
    if (!Number.isFinite(parsedTargetAmount) || parsedTargetAmount < 0) {
      setValidationError("Target amount must be a non-negative number.");
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.deadline)) {
      setValidationError("Deadline must be in YYYY-MM-DD format.");
      return;
    }

    await onSubmit(values);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <GoalFormFields
            title={title}
            values={values}
            isDisabled={isDisabled}
            onChange={handleChange}
          />

          {validationError ? (
            <p className="text-sm text-destructive" role="alert">
              {validationError}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={isDisabled}>
              {isSubmitting ? "Saving..." : submitLabel}
            </Button>
            {onCancel ? (
              <Button type="button" variant="outline" onClick={onCancel} disabled={isDisabled}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

type GoalFormFieldsProps = {
  title: string;
  values: GoalFormValues;
  isDisabled: boolean;
  onChange: <TKey extends keyof GoalFormValues>(
    key: TKey,
    value: GoalFormValues[TKey],
  ) => void;
};

const GoalFormFields = ({ title, values, isDisabled, onChange }: GoalFormFieldsProps) => (
  <>
    <div className="space-y-2">
      <Label htmlFor={`${title}-name`}>Name</Label>
      <Input
        id={`${title}-name`}
        value={values.name}
        onChange={(event) => onChange("name", event.target.value)}
        disabled={isDisabled}
        required
      />
    </div>

    <div className="space-y-2">
      <Label htmlFor={`${title}-target-amount`}>Target amount</Label>
      <Input
        id={`${title}-target-amount`}
        type="number"
        min={0}
        step="0.01"
        value={values.targetAmount}
        onChange={(event) => onChange("targetAmount", event.target.value)}
        disabled={isDisabled}
        required
      />
    </div>

    <div className="space-y-2">
      <Label htmlFor={`${title}-deadline`}>Deadline</Label>
      <Input
        id={`${title}-deadline`}
        type="date"
        value={values.deadline}
        onChange={(event) => onChange("deadline", event.target.value)}
        disabled={isDisabled}
        required
      />
    </div>

    <div className="space-y-2">
      <Label htmlFor={`${title}-status`}>Status</Label>
      <select
        id={`${title}-status`}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        value={values.status}
        onChange={(event) => onChange("status", event.target.value as GoalStatus)}
        disabled={isDisabled}
      >
        <option value="active">Active</option>
        <option value="frozen">Frozen</option>
        <option value="completed">Completed</option>
      </select>
    </div>

    <div className="space-y-2">
      <Label htmlFor={`${title}-notes`}>Notes</Label>
      <textarea
        id={`${title}-notes`}
        className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        value={values.notes}
        onChange={(event) => onChange("notes", event.target.value)}
        disabled={isDisabled}
      />
    </div>

    <div className="space-y-2">
      <Label htmlFor={`${title}-ynab-category-id`}>YNAB category id</Label>
      <Input
        id={`${title}-ynab-category-id`}
        value={values.ynabCategoryId}
        onChange={(event) => onChange("ynabCategoryId", event.target.value)}
        disabled={isDisabled}
      />
    </div>
  </>
);
