export const normalizeToMonthStart = (value: string): Date => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
};

export const monthStartFromDate = (value: Date): Date =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));

export const addMonths = (date: Date, months: number): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));

export const currentMonthStart = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
};

export const monthKeyFromDate = (value: Date): string =>
  `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;

export const monthStartFromKey = (value: string): Date => {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`Invalid month key: ${value}`);
  }

  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
};

export const monthsDiffInclusive = (
  currentMonth: Date,
  deadlineMonth: Date,
): number => {
  const yearDiff =
    deadlineMonth.getUTCFullYear() - currentMonth.getUTCFullYear();
  const monthDiff = deadlineMonth.getUTCMonth() - currentMonth.getUTCMonth();
  return yearDiff * 12 + monthDiff + 1;
};
