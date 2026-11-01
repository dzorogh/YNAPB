import { Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type GoalActionsProps = {
  goal: { id: string; name: string };
  disabled: boolean;
  /** Tailwind size classes for both icon buttons. */
  buttonClassName: string;
  iconClassName?: string;
  onOpenEditGoal: (goalId: string) => void;
  onOpenDeleteGoal: (goalId: string) => void;
};

export const GoalActions = ({
  goal,
  disabled,
  buttonClassName,
  iconClassName,
  onOpenEditGoal,
  onOpenDeleteGoal,
}: GoalActionsProps) => (
  <div className="flex shrink-0 gap-1">
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className={cn(
        "text-muted-foreground hover:text-foreground",
        buttonClassName,
      )}
      onClick={() => onOpenEditGoal(goal.id)}
      disabled={disabled}
      aria-label={`Edit goal ${goal.name}`}
    >
      <Pencil className={iconClassName} aria-hidden="true" />
    </Button>
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className={cn(
        "text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
        buttonClassName,
      )}
      onClick={() => onOpenDeleteGoal(goal.id)}
      disabled={disabled}
      aria-label={`Delete goal ${goal.name}`}
    >
      <Trash2 className={iconClassName} aria-hidden="true" />
    </Button>
  </div>
);
